#!/usr/bin/env python3
"""Build the Sakura Cray-Pas Specialist catalogue (data/craypas/) from the
official charts.

Sakura (Osaka, 1925) invented the oil pastel; Specialist is their artist-grade
line: 84 colours + the colourless Extender, sold as ESP-### sticks. Three
sources combine, because no single official document has everything:

  source/specialist-colorchart.pdf   Sakura of America's chart (vector text,
      via the Wayback Machine — sakuraofamerica.com/pdf/Specialist-colorchart.pdf,
      2010). Painted swatch + name + code + lightfastness (+++/++/+, Sakura's
      own legend: excellent / very good / fair) for 83 colours. Predates
      ESP-024 Mauve, and the Extender only appears in a footnote.
  source/cray-pas-brochure-2020.pdf  Sakura of America's product brochure:
      the current 85-stick open-stock list (codes + names) used as the
      authoritative lineup cross-check, and the source for Mauve's name.
  source/craypas-jp-chart.jpg        Sakura Japan's current chart
      (craypas.co.jp, raster, 85 dots with katakana names): Japanese names
      for every colour, and the swatch/hex for the two cells the 2010 chart
      lacks (Mauve, Extender).

The JP chart has no text layer or codes: dots are matched to colours by
constructing each English name's expected katakana from a word table and
comparing it with the macOS Vision OCR of each cell (dakuten/small-kana
insensitively, since 10px kana OCR confuses ヒ/ビ etc.).

Outputs:
  data/craypas/colors.json           structured catalogue (85 entries)
  data/craypas/swatches/<code>.png   cropped swatch per colour

macOS-only (sips + Vision for the JP chart); needs poppler for the PDFs.
"""
from __future__ import annotations

import html
import json
import re
import statistics
import struct
import subprocess
import sys
import tempfile
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
DATA = ROOT / "data" / "craypas"
CHART = DATA / "source" / "specialist-colorchart.pdf"
BROCHURE = DATA / "source" / "cray-pas-brochure-2020.pdf"
JP_CHART = DATA / "source" / "craypas-jp-chart.jpg"
SWATCH_DIR = DATA / "swatches"

SAMPLE_DPI = 150

# US chart cell geometry, relative to a code word's (xMin, yMin) in PDF pt.
# Cells are ~84pt wide: name at the cell's left edge, "ESP-###" at the right
# (code.xMin - name.xMin is a constant ~49pt), the LF signs ~7pt below the
# code, and the painted swatch directly above the name line.
CELL_X = -49              # cell left edge relative to code.xMin
LF_Y = (4, 11)
SWATCH_WIN_X = (-2, 68)   # relative to the cell's left edge
SWATCH_WIN_Y = (-28, -2)
SWATCH_FALLBACK_Y = (-25, -5)
FOOTER_Y = 745            # the legend / "(ESP-00)" footnote area (~y 770+)

CODE_RE = re.compile(r"^ESP-(\d+)\.?$")  # one cell prints "ESP-320."
# +++ excellent / ++ very good / + fair / – fugitive (the five fluorescents);
# the legend also defines 0 = poor, but no colour uses it.
LF_RE = re.compile(r"^(\+{1,3}|[–-])$")

IRIDESCENT = {"051", "053"}  # Gold, Silver

# JP chart (1000x714): 12 columns x 8 rows of dots, the last row a single
# cell; katakana names sit below each dot.
JP_COLS, JP_ROWS = 12, 8
JP_LAST_ROW_CELLS = 1
JP_NAME_Y = (14, 62)      # name lines relative to a dot's centre
JP_DOT_R = 11             # sample square half-size inside a dot

# English word -> katakana as printed on the JP chart (phrases first).
KANA_PHRASES = {"jaune brilliant": "ジョンブリアン", "terra rosa": "テラローザ"}
KANA_WORDS = {
    "aqua": "アクア", "aureolin": "オーレオリン", "azure": "アズール",
    "black": "ブラック", "blue": "ブルー", "bordeaux": "ボルドー",
    "brown": "ブラウン", "burnt": "バーント", "cadmium": "カドミウム",
    "cerulean": "セルリアン", "cobalt": "コバルト", "compose": "コンポーズ",
    "coral": "コーラル", "deep": "ディープ", "dioxazine": "ジオキサジン",
    "emerald": "エメラルド", "extender": "エクステンダー", "flesh": "フレッシュ",
    "fluorescent": "蛍光", "fresh": "フレッシュ", "gold": "ゴールド",
    "gray": "グレー", "green": "グリーン", "greenish": "グリニッシュ",
    "heliotrope": "ヘリオトロープ", "hooker's": "フーカーズ", "hue": "ヒュー",
    "ice": "アイス", "indigo": "インディゴ", "iris": "アイリス",
    "ivory": "アイボリー", "lavender": "ラベンダー", "lemon": "レモン",
    "lilac": "ライラック", "magenta": "マゼンタ", "mars": "マース",
    "mauve": "モーブ", "middle": "ミドル", "naples": "ネーブルス",
    "ochre": "オーカー", "opera": "オペラ", "orange": "オレンジ",
    "pale": "ペール", "peacock": "ピーコック", "permanent": "パーマネント",
    "pink": "ピンク", "prussian": "プルシャン", "quinacridone": "キナクリドン",
    "raw": "ロー", "red": "レッド", "rose": "ローズ", "salmon": "サーモン",
    "sap": "サップ", "sepia": "セピア", "sienna": "シェンナ",
    "silver": "シルバー", "spring": "スプリング", "titanium": "チタニウム",
    "turquoise": "ターコイズ", "ultramarine": "ウルトラマリン", "umber": "アンバー",
    "venetian": "ベネシャン", "vermilion": "バーミリオン",
    "violet": "バイオレット", "viridian": "ビリジアン", "warm": "ウォーム",
    "white": "ホワイト", "wine": "ワイン", "yellow": "イエロー",
    "yellow-green": "イエローグリーン",
}

# Human-verified katakana for cells whose printed name differs from the
# word-table construction, or that neither OCR pass reads cleanly.
JA_FIXES: dict[str, str] = {}


# --- text helpers -------------------------------------------------------------

def run(cmd) -> bytes:
    return subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL).stdout


def parse_pdf_words(pdf: Path) -> list[tuple[int, float, float, float, float, str]]:
    """(page, xMin, yMin, xMax, yMax, text) for every word in the PDF."""
    xml = run(["pdftotext", "-bbox", str(pdf), "-"]).decode()
    words, page = [], 0
    for line in xml.splitlines():
        if "<page" in line:
            page += 1
        m = re.search(
            r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*)</word>',
            line,
        )
        if m:
            x0, y0, x1, y1 = (float(v) for v in m.groups()[:4])
            words.append((page, x0, y0, x1, y1, html.unescape(m.group(5))))
    return words


def title_case(name: str) -> str:
    """BROCHURE ALL-CAPS -> chart-style names; apostrophes don't start a new
    word ("HOOKER'S GREEN DEEP" -> "Hooker's Green Deep")."""
    return re.sub(r"(?:^|(?<=[\s/-]))[a-z]", lambda m: m.group(0).upper(), name.lower())


def name_key(name: str) -> str:
    """Spelling-insensitive comparison: the 2010 chart writes Grey, curly
    apostrophes and unhyphenated Yellow Green; the brochure Gray etc."""
    s = re.sub(r"[\s-]+", " ", name.lower().replace("’", "'"))
    return s.replace("grey", "gray")


def expected_kana(en: str) -> str:
    s = en.lower()
    for phrase, kana in KANA_PHRASES.items():
        s = s.replace(phrase, kana)
    return "".join(KANA_WORDS.get(w, w) for w in s.split())


_SMALL_KANA = str.maketrans("ァィゥェォャュョッヮ", "アイウエオヤユヨツワ")


def kana_key(s: str) -> str:
    """Comparison key tolerant of the OCR's dakuten (ビ/ヒ) and small-kana
    confusions on ~10px text: strip voicing marks, enlarge small kana."""
    s = re.sub(r"[\s　]", "", s).translate(str.maketrans("-−–—一ｰ", "ーーーーーー"))
    s = unicodedata.normalize("NFD", s)
    s = s.replace("゙", "").replace("゚", "")
    return unicodedata.normalize("NFC", s).translate(_SMALL_KANA)


# --- raster helpers (PPM render of the PDF, BMP via sips for the JPG) ---------

def read_ppm(path: Path):
    data = path.read_bytes()
    assert data[:2] == b"P6", "expected binary PPM"
    idx, fields = 2, []
    while len(fields) < 3:
        while data[idx : idx + 1].isspace():
            idx += 1
        if data[idx : idx + 1] == b"#":
            idx = data.index(b"\n", idx) + 1
            continue
        start = idx
        while not data[idx : idx + 1].isspace():
            idx += 1
        fields.append(int(data[start:idx]))
    w, h, _ = fields
    return w, h, data[idx + 1 :]


def read_bmp(path: Path):
    data = path.read_bytes()
    assert data[:2] == b"BM", "expected BMP"
    pix_offset = struct.unpack_from("<I", data, 10)[0]
    width, height = struct.unpack_from("<ii", data, 18)
    bpp = struct.unpack_from("<HH", data, 26)[1]
    assert struct.unpack_from("<I", data, 30)[0] == 0 and bpp in (24, 32)
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


def bmp_px(rows: bytes, stride: int, bypp: int, x: int, y: int):
    o = y * stride + x * bypp
    return rows[o + 2], rows[o + 1], rows[o]


def paper(r: int, g: int, b: int) -> bool:
    return r > 232 and g > 232 and b > 232


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
    """Bounding box of the painted stroke inside a window; None if too pale."""
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
    band = longest_run([y for y, n in row_hits if n > width * 0.5])
    if len(band) < 15:
        return None
    ry0, ry1 = band[0], band[-1] + 1
    cols = longest_run(
        [
            x
            for x in range(max(0, x0), min(w, x1))
            if sum(
                1
                for y in range(ry0, ry1)
                if not paper(px[y * w * 3 + x * 3], px[y * w * 3 + x * 3 + 1], px[y * w * 3 + x * 3 + 2])
            )
            > (ry1 - ry0) * 0.4
        ]
    )
    if not cols:
        return None
    return cols[0], ry0, cols[-1] + 1, ry1


def sample_hex_ppm(px, w, h, x0, y0, x1, y1) -> str:
    x0, y0, x1, y1 = max(0, x0), max(0, y0), min(w, x1), min(h, y1)
    rs, gs, bs, allc = [], [], [], []
    for y in range(y0, y1):
        base = y * w * 3
        for x in range(x0, x1):
            i = base + x * 3
            r, g, b = px[i], px[i + 1], px[i + 2]
            allc.append((r, g, b))
            if not paper(r, g, b):
                rs.append(r); gs.append(g); bs.append(b)
    if rs and len(rs) / len(allc) > 0.25:
        chans = (rs, gs, bs)
    else:
        chans = ([c[0] for c in allc], [c[1] for c in allc], [c[2] for c in allc])
    r, g, b = (int(statistics.median(c)) for c in chans)
    if min(r, g, b) >= 250:
        r = g = b = 255
    return f"#{r:02X}{g:02X}{b:02X}"


def sips_crop(src: Path, out: Path, x: int, y: int, w: int, h: int) -> None:
    subprocess.run(
        ["sips", "-c", str(h), str(w), "--cropOffset", str(y), str(x), str(src), "--out", str(out)],
        check=True, capture_output=True,
    )


# --- Vision OCR (Japanese) ----------------------------------------------------

VISION_OCR_JS = """
ObjC.import('Vision');
ObjC.import('Foundation');
function run(argv) {
  const url = $.NSURL.fileURLWithPath(argv[0]);
  const handler = $.VNImageRequestHandler.alloc.initWithURLOptions(url, $.NSDictionary.dictionary);
  const req = $.VNRecognizeTextRequest.alloc.init;
  req.recognitionLevel = 0; // accurate
  req.usesLanguageCorrection = false;
  req.recognitionLanguages = $.NSArray.arrayWithArray(['ja-JP', 'en-US']);
  handler.performRequestsError($.NSArray.arrayWithObject(req), Ref());
  const results = req.results;
  const out = [];
  for (let i = 0; i < results.count; i++) {
    const obs = results.objectAtIndex(i);
    const text = obs.topCandidatesWithCount
      ? obs.topCandidatesWithCount(1).objectAtIndex(0).string.js
      : obs.topCandidates(1).objectAtIndex(0).string.js;
    const bb = obs.boundingBox; // normalised, origin bottom-left
    out.push(JSON.stringify({ text, y: bb.origin.y, h: bb.size.height }));
  }
  return out.join('\\n');
}
"""


def ocr_jp_cell(
    src: Path, helper: Path, tmp: Path, x: int, y: int, w: int, h: int,
    img_w: int, img_h: int, scale: int = 4,
) -> str:
    """OCR one JP-chart cell's name block at upscale; lines joined in
    top-to-bottom order."""
    x0, y0 = max(0, x), max(0, y)
    w, h = min(x + w, img_w - 1) - x0, min(y + h, img_h - 1) - y0
    crop = tmp / "jpcell.png"
    sips_crop(src, crop, x0, y0, w, h)
    subprocess.run(["sips", "-z", str(h * scale), str(w * scale), str(crop)], check=True, capture_output=True)
    res = subprocess.run(
        ["osascript", "-l", "JavaScript", str(helper), str(crop)],
        check=True, capture_output=True, text=True,
    )
    lines = []
    for line in res.stdout.splitlines():
        if line.strip().startswith("{"):
            o = json.loads(line)
            lines.append((1 - o["y"] - o["h"], o["text"]))
    return "".join(t for _, t in sorted(lines))


def fit_jp_grid(rows, stride, bypp, w, h):
    """Fit the 12x8 dot grid from saturated pixels (the dots; text is black,
    so it doesn't register), snapping to the uniform pitch."""
    def saturated(x, y):
        r, g, b = bmp_px(rows, stride, bypp, x, y)
        return max(r, g, b) - min(r, g, b) > 50

    ys = [y for y in range(h) if sum(saturated(x, y) for x in range(0, w, 2)) > 20]
    xs = [x for x in range(w) if sum(saturated(x, y) for y in range(0, h, 2)) > 15]

    def centers(vals, expect):
        groups = []
        for v in vals:
            if groups and v - groups[-1][-1] <= 6:
                groups[-1].append(v)
            else:
                groups.append([v])
        cs = [round(statistics.median(g)) for g in groups if len(g) > 4]
        if len(cs) < 2:
            return None
        # snap to a uniform pitch fitted on the detected centres
        pitch = (cs[-1] - cs[0]) / round((cs[-1] - cs[0]) / statistics.median(
            [b - a for a, b in zip(cs, cs[1:])]
        ))
        first = cs[0] - round(cs[0] / pitch - 0.01) * pitch if cs[0] > pitch else cs[0]
        n = round((cs[-1] - first) / pitch) + 1
        grid = [round(first + i * pitch) for i in range(max(n, expect))]
        return grid[:expect]

    col_xs = centers(xs, JP_COLS)
    row_ys = centers(ys, JP_ROWS)
    if not col_xs or not row_ys or len(col_xs) != JP_COLS or len(row_ys) != JP_ROWS:
        sys.exit(f"JP grid fit failed: cols={col_xs} rows={row_ys}")
    return col_xs, row_ys


def median_hex_bmp(rows, stride, bypp, x0, y0, x1, y1) -> str:
    rs, gs, bs = [], [], []
    for y in range(y0, y1):
        for x in range(x0, x1):
            r, g, b = bmp_px(rows, stride, bypp, x, y)
            rs.append(r); gs.append(g); bs.append(b)
    r, g, b = (int(statistics.median(c)) for c in (rs, gs, bs))
    if min(r, g, b) >= 250:
        r = g = b = 255
    return f"#{r:02X}{g:02X}{b:02X}"


# --- sources ------------------------------------------------------------------

def parse_brochure() -> dict[str, str]:
    """The current open-stock list: code -> name (Title Case). Lines read
    'ESP-024  CP SPECIALIST - MAUVE  EA 6 864 <UPC>'."""
    words = parse_pdf_words(BROCHURE)
    out = {}
    for pg, x0, y0, x1, y1, text in words:
        m = CODE_RE.match(text)
        if not m:
            continue
        line = sorted(
            (w for w in words if w[0] == pg and abs(w[2] - y0) < 2.0 and w[1] > x1),
            key=lambda w: w[1],
        )
        tokens = [w[5] for w in line]
        if "-" not in tokens or "EA" not in tokens:
            continue
        name = " ".join(tokens[tokens.index("-") + 1 : tokens.index("EA")])
        out[m.group(1)] = title_case(name)
    return out


def parse_us_chart():
    """The 2010 chart: code -> {name, lf, swatch px bounds, hex}."""
    words = [w for w in parse_pdf_words(CHART) if w[0] == 1]

    with tempfile.TemporaryDirectory() as td:
        run(["pdftoppm", "-r", str(SAMPLE_DPI), "-f", "1", "-l", "1", str(CHART), td + "/pg"])
        ppm = next(Path(td).glob("pg*.ppm"))
        sw, sh, spx = read_ppm(ppm)
    s = SAMPLE_DPI / 72.0

    cells = {}
    for pg, x0, y0, x1, y1, text in words:
        m = CODE_RE.match(text)
        if not m or y0 > FOOTER_Y:
            continue
        code = m.group(1)
        name = " ".join(
            w[5]
            for w in sorted(words, key=lambda w: w[1])
            if abs(w[2] - y0) < 2.0 and x0 - 75 < w[1] < x0 and not CODE_RE.match(w[5])
        )
        lf = next(
            (
                w[5]
                for w in words
                if LF_RE.match(w[5])
                and LF_Y[0] < w[2] - y0 < LF_Y[1]
                and x0 - 6 < w[1] < x1 + 6
            ),
            None,
        )

        cx = x0 + CELL_X
        wx0, wx1 = round((cx + SWATCH_WIN_X[0]) * s), round((cx + SWATCH_WIN_X[1]) * s)
        wy0, wy1 = round((y0 + SWATCH_WIN_Y[0]) * s), round((y0 + SWATCH_WIN_Y[1]) * s)
        bounds = find_swatch_bounds(spx, sw, sh, wx0, wy0, wx1, wy1)
        if bounds is None:  # near-white strokes (Titanium White)
            bounds = (
                round((cx + SWATCH_WIN_X[0] + 2) * s), round((y0 + SWATCH_FALLBACK_Y[0]) * s),
                round((cx + SWATCH_WIN_X[1] - 2) * s), round((y0 + SWATCH_FALLBACK_Y[1]) * s),
            )
        cells[code] = {
            "name": name,
            "lf": lf,
            "bounds": bounds,
            "hex": sample_hex_ppm(spx, sw, sh, *bounds),
        }
    return cells


def parse_jp_chart(expected: dict[str, str], tmp: Path):
    """Match every JP-chart cell to a colour code by katakana name.
    Returns code -> {ja, dot center}."""
    helper = tmp / "visionja.js"
    helper.write_text(VISION_OCR_JS)

    bmp = tmp / "jp.bmp"
    subprocess.run(["sips", "-s", "format", "bmp", str(JP_CHART), "--out", str(bmp)],
                   check=True, capture_output=True)
    w, h, rows, bypp, stride = read_bmp(bmp)
    col_xs, row_ys = fit_jp_grid(rows, stride, bypp, w, h)
    pitch = col_xs[1] - col_xs[0]

    cell_list = [(r, c) for r in range(JP_ROWS - 1) for c in range(JP_COLS)]
    cell_list += [(JP_ROWS - 1, c) for c in range(JP_LAST_ROW_CELLS)]

    by_key = {}
    for code, kana in expected.items():
        key = kana_key(kana)
        assert key not in by_key, f"ambiguous kana key {key!r}"
        by_key[key] = code

    assigned: dict[str, dict] = {}
    problems = []
    for r, c in cell_list:
        gx, gy = col_xs[c], row_ys[r]
        text = ocr_jp_cell(
            JP_CHART, helper, tmp,
            gx - pitch // 2, gy + JP_NAME_Y[0], pitch, JP_NAME_Y[1] - JP_NAME_Y[0],
            w, h,
        )
        code = by_key.get(kana_key(text))
        if code is None:
            # short names (グレー) sometimes vanish at 4x; a roomier window
            # at 6x reads them.
            text = ocr_jp_cell(
                JP_CHART, helper, tmp,
                gx - pitch // 2 - 4, gy + JP_NAME_Y[0] - 6, pitch + 8,
                JP_NAME_Y[1] - JP_NAME_Y[0] + 10, w, h, scale=6,
            )
            code = by_key.get(kana_key(text))
        if code is None:
            problems.append(f"JP cell r{r}c{c}: unmatched OCR {text!r} (key {kana_key(text)!r})")
            continue
        if code in assigned:
            problems.append(f"JP cell r{r}c{c}: {code} already assigned")
            continue
        assigned[code] = {"ja": JA_FIXES.get(code, expected[code]), "dot": (gx, gy)}

    return assigned, (w, h, rows, bypp, stride), problems


# --- main ---------------------------------------------------------------------

def main() -> None:
    for src in (CHART, BROCHURE, JP_CHART):
        if not src.exists():
            sys.exit(f"missing source: {src}")
    SWATCH_DIR.mkdir(parents=True, exist_ok=True)

    lineup = parse_brochure()           # authoritative current codes + names
    us = parse_us_chart()               # names, LF, swatches for 83 colours
    expected_ja = {code: JA_FIXES.get(code, expected_kana(name)) for code, name in lineup.items()}

    problems = []
    if len(lineup) != 85:
        problems.append(f"brochure lineup: expected 85 codes, got {len(lineup)}")
    missing_from_chart = set(lineup) - set(us)
    if missing_from_chart != {"00", "024"}:
        problems.append(f"chart/lineup mismatch: chart lacks {sorted(missing_from_chart)}, "
                        f"extra {sorted(set(us) - set(lineup))}")
    for code, cell in us.items():
        if code in lineup and name_key(cell["name"]) != name_key(lineup[code]):
            problems.append(f"{code}: chart name {cell['name']!r} != brochure {lineup[code]!r}")
        if not cell["lf"]:
            problems.append(f"{code}: no lightfastness sign found")

    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        ja, (jw, jh, jrows, jbypp, jstride), jp_problems = parse_jp_chart(expected_ja, tmp)
        problems += jp_problems
        if set(ja) != set(lineup):
            problems.append(f"JP chart unmatched codes: {sorted(set(lineup) - set(ja))}")

        # swatches: painted strokes from the US chart; for Mauve and the
        # Extender (absent there) the JP chart's dot.
        s = SAMPLE_DPI / 72.0
        colors = []
        for code, name in lineup.items():
            cell = us.get(code)
            if cell:
                bx0, by0, bx1, by1 = cell["bounds"]
                run(["pdftoppm", "-png", "-r", str(SAMPLE_DPI), "-f", "1", "-l", "1",
                     "-x", str(bx0), "-y", str(by0), "-W", str(bx1 - bx0), "-H", str(by1 - by0),
                     str(CHART), str(SWATCH_DIR / f"_{code}")])
                next(SWATCH_DIR.glob(f"_{code}-*.png")).rename(SWATCH_DIR / f"{code}.png")
                hexv, lf, en = cell["hex"], cell["lf"], name  # brochure spelling is current
            elif code in ja:
                gx, gy = ja[code]["dot"]
                x0, y0 = gx - JP_DOT_R, gy - JP_DOT_R
                sips_crop(JP_CHART, SWATCH_DIR / f"{code}.png", x0, y0, JP_DOT_R * 2, JP_DOT_R * 2)
                hexv = median_hex_bmp(jrows, jstride, jbypp, x0 + 3, y0 + 3,
                                      x0 + JP_DOT_R * 2 - 3, y0 + JP_DOT_R * 2 - 3)
                lf, en = None, name  # the JP/2020 sources don't rate these
            else:
                continue  # already reported

            names = {"en": en}
            if code in ja:
                names["ja"] = ja[code]["ja"]
            colors.append({
                "code": code,
                "name": en,
                "names": names,
                "transparency": None,       # not published by Sakura
                "pigments": [],             # not published by Sakura
                "lightfastness": lf,        # +++ / ++ / – as printed (see LF_RE)
                "iridescent": code in IRIDESCENT,
                "new": False,
                "giant": False,
                "hex": hexv,
                "swatch": f"swatches/{code}.png",
            })

    lf_counts = [c["lightfastness"] for c in colors]
    dist = (lf_counts.count("+++"), lf_counts.count("++"), lf_counts.count("+"),
            lf_counts.count("–") + lf_counts.count("-"), lf_counts.count(None))
    # 83 rated cells on the chart; Mauve and the Extender are unrated.
    if dist != (69, 9, 0, 5, 2):
        problems.append(f"LF distribution {dist} != chart's (69, 9, 0, 5, 2)")
    if len(colors) != 85:
        problems.append(f"expected 85 entries, got {len(colors)}")

    colors.sort(key=lambda c: (len(c["code"]), c["code"]))
    (DATA / "colors.json").write_text(json.dumps(colors, ensure_ascii=False, indent=2) + "\n")
    print(f"Extracted {len(colors)} colours -> data/craypas/colors.json")
    for c in colors:
        print(f"  {c['code']:>4}  {c['hex']}  {c['lightfastness'] or '-':>3}  "
              f"{c['name']}  [{c['names'].get('ja', '?')}]")
    if problems:
        print("\nPROBLEMS:")
        print("\n".join(f"  {p}" for p in problems))
        raise SystemExit(1)


if __name__ == "__main__":
    main()
