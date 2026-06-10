#!/usr/bin/env python3
"""Extract the Mungyo Gallery MOPV-120 (Renewal Color) catalogue.

Source: Mungyo's own MOPV colour chart (data/mungyo/source/
mopv-color-chart-web.png, 1512x3848, lossless). The bottom section
"MOPV 120 COLORS _ Renewal Color" is the current 120-colour assortment
(MOPV-120* boxes). The chart is a raster with no text layer, so unlike the
Sennelier extractor this one works geometrically:

  1. find the 6x20 grid of swatch rectangles (saturation histogram — pale
     swatches don't vote, they're filled in from the fitted grid),
  2. sample each swatch's median colour -> hex, crop it -> swatches/<code>.png,
  3. OCR each cell's "<code> <Name>" with the macOS Vision framework (via a
     JXA helper — tesseract proved unreliable on the chart's ~10px text).

Mungyo publishes no pigment, transparency or lightfastness data on the chart,
so those fields are empty/null. Names containing Gold/Silver/Metallic are
flagged iridescent.

macOS-only (sips + Vision); pure-stdlib Python otherwise.
"""

from __future__ import annotations

import json
import re
import statistics
import struct
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
DATA = ROOT / "data" / "mungyo"
SOURCE = DATA / "source" / "mopv-color-chart-web.png"
SWATCH_DIR = DATA / "swatches"

# The renewal section occupies the bottom of the chart (header at y~2890).
REGION_TOP = 2900
COLS, ROWS = 6, 20


# --- minimal BMP reader (sips converts the PNG for us) -----------------------

def read_bmp(path: Path) -> tuple[int, int, bytes, int, int]:
    """Return (width, height, pixel bytes, bytes-per-pixel, row stride). Top-down rows."""
    data = path.read_bytes()
    assert data[:2] == b"BM", "expected BMP"
    pix_offset = struct.unpack_from("<I", data, 10)[0]
    header_size = struct.unpack_from("<I", data, 14)[0]
    width, height = struct.unpack_from("<ii", data, 18)
    planes, bpp = struct.unpack_from("<HH", data, 26)
    compression = struct.unpack_from("<I", data, 30)[0]
    assert compression == 0 and bpp in (24, 32), f"unsupported BMP (bpp={bpp}, comp={compression})"
    bypp = bpp // 8
    stride = (width * bypp + 3) & ~3
    flipped = height > 0  # positive height = bottom-up storage
    height = abs(height)
    rows = data[pix_offset : pix_offset + stride * height]
    if flipped:  # normalise to top-down
        rows = b"".join(rows[(height - 1 - y) * stride : (height - y) * stride] for y in range(height))
    return width, height, rows, bypp, stride


def px(rows: bytes, stride: int, bypp: int, x: int, y: int) -> tuple[int, int, int]:
    o = y * stride + x * bypp
    b, g, r = rows[o], rows[o + 1], rows[o + 2]
    return r, g, b


def saturation(r: int, g: int, b: int) -> int:
    return max(r, g, b) - min(r, g, b)


# --- grid detection -----------------------------------------------------------

def find_bands(hist: list[int], threshold: int, min_len: int) -> list[tuple[int, int]]:
    """Contiguous index ranges where hist >= threshold."""
    bands, start = [], None
    for i, v in enumerate(hist + [0]):
        if v >= threshold and start is None:
            start = i
        elif v < threshold and start is not None:
            if i - start >= min_len:
                bands.append((start, i))
            start = None
    return bands


def detect_grid(width: int, height: int, rows: bytes, bypp: int, stride: int):
    """Fit the 6x20 swatch grid from saturated-pixel histograms."""
    def is_swatchy(x: int, y: int) -> bool:
        r, g, b = px(rows, stride, bypp, x, y)
        return saturation(r, g, b) > 40

    ys = range(REGION_TOP, height)
    xs = range(0, width)
    col_hist = [0] * width
    row_hist = [0] * height
    for y in ys:
        for x in xs:
            if is_swatchy(x, y):
                col_hist[x] += 1
                row_hist[y] += 1

    # Swatch columns are dense vertical stacks; text columns only have thin
    # noise. Thresholds are relative to the strongest column/row. Detection is
    # imperfect — pale/brown columns stay under the threshold, adjacent rows
    # can merge — so fit a uniform grid to whatever bands were found.
    col_bands = snap_grid(find_bands(col_hist, max(col_hist) // 6, 40), COLS)
    row_bands = snap_grid(find_bands(row_hist, max(row_hist) // 8, 8), ROWS)
    if len(col_bands) != COLS:
        sys.exit(f"expected {COLS} swatch columns, found {len(col_bands)}: {col_bands}")
    if len(row_bands) != ROWS:
        sys.exit(f"expected {ROWS} swatch rows, found {len(row_bands)}: {row_bands}")
    return col_bands, row_bands


def snap_grid(bands: list[tuple[int, int]], count: int) -> list[tuple[int, int]]:
    """Fit `count` evenly pitched bands to the (possibly incomplete) detections."""
    if len(bands) < 2:
        return bands
    size = int(statistics.median(b1 - b0 for b0, b1 in bands if b1 - b0 < 2 * (bands[0][1] - bands[0][0])))
    starts = [b[0] for b in bands]
    diffs = [b - a for a, b in zip(starts, starts[1:])]
    pitch = statistics.median(d for d in diffs if d <= min(diffs) * 1.5)
    return [(round(starts[0] + i * pitch), round(starts[0] + i * pitch) + size) for i in range(count)]


# --- per-cell extraction ------------------------------------------------------

def median_hex(rows: bytes, stride: int, bypp: int, x0: int, y0: int, x1: int, y1: int) -> str:
    """Median colour of the central 60% of a swatch box."""
    dx, dy = (x1 - x0) // 5, (y1 - y0) // 5
    rs, gs, bs = [], [], []
    for y in range(y0 + dy, y1 - dy):
        for x in range(x0 + dx, x1 - dx):
            r, g, b = px(rows, stride, bypp, x, y)
            rs.append(r); gs.append(g); bs.append(b)
    med = (statistics.median(rs), statistics.median(gs), statistics.median(bs))
    return "#%02X%02X%02X" % tuple(int(v) for v in med)


def sips_crop(src: Path, out: Path, x: int, y: int, w: int, h: int, scale: int = 1) -> None:
    # sips mis-applies -c and -z combined in one call; run them separately.
    subprocess.run(
        ["sips", "-c", str(h), str(w), "--cropOffset", str(y), str(x), str(src), "--out", str(out)],
        check=True, capture_output=True,
    )
    if scale != 1:
        subprocess.run(
            ["sips", "-z", str(h * scale), str(w * scale), str(out)],
            check=True, capture_output=True,
        )


# JXA helper: Vision text recognition with word-level bounding boxes.
VISION_OCR_JS = """
ObjC.import('Vision');
ObjC.import('Foundation');
function run(argv) {
  const url = $.NSURL.fileURLWithPath(argv[0]);
  const handler = $.VNImageRequestHandler.alloc.initWithURLOptions(url, $.NSDictionary.dictionary);
  const req = $.VNRecognizeTextRequest.alloc.init;
  req.recognitionLevel = 0; // accurate
  req.usesLanguageCorrection = true;
  handler.performRequestsError($.NSArray.arrayWithObject(req), Ref());
  const results = req.results;
  const out = [];
  for (let i = 0; i < results.count; i++) {
    const obs = results.objectAtIndex(i);
    const text = obs.topCandidatesWithCount
      ? obs.topCandidatesWithCount(1).objectAtIndex(0).string.js
      : obs.topCandidates(1).objectAtIndex(0).string.js;
    const bb = obs.boundingBox; // normalised, origin bottom-left
    out.push(JSON.stringify({ text, x: bb.origin.x, y: bb.origin.y, w: bb.size.width, h: bb.size.height }));
  }
  return out.join('\\n');
}
"""


class Obs:
    """One recognised text run, in chart pixel coordinates."""

    def __init__(self, text: str, x: int, y_mid: int):
        self.text, self.x, self.y_mid = text, x, y_mid


def vision_ocr(src: Path, y0: int, h: int, w: int, tmp: Path) -> list[Obs]:
    """OCR the renewal strip; return text runs in original-image coordinates."""
    strip = tmp / "strip.png"
    sips_crop(src, strip, 0, y0, w, h)
    helper = tmp / "visionocr.js"
    helper.write_text(VISION_OCR_JS)
    res = subprocess.run(
        ["osascript", "-l", "JavaScript", str(helper), str(strip)],
        check=True, capture_output=True, text=True,
    )
    obs = []
    for line in res.stdout.splitlines():
        if not line.strip().startswith("{"):
            continue
        o = json.loads(line)
        # Vision's boxes are normalised with the origin bottom-left.
        x = round(o["x"] * w)
        y_mid = y0 + round((1 - o["y"] - o["h"] / 2) * h)
        obs.append(Obs(o["text"].strip(), x, y_mid))
    return obs


def parse_code(token: str) -> str | None:
    return token if re.fullmatch(r"[23]\d\d", token) else None


NAME_RUN = re.compile(r"^[A-Za-z][A-Za-z'’ -]*$")

# Human-verified names for every cell where the OCR passes disagreed or both
# misread (each checked letter-by-letter against the chart, 2026-06).
NAME_FIXES = {
    "224": "Turquoise Green",
    "253": "Burnt Orange",
    "259": "Deep Magenta",
    "273": "Ivory White",
    "278": "Light Peach",
    "291": "Light Ultramarine Blue",
    "293": "Brandies Blue",
    "296": "Aero Green",
    "303": "Mint",
    "311": "Tea Rose",
    "317": "Warm Grey",
}


def parse_cell(cell: list[Obs], line_tol: int) -> tuple[str, str] | None:
    """Pick "<code> <Name>" out of one cell's text runs."""
    # Vision usually splits "201" / "Lemon Yellow" into separate runs, but
    # sometimes returns them joined — accept either.
    for o in cell:
        m = re.fullmatch(r"([23]\d\d)\s+([A-Za-z][A-Za-z'’ -]*)", o.text)
        if m:
            return m.group(1), re.sub(r"\s+", " ", m.group(2)).strip()
    code_obs = next((o for o in cell if parse_code(o.text)), None)
    if not code_obs:
        return None
    parts = sorted(
        (
            o
            for o in cell
            if o is not code_obs
            and abs(o.y_mid - code_obs.y_mid) <= line_tol
            and NAME_RUN.fullmatch(o.text)
        ),
        key=lambda o: o.x,
    )
    if not parts:
        return None
    return code_obs.text, re.sub(r"\s+", " ", " ".join(p.text for p in parts)).strip()


CELL_SCALE = 4


def vision_cell(src: Path, x: int, y: int, w: int, h: int, tmp: Path) -> tuple[str, str] | None:
    """Second-opinion OCR: one cell's text block upscaled 4x, where Vision
    resolves the chart's ~10px names much more reliably than in the full strip."""
    crop = tmp / "cell.png"
    sips_crop(src, crop, x, y, w, h, scale=CELL_SCALE)
    helper = tmp / "visionocr.js"
    res = subprocess.run(
        ["osascript", "-l", "JavaScript", str(helper), str(crop)],
        check=True, capture_output=True, text=True,
    )
    obs = []
    for line in res.stdout.splitlines():
        if not line.strip().startswith("{"):
            continue
        o = json.loads(line)
        obs.append(
            Obs(
                o["text"].strip(),
                round(o["x"] * w * CELL_SCALE),
                round((1 - o["y"] - o["h"] / 2) * h * CELL_SCALE),
            )
        )
    return parse_cell(obs, line_tol=8 * CELL_SCALE)


def main() -> None:
    if not SOURCE.exists():
        sys.exit(f"missing source chart: {SOURCE}")
    SWATCH_DIR.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        bmp = tmp / "chart.bmp"
        subprocess.run(
            ["sips", "-s", "format", "bmp", str(SOURCE), "--out", str(bmp)],
            check=True, capture_output=True,
        )
        width, height, rows, bypp, stride = read_bmp(bmp)
        col_bands, row_bands = detect_grid(width, height, rows, bypp, stride)

        # NB: sips silently skips the crop when offset+height hits the image
        # edge exactly, so stay one pixel short.
        obs = vision_ocr(SOURCE, REGION_TOP, height - REGION_TOP - 1, width, tmp)

        colors, problems = [], []
        for ri, (ry0, ry1) in enumerate(row_bands):
            for ci, (cx0, cx1) in enumerate(col_bands):
                hex_ = median_hex(rows, stride, bypp, cx0 + 2, ry0 + 2, cx1 - 2, ry1 - 2)

                # The cell's text lives between this swatch and the next column.
                next_x = col_bands[ci + 1][0] - 6 if ci + 1 < COLS else width
                cell = [o for o in obs if cx1 - 2 <= o.x < next_x and ry0 - 4 <= o.y_mid <= ry1 + 4]

                strip_result = parse_cell(cell, line_tol=8)
                cell_result = vision_cell(
                    SOURCE, cx1, ry0 - 6, next_x - cx1, (ry1 - ry0) + 12, tmp
                )
                # The 4x per-cell pass is the more reliable read; the full-strip
                # pass is its cross-check. Disagreements go in the report.
                result = cell_result or strip_result
                if not result:
                    problems.append(f"r{ri} c{ci}: unparsed OCR {[o.text for o in cell]!r}")
                    continue
                code, name = result
                if code in NAME_FIXES:
                    name = NAME_FIXES[code]
                elif strip_result and cell_result and strip_result != cell_result:
                    # Both passes parsed but read different text and no curated
                    # fix covers it — needs a human eye.
                    problems.append(
                        f"r{ri} c{ci}: passes disagree: strip={strip_result} cell={cell_result}"
                    )

                sips_crop(SOURCE, SWATCH_DIR / f"{code}.png", cx0, ry0, cx1 - cx0, ry1 - ry0)
                colors.append({
                    "code": code,
                    "name": name,
                    "names": {"en": name},
                    "transparency": None,
                    "pigments": [],
                    "lightfastness": None,
                    "iridescent": bool(re.search(r"gold|silver|metallic", name, re.I)),
                    "new": False,
                    "giant": False,
                    "hex": hex_,
                    "swatch": f"swatches/{code}.png",
                })

    # Chart reads column-major (top-to-bottom, then next column)? No — Mungyo
    # lists by columns of related hues; keep numeric code order for the app.
    colors.sort(key=lambda c: c["code"])

    codes = [c["code"] for c in colors]
    dupes = {c for c in codes if codes.count(c) > 1}
    if dupes:
        problems.append(f"duplicate codes: {sorted(dupes)}")
    if len(colors) != COLS * ROWS:
        problems.append(f"expected {COLS * ROWS} colours, got {len(colors)}")

    (DATA / "colors.json").write_text(json.dumps(colors, ensure_ascii=False, indent=2) + "\n")
    print(f"Extracted {len(colors)} colours -> data/mungyo/colors.json")
    for c in colors:
        print(f"  {c['code']}  {c['hex']}  {c['name']}")
    if problems:
        print("\nPROBLEMS:")
        for p in problems:
            print(f"  {p}")
        sys.exit(1)


if __name__ == "__main__":
    main()
