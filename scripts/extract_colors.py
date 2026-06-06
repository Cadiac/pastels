#!/usr/bin/env python3
"""Build the Sennelier oil-pastel catalogue (data/colors.json) from the PDF chart.

Source: Colourchart_Oilpastels.pdf (vector text, 1 chart page).

The chart is an 8-band x 15-column grid of colour cells. Each cell holds:
  line 1:  <code> <FR name> - <EN name>
  line 2:  <DE name> - <ES name>
  line 3:  <stars> <IT name> - <NL name>      (stars => lightfastness: *** = I)
  line 4:  <T|O|T/O> <pigment codes...>        (transparency + pigment list)
The colour swatch (a stroke of the real pastel) sits directly above the block,
spanning the same horizontal extent as the cell's text ([code.x, next_code.x)).

Long names AND long pigment lists overflow into neighbouring columns, so neither
can be read by naive per-column clipping. We therefore:
  * names (fr/en/de/es/it/nl) <- data/names.json (transcribed from the chart;
    authoritative). The geometric FR name is parsed only as a sanity cross-check.
  * transparency / pigments   <- split each band's pigment ROW on the T|O|T/O
    tokens, which are short and stay anchored at each cell's left edge. This is
    robust to overflow (verified: every band splits into exactly 15 cells).
  * lightfastness (stars)     <- the * group anchored at the cell's line-3 start.
  * swatch image + hex        <- rendered raster, cropped to [code.x, next_code.x).

Outputs:
  data/colors.json            structured catalogue (120 colours)
  data/swatches/<code>.png    cropped swatch image per colour

Dependencies: poppler (pdftotext, pdftoppm). No third-party Python packages.
"""
import html
import json
import re
import subprocess
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PDF = ROOT / "Colourchart_Oilpastels.pdf"
DATA = ROOT / "data"
SWATCH_DIR = DATA / "swatches"
NAMES_FILE = DATA / "names.json"

# y-centres (PDF points) of the 8 real colour bands. Anything else matching
# \d{3} (e.g. "101" inside "PR 101") is a pigment number, not a colour code.
BAND_Y = [65, 127, 189, 251, 313, 376, 438, 500]
BAND_TOL = 4

SWATCH_DPI = 150          # source swatches are ~130x47px @100ppi; don't upscale much
SAMPLE_DPI = 150          # raster used only for colour sampling
# Swatch box, in PDF points: a strip just above the code, clear of the previous
# band's pigment line (~code.y-41) and of this cell's own text (code.y).
SWATCH_TOP = 34
SWATCH_BOTTOM = 5
SWATCH_PAD_X = 3          # right-side inset from the next column
# Extend a little left of the code so the stroke's left edge has horizontal
# breathing room (and the "New" marker, when present, is fully shown).
SWATCH_LEFT = 5

LIGHTFAST = {3: "I", 2: "II", 1: "III"}     # *** is the most lightfast (= I)


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


def band_of(y):
    for b in BAND_Y:
        if abs(y - b) < BAND_TOL:
            return b
    return None


STAR_RE = re.compile(r"^\*+$")


def normalise_pigments(tokens):
    """Turn raw tokens into tidy entries: 'PR101'->'PR 101', 'PB','15:3'->'PB 15:3',
    'PB','k','1'->'PBk 1', keeping 'N.R.' and 'IRIDESCENT' verbatim."""
    merged = []
    for t in tokens:
        if t == "k" and merged and re.fullmatch(r"P[A-Za-z]*", merged[-1]):
            merged[-1] += "k"
        else:
            merged.append(t)
    out = []
    for t in merged:
        if re.fullmatch(r"N\.?R\.?", t, re.I):
            out.append("N.R.")
        elif t.upper() == "IRIDESCENT":
            out.append("IRIDESCENT")
        elif m := re.fullmatch(r"(P[A-Za-z]+)(\d[\d:/]*)?", t):
            out.append(m.group(1) + (" " + m.group(2) if m.group(2) else ""))
        elif re.fullmatch(r"[\d:/]+", t) and out and out[-1] not in ("N.R.", "IRIDESCENT"):
            out[-1] = f"{out[-1]} {t}" if not out[-1][-1].isdigit() else out[-1] + t
    return out


def extract_pigment_rows(words):
    """code -> (transparency, pigments, iridescent), via per-band T/O splitting."""
    result = {}
    for by in BAND_Y:
        codes = sorted([w for w in words if re.fullmatch(r"\d{3}", w[4]) and abs(w[1] - by) < BAND_TOL])
        row = [w[4] for w in sorted(
            [w for w in words if by + 16 <= w[1] <= by + 27], key=lambda w: w[0])]
        segments, cur = [], None
        for tok in row:
            if tok in ("T", "O", "T/O"):
                if cur is not None:
                    segments.append(cur)
                cur = [tok]
            elif cur is not None:
                cur.append(tok)
        if cur is not None:
            segments.append(cur)
        assert len(segments) == len(codes), f"band {by}: {len(segments)} segs != {len(codes)} codes"
        for code_w, seg in zip(codes, segments):
            transparency = seg[0]
            rest = seg[1:]
            iridescent = bool(rest) and rest[0].upper() == "IRIDESCENT"
            if iridescent:
                rest = rest[1:]
            result[code_w[4]] = (transparency, normalise_pigments(rest), iridescent)
    return result


def extract_stars(words):
    """code -> lightfastness star count, read from the line-3 anchor at cell left."""
    result = {}
    for by in BAND_Y:
        for cw in [w for w in words if re.fullmatch(r"\d{3}", w[4]) and abs(w[1] - by) < BAND_TOL]:
            cx, cy = cw[0], cw[1]
            stars = [w for w in words if STAR_RE.match(w[4])
                     and cx - 8 <= w[0] <= cx + 24 and cy + 7 <= w[1] <= cy + 15]
            result[cw[4]] = max((len(w[4]) for w in stars), default=None)
    return result


def extract_markers(words):
    """code -> (new, giant), read from the marker band just above each code.

    The chart prints "New" and "▲" (also available as a 78 ml giant stick) at the
    top-left of a cell's swatch (~code.y-33). The lone ▲ in the bottom legend has
    no band above it, so it is naturally excluded."""
    result = {}
    for by in BAND_Y:
        for cw in [w for w in words if re.fullmatch(r"\d{3}", w[4]) and abs(w[1] - by) < BAND_TOL]:
            cx, cy = cw[0], cw[1]
            band = [w[4] for w in words
                    if cx - 6 <= w[0] <= cx + 40 and cy - 40 <= w[1] <= cy - 24]
            result[cw[4]] = ("New" in band, "▲" in band)
    return result


def geom_fr_name(words, code, cx, cy, right):
    """The FR name as positioned right after the code (cross-check only)."""
    toks = [w[4] for w in sorted(
        [w for w in words if cx - 2 <= w[0] < right and cy - 2 <= w[1] < cy + 4],
        key=lambda w: w[0])]
    if code in toks:
        toks = toks[toks.index(code) + 1:]
    return " ".join(toks).split(" - ")[0].rstrip(" -").strip() or None


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


def sample_hex(px, w, h, x0, y0, x1, y1):
    """Representative colour of a swatch box.

    Normally the median of the pigment (non-paper) pixels. But for a white/pale
    pastel the pigment is itself near-white, so almost nothing reads as non-paper
    (only the faint grey outline) — in that case fall back to the median of ALL
    pixels, which is the true near-white. A clean near-white then snaps to #FFFFFF.
    """
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
    if rs and paper_frac < 0.75:                 # enough real pigment: use it
        chans = (rs, gs, bs)
    else:                                        # white/near-white pigment
        chans = ([c[0] for c in allc], [c[1] for c in allc], [c[2] for c in allc])

    def med(v):
        v = sorted(v)
        return v[len(v) // 2] if v else 255
    r, g, b = med(chans[0]), med(chans[1]), med(chans[2])
    if min(r, g, b) >= 250:                       # clean near-white -> pure white
        r = g = b = 255
    return f"#{r:02X}{g:02X}{b:02X}"


def main():
    DATA.mkdir(exist_ok=True)
    SWATCH_DIR.mkdir(exist_ok=True)
    names = json.loads(NAMES_FILE.read_text())

    bbox = DATA / "_bbox.html"
    run(["pdftotext", "-bbox", str(PDF), str(bbox)])
    words = list(parse_words(bbox.read_text()))
    bbox.unlink()

    pigment_rows = extract_pigment_rows(words)
    stars = extract_stars(words)
    markers = extract_markers(words)

    bands = defaultdict(list)
    for w in words:
        if re.fullmatch(r"\d{3}", w[4]) and band_of(w[1]) is not None:
            bands[band_of(w[1])].append(w)

    # one raster of the whole page (PPM = pdftoppm default) for colour sampling
    run(["pdftoppm", "-r", str(SAMPLE_DPI), "-f", "1", "-l", "1", str(PDF), str(DATA / "_sample")])
    sw, sh, spx = read_ppm(DATA / "_sample-1.ppm")
    (DATA / "_sample-1.ppm").unlink(missing_ok=True)
    s = SAMPLE_DPI / 72.0

    colors, warnings = [], []
    for by in BAND_Y:
        row = sorted(bands[by], key=lambda w: w[0])
        for i, code_w in enumerate(row):
            code = code_w[4]
            cx, cy = code_w[0], code_w[1]
            next_x = row[i + 1][0] if i + 1 < len(row) else cx + 119

            if code not in names:
                warnings.append(f"  {code}: no entry in names.json")
                continue
            nm = names[code]
            gfr = geom_fr_name(words, code, cx, cy, next_x)
            if gfr and gfr != nm["fr"]:
                warnings.append(f"  {code}: geometry FR {gfr!r} != names.json {nm['fr']!r}")

            transparency, pigments, iridescent = pigment_rows[code]

            # swatch box: extend a little left of the code so the stroke's left
            # edge (and the "New" marker, when present) is fully shown
            sx0, sx1 = cx - SWATCH_LEFT, next_x - SWATCH_PAD_X
            sy0, sy1 = cy - SWATCH_TOP, cy - SWATCH_BOTTOM
            run(["pdftoppm", "-png", "-r", str(SWATCH_DPI), "-f", "1", "-l", "1",
                 "-x", str(round(sx0 * SWATCH_DPI / 72)), "-y", str(round(sy0 * SWATCH_DPI / 72)),
                 "-W", str(round((sx1 - sx0) * SWATCH_DPI / 72)),
                 "-H", str(round((sy1 - sy0) * SWATCH_DPI / 72)),
                 str(PDF), str(SWATCH_DIR / f"_{code}")])
            (SWATCH_DIR / f"_{code}-1.png").rename(SWATCH_DIR / f"{code}.png")

            hexv = sample_hex(spx, sw, sh,
                              round(sx0 * s), round(sy0 * s), round(sx1 * s), round(sy1 * s))

            colors.append({
                "code": code,
                "name": nm["en"],
                "names": nm,
                "transparency": transparency,                      # T / O / T/O
                "pigments": pigments,                              # ['PW 6', 'PY 35']
                "lightfastness": LIGHTFAST.get(stars.get(code)),   # I / II / III
                "iridescent": iridescent,
                "new": markers[code][0],                           # flagged "New" on the chart
                "giant": markers[code][1],                         # also sold as a 78 ml giant stick
                "hex": hexv,
                "swatch": f"swatches/{code}.png",
            })

    colors.sort(key=lambda c: c["code"])
    (DATA / "colors.json").write_text(json.dumps(colors, ensure_ascii=False, indent=2) + "\n")
    print(f"Extracted {len(colors)} colours -> data/colors.json")
    print("Swatch crops -> data/swatches/<code>.png")
    if warnings:
        print(f"\n{len(warnings)} cross-check warning(s) "
              f"(geometry fooled by overflow; names.json is authoritative):")
        print("\n".join(warnings))


if __name__ == "__main__":
    main()
