#!/usr/bin/env python3
"""Build the Caran d'Ache Neopastel catalogue (data/neopastel/) from the
official "NEOPASTEL® COLOUR CHART" PDF (vector text, 1 A4 page).

The chart lists 96 colours in two column blocks of 48 rows. Each row:

  <code> <Name>  [gradient bar with set dots]  <pigments>  <UV stars>

The row's colour is a pale-to-full gradient bar with the code/name printed on
its pale left end and "boxes of 96/48/24/12" membership dots after it; the
full-strength colour is the bar's right end, located per row by scanning the
ink run that contains the bar (its end varies slightly between the two column
blocks). Pigments are slash-separated CI codes; UV resistance is a star
rating (three or two stars on this chart), kept as printed.

Outputs:
  data/neopastel/colors.json            structured catalogue (96 colours)
  data/neopastel/swatches/<code>.png    crop of the bar's full-colour end

Dependencies: poppler (pdftotext, pdftoppm). No third-party Python packages.
"""
import html
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
DATA = ROOT / "data" / "neopastel"
PDF = DATA / "source" / "neopastel-colour-chart.pdf"
SWATCH_DIR = DATA / "swatches"

SAMPLE_DPI = 150
SWATCH_DPI = 300          # bar-end crops are small; render them denser

# Row geometry, in PDF points relative to a code word's (xMin, yMin).
ROW_X = 245               # a row's text reaches this far right of its code
BAR_PROBE_X = 70          # x certain to be inside the gradient bar
BAR_Y = (1, 6.5)          # the bar's vertical ink span within a row
# The bar deepens continuously to its right edge, so only the last points
# carry the full-strength colour.
SAMPLE_W = 4              # colour sampled from [end - 4, end - 1]
SWATCH_W = 34             # swatch crop shows a bit more of the gradient
PIGMENT_COL_X = 138       # row tokens at x - code.x >= this are the pigment column
# Gold / Silver / Bronze are the range's metallics.
IRIDESCENT_CODES = {"497", "498", "499"}

STARS_RE = re.compile(r"^★{1,3}$")
PIGMENT_RE = re.compile(r"^P[A-Za-z]+\d[\d:]*(/P[A-Za-z]+\d[\d:]*)*$")


def run(cmd):
    return subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL).stdout


def parse_words(bbox_xml):
    pat = re.compile(
        r'<word xMin="([\d.]+)" yMin="([\d.]+)" '
        r'xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)</word>'
    )
    for m in pat.finditer(bbox_xml):
        x0, y0, x1, y1, t = m.groups()
        yield float(x0), float(y0), float(x1), float(y1), html.unescape(t)


def normalise_pigments(token):
    out = []
    for part in token.split("/"):
        if m := re.fullmatch(r"(P[A-Za-z]+)(\d[\d:]*)", part):
            out.append(f"{m.group(1)} {m.group(2)}")
        else:
            out.append(part)
    return out


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


def is_paper(px, w, x, y):
    i = y * w * 3 + x * 3
    return px[i] > 235 and px[i + 1] > 235 and px[i + 2] > 235


def find_bar_end(px, w, h, cx, cy, s):
    """Right edge (in PDF pt) of the ink run containing the gradient bar."""
    y = round((cy + (BAR_Y[0] + BAR_Y[1]) / 2) * s)
    x = round((cx + BAR_PROBE_X) * s)
    if y >= h or is_paper(px, w, x, y):
        return None
    gap = 0
    while x < w and gap <= 2:                # tolerate hairline gaps
        x += 1
        gap = gap + 1 if is_paper(px, w, x, y) else 0
    return (x - gap) / s


def median_hex(px, w, h, x0, y0, x1, y1):
    rs, gs, bs = [], [], []
    for y in range(max(0, y0), min(h, y1)):
        base = y * w * 3
        for x in range(max(0, x0), min(w, x1)):
            i = base + x * 3
            rs.append(px[i]); gs.append(px[i + 1]); bs.append(px[i + 2])

    def med(v):
        v = sorted(v)
        return v[len(v) // 2] if v else 255
    r, g, b = med(rs), med(gs), med(bs)
    if min(r, g, b) >= 250:
        r = g = b = 255
    return f"#{r:02X}{g:02X}{b:02X}"


def main():
    DATA.mkdir(exist_ok=True)
    SWATCH_DIR.mkdir(parents=True, exist_ok=True)

    bbox = DATA / "_bbox.html"
    run(["pdftotext", "-bbox", str(PDF), str(bbox)])
    words = list(parse_words(bbox.read_text()))
    bbox.unlink()

    # codes are the 3-digit tokens at the two column-block left edges
    code_words = sorted(
        (w for w in words if re.fullmatch(r"\d{3}", w[4]) and (w[0] < 60 or 310 < w[0] < 330)),
        key=lambda w: (w[0] > 200, w[1]),
    )

    run(["pdftoppm", "-r", str(SAMPLE_DPI), "-f", "1", "-l", "1", str(PDF), str(DATA / "_sample")])
    sw, sh, spx = read_ppm(DATA / "_sample-1.ppm")
    (DATA / "_sample-1.ppm").unlink(missing_ok=True)
    s = SAMPLE_DPI / 72.0

    # First pass: locate every row's bar end, so pale bars the detector can't
    # see (White) can borrow the median end of their column block.
    import statistics
    ends = {}
    for cw in code_words:
        e = find_bar_end(spx, sw, sh, cw[0], cw[1], s)
        if e is not None and cw[0] + 60 < e < cw[0] + 110:
            ends[cw[4]] = e - cw[0]
    block_end = {
        left: statistics.median(v for c, v in ends.items()
                                for w in [next(w for w in code_words if w[4] == c)]
                                if (w[0] < 200) == left)
        for left in (True, False)
    }

    colors, problems = [], []
    for cw in code_words:
        code, cx, cy = cw[4], cw[0], cw[1]
        row = sorted(
            (w for w in words if cx + 8 <= w[0] < cx + ROW_X and abs(w[1] - cy) < 3.5),
            key=lambda w: w[0],
        )

        # The name and the pigment list are separate columns; the metallics
        # print a French pigment description ("Poudre de Bronze") there, so
        # split by x rather than by what the token looks like.
        name_tokens, pigment_tokens, stars = [], [], None
        for w in row:
            if STARS_RE.fullmatch(w[4]):
                stars = w[4]
            elif w[0] - cx >= PIGMENT_COL_X:
                pigment_tokens.append(w[4])
            elif re.fullmatch(r"[A-Za-z][A-Za-z' -]*", w[4]):
                name_tokens.append(w[4])
        name = " ".join(name_tokens)
        pigment_str = " ".join(pigment_tokens)
        pigments = (
            normalise_pigments(pigment_str)
            if PIGMENT_RE.fullmatch(pigment_str)
            else ([pigment_str] if pigment_str else None)
        )
        if not name or not pigments:
            problems.append(f"{code}: parsed name={name!r} pigments={pigments} from {[w[4] for w in row]}")
            continue

        end = cx + ends.get(code, block_end[cx < 200])

        hexv = median_hex(
            spx, sw, sh,
            round((end - SAMPLE_W) * s), round((cy + BAR_Y[0] + 0.5) * s),
            round((end - 2) * s), round((cy + BAR_Y[1] - 0.5) * s),
        )

        sb = SWATCH_DPI / 72.0
        run(["pdftoppm", "-png", "-r", str(SWATCH_DPI), "-f", "1", "-l", "1",
             "-x", str(round((end - SWATCH_W) * sb)), "-y", str(round((cy + BAR_Y[0]) * sb)),
             "-W", str(round((SWATCH_W - 1) * sb)), "-H", str(round((BAR_Y[1] - BAR_Y[0]) * sb)),
             str(PDF), str(SWATCH_DIR / f"_{code}")])
        (SWATCH_DIR / f"_{code}-1.png").rename(SWATCH_DIR / f"{code}.png")

        colors.append({
            "code": code,
            "name": name,
            "names": {"en": name},
            "transparency": None,                 # not published
            "pigments": pigments,
            "lightfastness": stars,               # UV stars, as printed
            "iridescent": code in IRIDESCENT_CODES,
            "new": False,
            "giant": False,
            "hex": hexv,
            "swatch": f"swatches/{code}.png",
        })

    codes = [c["code"] for c in colors]
    if len(codes) != len(set(codes)):
        problems.append("duplicate codes")
    if len(colors) != 96:
        problems.append(f"expected 96 colours, got {len(colors)}")

    colors.sort(key=lambda c: c["code"])
    (DATA / "colors.json").write_text(json.dumps(colors, ensure_ascii=False, indent=2) + "\n")
    print(f"Extracted {len(colors)} colours -> data/neopastel/colors.json")
    for c in colors:
        print(f"  {c['code']}  {c['hex']}  {c['lightfastness'] or '-':>3}  "
              f"{'/'.join(c['pigments']):24} {c['name']}")
    if problems:
        print("\nPROBLEMS:")
        print("\n".join(f"  {p}" for p in problems))
        raise SystemExit(1)


if __name__ == "__main__":
    main()
