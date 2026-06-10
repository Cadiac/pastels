#!/usr/bin/env python3
"""Build the Van Gogh oil-pastel catalogue (data/vangogh/) from the PDF chart.

Source: Royal Talens' official "colour chart Van Gogh oil pastels" PDF
(data/vangogh/source/vangogh-colour-chart.pdf, vector text, 1 page).

The chart is a 7-row x 9-column grid (60 cells; the last row is short).
Each cell holds, top to bottom:
  <Name>                       e.g. "Lemon yellow (primary)"
  <swatch stroke>              the painted pastel stroke
  <lf> <code>                  lightfastness sign (+++/++/+/o) and "NNN.T"
  <pigments>                   slash-separated CI codes, e.g. "PY3/PY42"

The code suffix is Talens' tone system: .3 = mixing shade with black,
.5 = full shade, .7/.8/.9 = increasing amounts of white. Lightfastness is
kept as printed (ASTM D4303): "+++" 100+y, "++" 25-100y, "+" 10-25y, "o" <10y.

Cells are anchored on the code tokens; everything else is read at fixed
offsets from them (verified against the rendered chart). The lone legend
example cell at the page bottom is excluded by its y position.

Outputs:
  data/vangogh/colors.json            structured catalogue (60 colours)
  data/vangogh/swatches/<code>.png    cropped swatch image per colour

Dependencies: poppler (pdftotext, pdftoppm). No third-party Python packages.
"""
import html
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
DATA = ROOT / "data" / "vangogh"
PDF = DATA / "source" / "vangogh-colour-chart.pdf"
SWATCH_DIR = DATA / "swatches"

MAX_CHART_Y = 450         # the legend's example cell (~y 764) is not a colour
SAMPLE_DPI = 150

# Offsets from a code word's (xMin, yMin), in PDF points. The name line sits
# only ~2pt below the previous row's pigment line, so the y windows are tight.
NAME_Y = (-43, -39.5)     # the name line (yMin ~ code.y - 41.5)
PIGMENT_Y = (6, 9)        # the pigment line (yMin ~ code.y + 7.5)
COL_CENTER = 13           # cell centre relative to the code's xMin

# Search window for the painted stroke; its exact bounds are detected from the
# raster since the strokes are hand-painted. NB: measured from rendered ink —
# the name line's *text-box* yMin sits ~11pt above its ink, so don't trust the
# bbox offsets here. Ink: prev pigments ~-44..-40, name ~-30..-24, stroke
# ~-21..-3 (all relative to the code's yMin).
SWATCH_WIN_X = (-12, 36)
SWATCH_WIN_Y = (-22.5, -2)
SWATCH_FALLBACK_Y = (-20, -4)  # for near-white strokes the detector can't see

LF_RE = re.compile(r"^(\+{1,3}|[o°])$")


def assign_to_columns(words_in_line, centers):
    """Names/pigments are centre-aligned and overflow their columns, so split a
    whole row's words by nearest column centre instead of clipping per cell."""
    cells = [[] for _ in centers]
    for w in sorted(words_in_line, key=lambda w: w[0]):
        mid = (w[0] + w[2]) / 2
        i = min(range(len(centers)), key=lambda i: abs(mid - centers[i]))
        cells[i].append(w[4])
    return cells


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
    """'PY3/PY152' -> ['PY 3', 'PY 152'] (spaced like the Sennelier data)."""
    out = []
    for part in token.split("/"):
        if m := re.fullmatch(r"(P[A-Za-z]+)(\d[\d:]*)", part):
            out.append(f"{m.group(1)} {m.group(2)}")
        else:
            out.append(part)
    return out


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


def find_swatch_bounds(px, w, h, x0, y0, x1, y1):
    """Bounding box (in raster px) of the painted stroke inside a window:
    rows/columns where enough pixels are clearly not paper. None if the stroke
    is too pale to detect (white, colourless, pearlescent)."""
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


def longest_run(values, max_gap=2):
    """Longest run of near-consecutive integers — the stroke itself, rather
    than a bbox stretched to a neighbouring cell's stray columns."""
    runs, cur = [], []
    for v in values:
        if cur and v - cur[-1] > max_gap:
            runs.append(cur)
            cur = []
        cur.append(v)
    if cur:
        runs.append(cur)
    return max(runs, key=len, default=[])


def sample_hex(px, w, h, x0, y0, x1, y1):
    """Median of the pigment (non-paper) pixels; falls back to the median of
    all pixels for white/pale strokes (see the Sennelier extractor)."""
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


def main():
    DATA.mkdir(exist_ok=True)
    SWATCH_DIR.mkdir(exist_ok=True)

    bbox = DATA / "_bbox.html"
    run(["pdftotext", "-bbox", str(PDF), str(bbox)])
    words = list(parse_words(bbox.read_text()))
    bbox.unlink()

    code_words = [w for w in words
                  if re.fullmatch(r"\d{3}\.\d", w[4]) and w[1] < MAX_CHART_Y]

    # one raster of the whole page for colour sampling
    run(["pdftoppm", "-r", str(SAMPLE_DPI), "-f", "1", "-l", "1", str(PDF), str(DATA / "_sample")])
    sw, sh, spx = read_ppm(DATA / "_sample-1.ppm")
    (DATA / "_sample-1.ppm").unlink(missing_ok=True)
    s = SAMPLE_DPI / 72.0

    # group the codes into chart rows by y
    rows = {}
    for cw in code_words:
        rows.setdefault(round(cw[1]), []).append(cw)

    colors, problems = [], []
    for cy_key in sorted(rows):
        row = sorted(rows[cy_key], key=lambda w: w[0])
        cy = row[0][1]
        centers = [cw[0] + COL_CENTER for cw in row]

        name_cells = assign_to_columns(
            [w for w in words if cy + NAME_Y[0] <= w[1] <= cy + NAME_Y[1]], centers,
        )
        pigment_cells = assign_to_columns(
            [w for w in words if cy + PIGMENT_Y[0] <= w[1] <= cy + PIGMENT_Y[1]], centers,
        )

        for cw, name_tokens, pigment_tokens in zip(row, name_cells, pigment_cells):
            code, cx = cw[4], cw[0]

            name = " ".join(name_tokens)
            # The chart abbreviates this one name to fit the column.
            name = name.replace("Perm.green", "Permanent green")
            if not re.fullmatch(r"[A-Za-z][A-Za-z()'. -]*", name or ""):
                problems.append(f"{code}: bad name {name!r} from {name_tokens}")
                continue

            # The sign sits right before the code ("+++ 504.5"); Colourless
            # 120.5 legitimately has none.
            lf = next((w[4] for w in words
                       if LF_RE.match(w[4]) and abs(w[1] - cy) < 3 and cx - 16 <= w[0] < cx), None)
            lf = "o" if lf == "°" else lf

            if len(pigment_tokens) != 1:
                problems.append(f"{code}: expected one pigment token, got {pigment_tokens}")
                continue
            pigments = normalise_pigments(pigment_tokens[0])

            # locate the painted stroke inside its search window (raster px)
            wx0, wx1 = round((cx + SWATCH_WIN_X[0]) * s), round((cx + SWATCH_WIN_X[1]) * s)
            wy0, wy1 = round((cy + SWATCH_WIN_Y[0]) * s), round((cy + SWATCH_WIN_Y[1]) * s)
            bounds = find_swatch_bounds(spx, sw, sh, wx0, wy0, wx1, wy1)
            if bounds is None:  # near-white stroke: fixed geometric box
                bounds = (wx0, round((cy + SWATCH_FALLBACK_Y[0]) * s),
                          wx1, round((cy + SWATCH_FALLBACK_Y[1]) * s))
            bx0, by0, bx1, by1 = bounds

            run(["pdftoppm", "-png", "-r", str(SAMPLE_DPI), "-f", "1", "-l", "1",
                 "-x", str(bx0), "-y", str(by0),
                 "-W", str(bx1 - bx0), "-H", str(by1 - by0),
                 str(PDF), str(SWATCH_DIR / f"_{code}")])
            (SWATCH_DIR / f"_{code}-1.png").rename(SWATCH_DIR / f"{code}.png")

            hexv = sample_hex(spx, sw, sh, bx0, by0, bx1, by1)

            colors.append({
                "code": code,
                "name": name,
                "names": {"en": name},
                "transparency": None,                 # not published by Talens
                "pigments": pigments,
                "lightfastness": lf,                  # +++ / ++ / + / o, as printed
                # The 800-series is Talens' metallic/pearlescent range (Silver,
                # Light/Deep gold, Pearlescent white) — "Gold ochre" is not.
                "iridescent": code.startswith("8"),
                "new": False,
                "giant": False,
                "hex": hexv,
                "swatch": f"swatches/{code}.png",
            })

    codes = [c["code"] for c in colors]
    if len(codes) != len(set(codes)):
        problems.append("duplicate codes")
    if len(colors) != 60:
        problems.append(f"expected 60 colours, got {len(colors)}")

    colors.sort(key=lambda c: c["code"])
    (DATA / "colors.json").write_text(json.dumps(colors, ensure_ascii=False, indent=2) + "\n")
    print(f"Extracted {len(colors)} colours -> data/vangogh/colors.json")
    for c in colors:
        print(f"  {c['code']}  {c['hex']}  {c['lightfastness'] or '?':>3}  "
              f"{'/'.join(c['pigments']) or '-':24} {c['name']}")
    if problems:
        print("\nPROBLEMS:")
        print("\n".join(f"  {p}" for p in problems))
        raise SystemExit(1)


if __name__ == "__main__":
    main()
