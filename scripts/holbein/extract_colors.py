#!/usr/bin/env python3
"""Build the Holbein Artists' Oil Pastel catalogue (data/holbein/) from the
official US chart + technical data sheet.

Sources (data/holbein/source/):
  holbein-aop-chart.pdf  "AOP-DCC" digital colour chart: 141 cells in a 12x13
                         grid. Per cell: flat colour swatch, then "5A-1"-style
                         code, ENGLISH NAME (caps), French name, permanency
                         stars (*** / ** / *, or none = not rated).
  holbein-aop-tds.pdf    "AOP-TDS" technical data sheet: one row per pigment
                         family ("5A Hansa Yellow") with chemical names and
                         Colour Index pigment codes.

Codes are <family>-<tint>: 45 pigment families, each in tint depths 1 (deep),
3 (medium) and 5 (light) — the FR names carry the qualifier (Foncé / Moyen /
Clair) — plus the three Non-Color grey families which run 1..5. Pigments are
published per family, so all tints of a family share them. English names come
from the TDS (title case, the chart prints them in caps).

Cells are left-aligned on the code token; the swatch's exact box is detected
from the rendered raster (ink at code.y-18..-2), with a fixed fallback for
the palest tints.

Outputs:
  data/holbein/colors.json            structured catalogue (141 colours)
  data/holbein/swatches/<code>.png    cropped swatch image per colour

Dependencies: poppler (pdftotext, pdftoppm). No third-party Python packages.
"""
import html
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
DATA = ROOT / "data" / "holbein"
CHART = DATA / "source" / "holbein-aop-chart.pdf"
TDS = DATA / "source" / "holbein-aop-tds.pdf"
SWATCH_DIR = DATA / "swatches"

SAMPLE_DPI = 150

# Ink offsets from a code word's (xMin, yMin), in PDF points. Cell stack:
# swatch (-18..-2), code (0), EN name (+5), FR name (+11), stars (+16).
EN_Y = (4, 9)
FR_Y = (10, 14)
STARS_Y = (14.5, 20)
SWATCH_WIN_X = (-2, 70)
SWATCH_WIN_Y = (-20, -1)
SWATCH_FALLBACK_Y = (-17, -3)

CODE_RE = re.compile(r"^\d+[A-Z]-\d$")
FAMILY_RE = re.compile(r"^\d+[A-Z]$")
STARS_RE = re.compile(r"^\*{1,3}$")

# TDS column x-ranges (PDF points)
TDS_REF_X = (50, 150)
TDS_NAME_X = (90, 185)    # the chemical-name column starts at x~188
TDS_PIGMENT_X = 470


def run(cmd):
    return subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL).stdout


WORD_RE = re.compile(
    r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)</word>'
)


def parse_pages(bbox_xml):
    """Per-page word lists: [(x0, y0, x1, y1, text), ...]."""
    pages = []
    for body in re.findall(r"<page[^>]*>(.*?)</page>", bbox_xml, re.S):
        pages.append(
            [
                (float(m.group(1)), float(m.group(2)), float(m.group(3)), float(m.group(4)),
                 html.unescape(m.group(5)))
                for m in WORD_RE.finditer(body)
            ]
        )
    return pages


def normalise_pigment(token):
    """'PW6,' -> 'PW 6'; 'PB15:2' -> 'PB 15:2'; 'NA' -> None."""
    t = token.strip().rstrip(",")
    if t in ("NA", ""):
        return None
    if m := re.fullmatch(r"(P[A-Za-z]+)(\d[\d:]*)", t):
        return f"{m.group(1)} {m.group(2)}"
    return t


def parse_tds():
    """family -> (title-case EN name, [pigments]); continuation lines attach
    to the family row above them."""
    bbox = DATA / "_tds_bbox.html"
    run(["pdftotext", "-bbox", str(TDS), str(bbox)])
    pages = parse_pages(bbox.read_text())
    bbox.unlink()

    families = {}
    for words in pages:
        refs = sorted(
            (w for w in words
             if FAMILY_RE.fullmatch(w[4]) and TDS_REF_X[0] <= w[0] <= TDS_REF_X[1]),
            key=lambda w: w[1],
        )
        for i, ref in enumerate(refs):
            y0 = ref[1] - 3
            y1 = refs[i + 1][1] - 3 if i + 1 < len(refs) else 10_000
            name = " ".join(
                w[4] for w in sorted(words, key=lambda w: w[0])
                if TDS_NAME_X[0] <= w[0] <= TDS_NAME_X[1] and ref[1] - 2 <= w[1] <= ref[1] + 6
            )
            pigments = [
                p
                for w in sorted(words, key=lambda w: (w[1], w[0]))
                if w[0] >= TDS_PIGMENT_X and y0 <= w[1] < y1
                if (p := normalise_pigment(w[4]))
            ]
            families[ref[4]] = (name, pigments)
    return families


# --- raster swatch handling (pure-Python PPM, no PIL) ------------------------

def read_ppm(path):
    data = path.read_bytes()
    assert data[:2] == b"P6", "expected binary PPM"
    idx, fields = 2, []
    while len(fields) < 3:
        while data[idx:idx + 1].isspace():
            idx += 1
        if data[idx:idx + 1] == b"#":
            idx = data.index(b"\n", idx) + 1
            continue
        start = idx
        while not data[idx:idx + 1].isspace():
            idx += 1
        fields.append(int(data[start:idx]))
    w, h, _ = fields
    return w, h, data[idx + 1:]


def longest_run(values, max_gap=2):
    runs, cur = [], []
    for v in values:
        if cur and v - cur[-1] > max_gap:
            runs.append(cur)
            cur = []
        cur.append(v)
    if cur:
        runs.append(cur)
    return max(runs, key=len, default=[])


def find_swatch_bounds(px, w, h, x0, y0, x1, y1):
    def paper(r, g, b):
        return r > 232 and g > 232 and b > 232

    row_hits = []
    for y in range(max(0, y0), min(h, y1)):
        base = y * w * 3
        n = sum(
            1
            for x in range(max(0, x0), min(w, x1))
            if not paper(px[base + x * 3], px[base + x * 3 + 1], px[base + x * 3 + 2])
        )
        row_hits.append((y, n))
    width = x1 - x0
    rows = longest_run([y for y, n in row_hits if n > width * 0.5])
    if len(rows) < 15:
        return None
    ry0, ry1 = rows[0], rows[-1] + 1

    col_hits = []
    for x in range(max(0, x0), min(w, x1)):
        n = sum(
            1
            for y in range(ry0, ry1)
            if not paper(px[y * w * 3 + x * 3], px[y * w * 3 + x * 3 + 1], px[y * w * 3 + x * 3 + 2])
        )
        col_hits.append((x, n))
    height = ry1 - ry0
    cols = longest_run([x for x, n in col_hits if n > height * 0.4])
    if not cols:
        return None
    return cols[0], ry0, cols[-1] + 1, ry1


def sample_hex(px, w, h, x0, y0, x1, y1):
    """Median of the non-paper pixels; all-pixel fallback for pale swatches."""
    x0, y0, x1, y1 = max(0, x0), max(0, y0), min(w, x1), min(h, y1)
    rs, gs, bs, allc = [], [], [], []
    for y in range(y0, y1):
        base = y * w * 3
        for x in range(x0, x1):
            i = base + x * 3
            r, g, b = px[i], px[i + 1], px[i + 2]
            allc.append((r, g, b))
            if not (r > 232 and g > 232 and b > 232):
                rs.append(r); gs.append(g); bs.append(b)

    paper_frac = 1 - (len(rs) / len(allc)) if allc else 1
    if rs and paper_frac < 0.75:
        chans = (rs, gs, bs)
    else:
        chans = ([c[0] for c in allc], [c[1] for c in allc], [c[2] for c in allc])

    def med(v):
        v = sorted(v)
        return v[len(v) // 2] if v else 255
    r, g, b = med(chans[0]), med(chans[1]), med(chans[2])
    if min(r, g, b) >= 250:
        r = g = b = 255
    return f"#{r:02X}{g:02X}{b:02X}"


def code_sort_key(code):
    m = re.fullmatch(r"(\d+)([A-Z])-(\d)", code)
    return int(m.group(1)), m.group(2), int(m.group(3))


def main():
    DATA.mkdir(exist_ok=True)
    SWATCH_DIR.mkdir(parents=True, exist_ok=True)

    families = parse_tds()

    bbox = DATA / "_bbox.html"
    run(["pdftotext", "-bbox", str(CHART), str(bbox)])
    words = parse_pages(bbox.read_text())[0]
    bbox.unlink()

    code_words = sorted((w for w in words if CODE_RE.fullmatch(w[4])), key=lambda w: (w[1], w[0]))

    # cluster into chart rows (two rows differ by <1pt in places)
    rows, cur = [], []
    for cw in code_words:
        if cur and cw[1] - cur[-1][1] > 3:
            rows.append(cur)
            cur = []
        cur.append(cw)
    rows.append(cur)

    run(["pdftoppm", "-r", str(SAMPLE_DPI), "-f", "1", "-l", "1", str(CHART), str(DATA / "_sample")])
    sw, sh, spx = read_ppm(DATA / "_sample-1.ppm")
    (DATA / "_sample-1.ppm").unlink(missing_ok=True)
    s = SAMPLE_DPI / 72.0

    colors, problems = [], []
    for row in rows:
        row = sorted(row, key=lambda w: w[0])
        for i, cw in enumerate(row):
            code, cx, cy = cw[4], cw[0], cw[1]
            next_x = row[i + 1][0] - 4 if i + 1 < len(row) else cx + 75

            family = code.split("-")[0]
            if family not in families:
                problems.append(f"{code}: family {family} not in the TDS")
                continue
            pigments = families[family][1]

            # EN from the chart cell (the TDS only knows family names — the
            # chart distinguishes e.g. Black/White within "Non-Color No.1").
            en_name = " ".join(
                w[4].capitalize()
                for w in sorted(words, key=lambda w: w[0])
                if cx - 2 <= w[0] < next_x and cy + EN_Y[0] <= w[1] <= cy + EN_Y[1]
            )
            if not en_name:
                problems.append(f"{code}: no EN name on the chart")
                continue

            fr_name = " ".join(
                w[4] for w in sorted(words, key=lambda w: w[0])
                if cx - 2 <= w[0] < next_x and cy + FR_Y[0] <= w[1] <= cy + FR_Y[1]
            )
            stars = next(
                (w[4] for w in words
                 if STARS_RE.fullmatch(w[4]) and cx - 2 <= w[0] < next_x
                 and cy + STARS_Y[0] <= w[1] <= cy + STARS_Y[1]),
                None,  # no mark = not rated by Holbein
            )

            wx0, wx1 = round((cx + SWATCH_WIN_X[0]) * s), round((cx + SWATCH_WIN_X[1]) * s)
            wy0, wy1 = round((cy + SWATCH_WIN_Y[0]) * s), round((cy + SWATCH_WIN_Y[1]) * s)
            bounds = find_swatch_bounds(spx, sw, sh, wx0, wy0, wx1, wy1)
            if bounds is None:  # palest tints: fixed geometric box
                bounds = (wx0, round((cy + SWATCH_FALLBACK_Y[0]) * s),
                          wx1, round((cy + SWATCH_FALLBACK_Y[1]) * s))
            bx0, by0, bx1, by1 = bounds

            run(["pdftoppm", "-png", "-r", str(SAMPLE_DPI), "-f", "1", "-l", "1",
                 "-x", str(bx0), "-y", str(by0),
                 "-W", str(bx1 - bx0), "-H", str(by1 - by0),
                 str(CHART), str(SWATCH_DIR / f"_{code}")])
            (SWATCH_DIR / f"_{code}-1.png").rename(SWATCH_DIR / f"{code}.png")

            colors.append({
                "code": code,
                "name": en_name,
                "names": {"en": en_name, "fr": fr_name} if fr_name else {"en": en_name},
                "transparency": None,                 # not published by Holbein
                "pigments": pigments,                 # per family, from the TDS
                "lightfastness": stars,               # *** / ** / *, as printed
                "iridescent": False,                  # no metallics in the range
                "new": False,
                "giant": False,
                "hex": sample_hex(spx, sw, sh, bx0, by0, bx1, by1),
                "swatch": f"swatches/{code}.png",
            })

    codes = [c["code"] for c in colors]
    if len(codes) != len(set(codes)):
        problems.append("duplicate codes")
    if len(colors) != 141:
        problems.append(f"expected 141 colours, got {len(colors)}")

    colors.sort(key=lambda c: code_sort_key(c["code"]))
    (DATA / "colors.json").write_text(json.dumps(colors, ensure_ascii=False, indent=2) + "\n")
    print(f"Extracted {len(colors)} colours -> data/holbein/colors.json")
    for c in colors:
        print(f"  {c['code']:7}  {c['hex']}  {c['lightfastness'] or '-':>3}  "
              f"{'/'.join(c['pigments']):28} {c['name']}  [{c['names'].get('fr','')}]")
    if problems:
        print("\nPROBLEMS:")
        print("\n".join(f"  {p}" for p in problems))
        raise SystemExit(1)


if __name__ == "__main__":
    main()
