#!/usr/bin/env python3
"""Build the Caran d'Ache Neoart 6901 catalogue (data/neoart/) from the
official colour chart.

Source: data/neoart/source/neoart-colour-chart.jpg — Caran d'Ache's official
"NEOART 6901" 48-colour chart (found circulating as a stockist's product
image; CdA doesn't host it publicly yet). It's a 1999x1470 raster, 8x6 cells.
Each cell, top to bottom:

  <painted swatch stroke>
  [code badge] [LFI | LFII]          per-colour ASTM D-6901 lightfastness
  English - French
  German - Italian
  Spanish - Portuguese
  <pigments>                          CI codes, e.g. "PR101/PBk7"

No text layer, so cells are anchored on the code badges read by the macOS
Vision framework (JXA helper); swatch boxes are detected from the raster with
a fixed fallback for the white strokes. Codes and English names are
cross-checked against the open-stock variant list
(data/neoart/source/openstock-variants.json, SKUs "MOR7901<code>").

Outputs:
  data/neoart/colors.json            structured catalogue (48 colours)
  data/neoart/swatches/<code>.png    cropped swatch stroke per colour

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
DATA = ROOT / "data" / "neoart"
SOURCE = DATA / "source" / "neoart-colour-chart.jpg"
VARIANTS = DATA / "source" / "openstock-variants.json"
SWATCH_DIR = DATA / "swatches"

COLS, ROWS = 6, 8

# Cell geometry in source pixels, relative to a code badge's top-left.
# (Row pitch ~143px, column pitch ~287px.)
SWATCH_WIN_Y = (-72, -6)      # search window above the badge
SWATCH_FALLBACK_Y = (-62, -12)
NAME_Y = (15, 58)             # the three name lines (dy 20/35/52)
PIGMENT_Y = (58, 80)          # the pigment line (dy ~64)
CELL_W = 280


# --- Vision OCR helper (same approach as the Mungyo extractor) ---------------

VISION_OCR_JS = """
ObjC.import('Vision');
ObjC.import('Foundation');
function run(argv) {
  const url = $.NSURL.fileURLWithPath(argv[0]);
  const handler = $.VNImageRequestHandler.alloc.initWithURLOptions(url, $.NSDictionary.dictionary);
  const req = $.VNRecognizeTextRequest.alloc.init;
  req.recognitionLevel = 0; // accurate
  req.usesLanguageCorrection = false;
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
    def __init__(self, text: str, x: int, y_top: int, y_mid: int):
        self.text, self.x, self.y_top, self.y_mid = text, x, y_top, y_mid


def vision_ocr(src: Path, w: int, h: int, tmp: Path) -> list[Obs]:
    helper = tmp / "visionocr.js"
    helper.write_text(VISION_OCR_JS)
    res = subprocess.run(
        ["osascript", "-l", "JavaScript", str(helper), str(src)],
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
                round(o["x"] * w),
                round((1 - o["y"] - o["h"]) * h),
                round((1 - o["y"] - o["h"] / 2) * h),
            )
        )
    return obs


# --- raster handling (BMP via sips, same as the Mungyo extractor) ------------

def read_bmp(path: Path) -> tuple[int, int, bytes, int, int]:
    data = path.read_bytes()
    assert data[:2] == b"BM", "expected BMP"
    pix_offset = struct.unpack_from("<I", data, 10)[0]
    width, height = struct.unpack_from("<ii", data, 18)
    bpp = struct.unpack_from("<HH", data, 26)[1]
    compression = struct.unpack_from("<I", data, 30)[0]
    assert compression == 0 and bpp in (24, 32), f"unsupported BMP (bpp={bpp})"
    bypp = bpp // 8
    stride = (width * bypp + 3) & ~3
    flipped = height > 0
    height = abs(height)
    rows = data[pix_offset : pix_offset + stride * height]
    if flipped:
        rows = b"".join(
            rows[(height - 1 - y) * stride : (height - y) * stride] for y in range(height)
        )
    return width, height, rows, bypp, stride


def px(rows: bytes, stride: int, bypp: int, x: int, y: int) -> tuple[int, int, int]:
    o = y * stride + x * bypp
    return rows[o + 2], rows[o + 1], rows[o]


def is_paper(rgb: tuple[int, int, int]) -> bool:
    return rgb[0] > 235 and rgb[1] > 235 and rgb[2] > 235


def longest_run(values: list[int], max_gap: int = 3) -> list[int]:
    runs, cur = [], []
    for v in values:
        if cur and v - cur[-1] > max_gap:
            runs.append(cur)
            cur = []
        cur.append(v)
    if cur:
        runs.append(cur)
    return max(runs, key=len, default=[])


def find_swatch(rows, stride, bypp, w, h, x0, y0, x1, y1):
    """Bounding box of the painted stroke inside a window, or None if pale."""
    hits = []
    for y in range(max(0, y0), min(h, y1)):
        n = sum(
            1 for x in range(max(0, x0), min(w, x1))
            if not is_paper(px(rows, stride, bypp, x, y))
        )
        hits.append((y, n))
    width = x1 - x0
    band = longest_run([y for y, n in hits if n > width * 0.5])
    if len(band) < 30:
        return None
    ry0, ry1 = band[0], band[-1] + 1
    cols = longest_run(
        [
            x
            for x in range(max(0, x0), min(w, x1))
            if sum(1 for y in range(ry0, ry1) if not is_paper(px(rows, stride, bypp, x, y)))
            > (ry1 - ry0) * 0.5
        ]
    )
    if not cols:
        return None
    return cols[0], ry0, cols[-1] + 1, ry1


def median_hex(rows, stride, bypp, x0, y0, x1, y1) -> str:
    dx, dy = (x1 - x0) // 6, (y1 - y0) // 6
    rs, gs, bs = [], [], []
    for y in range(y0 + dy, y1 - dy):
        for x in range(x0 + dx, x1 - dx):
            r, g, b = px(rows, stride, bypp, x, y)
            rs.append(r); gs.append(g); bs.append(b)
    med = (statistics.median(rs), statistics.median(gs), statistics.median(bs))
    r, g, b = (int(v) for v in med)
    if min(r, g, b) >= 250:
        r = g = b = 255
    return f"#{r:02X}{g:02X}{b:02X}"


def sips_crop(src: Path, out: Path, x: int, y: int, w: int, h: int) -> None:
    subprocess.run(
        ["sips", "-c", str(h), str(w), "--cropOffset", str(y), str(x), str(src), "--out", str(out)],
        check=True, capture_output=True,
    )


def normalise_pigments(token: str) -> list[str]:
    out = []
    for part in token.split("/"):
        if m := re.fullmatch(r"(P[A-Za-z]+)(\d[\d:]*)", part.strip()):
            out.append(f"{m.group(1)} {m.group(2)}")
        elif part.strip():
            out.append(part.strip())
    return out


def cluster(values, tol: int = 40) -> list[int]:
    """Cluster 1-D positions; returns each cluster's median."""
    out: list[list[int]] = []
    for v in sorted(values):
        if out and v - out[-1][-1] <= tol:
            out[-1].append(v)
        else:
            out.append([v])
    return [round(statistics.median(c)) for c in out]


LF_RE = re.compile(r"^LF[Il1]{1,2}$")
NAME_LANGS = [("en", "fr"), ("de", "it"), ("es", "pt")]
NAME_LINE_Y = [(14, 31), (31, 46), (46, 58)]

# Human-verified fixes for cells whose name lines neither OCR pass reads
# cleanly (checked against the chart image).
NAME_FIXES: dict[str, dict[str, str]] = {
    "542": {"en": "Butternut", "fr": "Butternut"},
    "580": {"en": "Anthraquinone carmine", "fr": "Carmin anthraquinone"},
}

# Codes where the chart's name genuinely differs from the open-stock list
# (verified against the chart): the stock list uses Luminance-style names.
CHART_CONFIRMED = {"504", "662", "242"}


def split_pair(text: str) -> list[str] | None:
    """Split a "Language - Language" chart line; tolerates OCR mangling the
    separator into a tight dash or a period."""
    parts = re.split(r"\s+[-–]\s+", text)
    if len(parts) != 2:
        parts = re.split(r"(?<=[a-zé%œ])\s*[-–.]\s*(?=[A-ZÉÄÖÜ])", text)
    if len(parts) == 2:
        return [p.strip() for p in parts]
    return None


def parse_cell(a: Obs, obs: list[Obs]) -> dict:
    """Read one cell's LF badge, name lines and pigment line."""
    cell = [
        o for o in obs
        if a.x - 30 <= o.x < a.x + CELL_W - 40 and -12 <= o.y_top - a.y_top < 100
    ]
    lf = next(
        (o.text for o in cell if LF_RE.fullmatch(o.text) and abs(o.y_top - a.y_top) < 12),
        None,
    )
    if lf:
        lf = "LF" + "I" * len(re.sub(r"[^Il1]", "", lf))

    names = {}
    for (y0, y1), langs in zip(NAME_LINE_Y, NAME_LANGS):
        line = next(
            (o for o in cell if y0 <= o.y_top - a.y_top < y1 and len(o.text) > 3), None
        )
        if line and (pair := split_pair(line.text)):
            names[langs[0]], names[langs[1]] = pair

    pigment = next(
        (
            o.text.replace(" ", "")
            for o in cell
            if PIGMENT_Y[0] <= o.y_top - a.y_top < PIGMENT_Y[1]
            and " - " not in o.text
            and re.fullmatch(r"[A-Za-z][A-Za-z0-9/:]*", o.text.replace(" ", ""))
        ),
        None,
    )
    return {"lf": lf, "names": names, "pigment": pigment}


def vision_cell(src: Path, a: Obs, tmp: Path) -> dict:
    """Second-opinion OCR of one cell's text block at 4x upscale."""
    x0, y0 = a.x - 35, a.y_top - 12
    w, h = CELL_W - 30, 100
    crop = tmp / "cell.png"
    sips_crop(src, crop, x0, y0, w, h)
    subprocess.run(
        ["sips", "-z", str(h * 4), str(w * 4), str(crop)], check=True, capture_output=True
    )
    raw = vision_ocr(crop, w * 4, h * 4, tmp)
    mapped = [
        Obs(o.text, x0 + o.x // 4, y0 + o.y_top // 4, y0 + o.y_mid // 4) for o in raw
    ]
    return parse_cell(a, mapped)


def main() -> None:
    if not SOURCE.exists():
        sys.exit(f"missing source chart: {SOURCE}")
    SWATCH_DIR.mkdir(parents=True, exist_ok=True)

    product = next(
        p for p in json.loads(VARIANTS.read_text())["products"] if "Set" not in p["title"]
    )
    stock_names = {
        v["sku"].removeprefix("MOR7901"): v["title"].split(" / ")[-1]
        for v in product["variants"]
    }

    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        bmp = tmp / "chart.bmp"
        subprocess.run(
            ["sips", "-s", "format", "bmp", str(SOURCE), "--out", str(bmp)],
            check=True, capture_output=True,
        )
        width, height, rows, bypp, stride = read_bmp(bmp)
        obs = vision_ocr(SOURCE, width, height, tmp)

        # cell anchors: the 48 three-digit code badges. OCR occasionally drops
        # one badge — fit the 8x6 grid to what was found and synthesize the
        # missing slots (their codes are recovered from the cell's name below).
        anchors = [o for o in obs if re.fullmatch(r"\d{3}", o.text)]
        col_xs = sorted(cluster(o.x for o in anchors))
        row_ys = sorted(cluster(o.y_top for o in anchors))
        if len(col_xs) != COLS or len(row_ys) != ROWS:
            sys.exit(f"grid fit failed: {len(col_xs)} cols x {len(row_ys)} rows from {len(anchors)} badges")
        for gx in col_xs:
            for gy in row_ys:
                if not any(abs(o.x - gx) < 40 and abs(o.y_top - gy) < 40 for o in anchors):
                    anchors.append(Obs("", gx, gy, gy + 14))

        colors, problems = [], []
        row_of = lambda o: min(range(len(row_ys)), key=lambda i: abs(o.y_top - row_ys[i]))
        for a in sorted(anchors, key=lambda o: (row_of(o), o.x)):
            code = a.text or None
            parsed = parse_cell(a, obs)
            if not (parsed["lf"] and parsed["names"].get("en") and parsed["pigment"]):
                # Vision misses lines at full size now and then; a 4x upscale
                # of just this cell's text block reads far more reliably.
                retry = vision_cell(SOURCE, a, tmp)
                for key in ("lf", "pigment"):
                    parsed[key] = parsed[key] or retry[key]
                parsed["names"] = {**retry["names"], **parsed["names"]}
            lf, names, pigment_line = parsed["lf"], parsed["names"], parsed["pigment"]

            en = names.get("en")
            if code is None and en:
                # synthesized anchor: recover the code from the name
                code = next(
                    (c for c, n in stock_names.items() if n.lower() == en.lower()), None
                )
            if code is None:
                problems.append(f"cell at ({a.x},{a.y_top}): no code (en={en!r})")
                continue
            if code in NAME_FIXES:
                names = {**names, **NAME_FIXES[code]}
                en = names["en"]
            # the open-stock list is the cross-check (and fallback) for EN
            stock = stock_names.get(code)
            if stock and (not en or en.lower() != stock.lower()):
                if not en:
                    names["en"] = stock
                    en = stock
                elif code not in NAME_FIXES and code not in CHART_CONFIRMED:
                    problems.append(f"{code}: chart EN {en!r} != stock {stock!r} (using chart)")
            if not en:
                problems.append(f"{code}: no EN name")
                continue

            if not pigment_line:
                problems.append(f"{code}: no pigment line")
                continue
            pigments = normalise_pigments(pigment_line)

            wx0, wx1 = a.x - 30, a.x - 30 + CELL_W
            wy0, wy1 = a.y_top + SWATCH_WIN_Y[0], a.y_top + SWATCH_WIN_Y[1]
            bounds = find_swatch(rows, stride, bypp, width, height, wx0, wy0, wx1, wy1)
            if bounds is None:  # white strokes
                bounds = (wx0, a.y_top + SWATCH_FALLBACK_Y[0], wx1, a.y_top + SWATCH_FALLBACK_Y[1])
            bx0, by0, bx1, by1 = bounds

            sips_crop(SOURCE, SWATCH_DIR / f"{code}.png", bx0, by0, bx1 - bx0, by1 - by0)
            colors.append({
                "code": code,
                "name": en,
                "names": names,
                "transparency": None,             # not published
                "pigments": pigments,
                "lightfastness": lf,              # LFI / LFII per ASTM D-6901
                "iridescent": False,
                "new": False,
                "giant": False,
                "hex": median_hex(rows, stride, bypp, bx0, by0, bx1, by1),
                "swatch": f"swatches/{code}.png",
            })

    codes = [c["code"] for c in colors]
    if len(codes) != len(set(codes)):
        problems.append("duplicate codes")
    if len(colors) != COLS * ROWS:
        problems.append(f"expected {COLS * ROWS} colours, got {len(colors)}")
    if set(codes) != set(stock_names):
        problems.append(f"code set differs from open-stock list: {sorted(set(codes) ^ set(stock_names))}")
    lf_counts = [c["lightfastness"] for c in colors]
    if not (lf_counts.count("LFI") == 34 and lf_counts.count("LFII") == 14):
        problems.append(
            f"LF distribution {lf_counts.count('LFI')}xLFI/{lf_counts.count('LFII')}xLFII "
            "(official: 34 LFI + 14 LFII)"
        )

    colors.sort(key=lambda c: c["code"])
    (DATA / "colors.json").write_text(json.dumps(colors, ensure_ascii=False, indent=2) + "\n")
    print(f"Extracted {len(colors)} colours -> data/neoart/colors.json")
    for c in colors:
        print(f"  {c['code']}  {c['hex']}  {c['lightfastness'] or '-':>4}  "
              f"{'/'.join(c['pigments']):20} {c['name']}  [{c['names'].get('fr','')}]")
    if problems:
        print("\nPROBLEMS:")
        print("\n".join(f"  {p}" for p in problems))
        raise SystemExit(1)


if __name__ == "__main__":
    main()
