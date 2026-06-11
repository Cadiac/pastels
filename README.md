# Pastels

A mobile-first web app for keeping track of an oil pastel collection. Browse
the full colour catalogue, mark what you own and how much of each stick is
left, and keep favourites, a want list, and notes per colour.

A live instance runs at **pastels.cadi.ac**.

## Features

- **Catalogue browser** — every colour as a swatch card, searchable by name
  (in six languages), code, or pigment; filter by owned / missing / running
  low / favourites / wanted; sort by code, name, hue, or value (lightness);
  grid and list views.
- **Inventory** — stick count per colour plus a "remaining" level for the
  stick in use (Full → Empty), with a usage history of every change.
- **Favourites, want list, notes** — per-colour, per-user.
- **Colour detail pages** — pigment, transparency and lightfastness data, a
  value-scale placement, and harmonic colour suggestions (complementary,
  analogous, triadic) picked from real catalogue colours, with owned ones
  marked.
- **Installable PWA**, designed for phone and tablet use first.
- **Multiple brand catalogues**, switchable in the app — currently Sennelier
  Oil Pastels (120 colours), Mungyo Gallery Artists' Soft Oil Pastels (the
  MOPV-120 "Renewal Color" assortment, 120), Van Gogh Oil Pastels by Royal
  Talens (60), Holbein Artists' Oil Pastels (141), Caran d'Ache Neopastel
  (96), and Caran d'Ache Neoart 6901 (48). Inventory, favourites and notes
  are kept per colour across all of them.

## Stack

pnpm workspace monorepo:

| Package | What |
|---------|------|
| `web/` | React + Vite + Tailwind SPA |
| `server/` | Hono API on Node's built-in `node:sqlite` |
| `shared/` | Zod schemas, types and colour math used by both |

Accounts are username/password with session cookies; each user sees only
their own inventory.

## Development

Requires Node ≥ 22.5 (for `node:sqlite` — no native modules, so it runs on
any recent-Node host).

```sh
pnpm install
pnpm seed     # create SQLite db (server/var/app.db) + load the catalogue
pnpm dev      # web on http://localhost:5173, API on :3000 (Vite proxies /api, /swatches)
```

Open `http://localhost:5173` and register an account. Delete
`server/var/app.db` to reset the local database.

Other scripts: `pnpm build` + `pnpm start` (single Node process serving the
API and `web/dist`), `pnpm test`, `pnpm typecheck`.

## Deployment

The production instance runs the single Node process (API, built SPA, and
swatch images) as a systemd service behind nginx, which terminates TLS via
Let's Encrypt. The SQLite database lives under `server/var/` — gitignored and
persisted across redeploys.

To update after pushing to `main` (on the server, as root):

```sh
bash /opt/pastels/deploy/update.sh   # git pull → pnpm install → build → restart
```

First-time provisioning (Node, the systemd unit, the nginx site, certbot) is
documented in [`deploy/`](deploy/README.md).

## Catalogue data

Colour data lives in `data/`, one directory per brand catalogue, and the
server (re)seeds the database from it on every boot:

| Path | What |
|------|------|
| `data/catalogues.json` | The list of brand catalogues. |
| `data/<brand>/colors.json` | One catalogue's colours (see schema below). |
| `data/<brand>/swatches/<code>.png` | Cropped swatch image per colour. |
| `data/<brand>/source/` | The original colour charts the data was extracted from. |
| `data/sennelier/names.json` | Authoritative 6-language names, transcribed from the chart. |
| `scripts/<brand>/extract_colors.py` | Regenerates that brand's `colors.json` + swatches. |

Each colour is identified app-wide as `<catalogue>-<code>` (e.g.
`sennelier-038`, `mungyo-201`), since plain codes collide across brands.

### `colors.json` schema

```json
{
  "code": "038",                     // brand colour code (string, may have leading zeros)
  "name": "Vermilion",               // English name (convenience copy of names.en)
  "names": {                         // chart languages; "en" required, others optional
    "fr": "Vermillon", "en": "Vermilion", "de": "Zinnober",
    "es": "Bermellón", "it": "Vermiglione", "nl": "Vermiljoen"
  },
  "transparency": "T",               // "T" | "O" | "T/O", or null if unpublished
  "pigments": ["PO 20", "PR 108"],   // Colour Index pigment codes; [] if unpublished
  "lightfastness": "I",              // brand's own scale as printed, or null
  "iridescent": false,               // true for metallic / pearlescent colours
  "new": false,                      // chart flagged the colour "New"
  "giant": false,                    // Sennelier 78 ml "giant" stick (▲); only 001 & 023
  "hex": "#E8503E",                  // representative colour sampled from the chart swatch
  "swatch": "swatches/038.png"       // path within the catalogue directory
}
```

`hex` is sampled from the chart swatch (median of the stroke pixels), so it
approximates the pastel — good enough to render in a UI, not a colorimetric
match.

### Extracting the Sennelier chart

Extracted from Sennelier's official colour chart PDF, which has a text layer.
The catalogue includes the `221` Transparent medium and the iridescent
metallics, which is how it comes to 120 entries. Regenerating requires
[poppler](https://poppler.freedesktop.org/) (`pdftotext`, `pdftoppm`); no
Python packages needed:

```sh
python3 scripts/sennelier/extract_colors.py
```

The chart is an 8-band × 15-column grid. Each cell is anchored on its 3-digit
code (`pdftotext -bbox` gives word coordinates). The tricky part is that long
names and pigment lists overflow horizontally into neighbouring columns, so:

- **names** come from `data/sennelier/names.json` (read directly from the
  chart); the geometric FR name is parsed only as a cross-check.
- **transparency + pigments** are recovered by splitting each band's pigment row
  on the `T`/`O`/`T/O` tokens (short, reliably anchored at each cell's left edge —
  every band splits into exactly 15 cells).
- **lightfastness** comes from the `*` group at each cell's line-3 anchor.
- **swatches/hex** are cropped/sampled from a render of the region just above
  each code (`[code.x, next_code.x)`).

### Extracting the Van Gogh chart

Extracted from Royal Talens' official "colour chart Van Gogh oil pastels"
PDF, which has a clean text layer with names, pigments, and ASTM
lightfastness signs (`+++`/`++`/`+`/`o`). Cells are anchored on the code
tokens (`504.5`-style — the suffix is Talens' tone system: .3 with black,
.5 full shade, .7/.8/.9 with increasing white); centre-aligned names and
pigments overflow their columns, so each row's words are split by nearest
column centre. The painted strokes' exact boxes are detected from the
rendered raster (with a fixed fallback for the near-white ones). Requires
poppler:

```sh
python3 scripts/vangogh/extract_colors.py
```

### Extracting the Holbein chart

Two official Holbein US documents, both with text layers: the digital colour
chart (codes, English + French names, permanency stars `***`/`**`/`*`) and
the technical data sheet (Colour Index pigments per pigment family). Codes
are `<family>-<tint>` — 45 families in tint depths 1/3/5 (deep/medium/light,
the French names carry the qualifier), plus three grey families running
1–5, 141 sticks in all. English names come from the chart cells (the TDS
only knows family names; the chart distinguishes Black/White inside
"Non-Color No.1"), pigments from the TDS with continuation-line handling.
Swatch boxes are detected from the raster like Van Gogh's. Requires poppler:

```sh
python3 scripts/holbein/extract_colors.py
```

### Extracting the Caran d'Ache charts

**Neopastel** comes from the official "NEOPASTEL® COLOUR CHART" PDF (vector
text): per colour a code, name, slash-separated CI pigments and a UV star
rating. The row's colour is a pale-to-full gradient bar whose right end
carries the full-strength colour, located per row from the rendered raster
(the metallics print a pigment description — "Poudre de Bronze" — instead of
CI codes, kept verbatim). Requires poppler:

```sh
python3 scripts/neopastel/extract_colors.py
```

**Neoart 6901** (2025) has no published chart PDF yet; the source is Caran
d'Ache's official 48-cell chart image as circulated by stockists
(`data/neoart/source/neoart-colour-chart.jpg`). Each cell has a painted
stroke, a code badge, the per-colour ASTM D-6901 rating (LFI/LFII), names in
six languages and a CI pigment line. It's a raster, so cells are anchored on
code badges read with macOS Vision OCR (grid-fit recovers badges OCR drops),
with a per-cell 4× retry pass and a small human-verified fix-up table; codes
and names are cross-checked against the open-stock variant list
(`openstock-variants.json`). The extracted LFI/LFII counts must match the
official aggregate (34 + 14). macOS-only:

```sh
python3 scripts/neoart/extract_colors.py
```

### Extracting the Mungyo chart

Extracted from Mungyo's own MOPV colour chart image (`data/mungyo/source/`),
whose bottom "MOPV 120 COLORS _ Renewal Color" section is the current
MOPV-120* assortment. The chart is a raster with no text layer, so the
extractor works geometrically: it fits the 6×20 swatch grid from saturation
histograms, samples each swatch's median colour, and OCRs each cell's
"`<code> <Name>`" with the macOS Vision framework — two passes (full strip +
per-cell 4× upscale) that cross-check each other, plus a small human-verified
fix-up table for the handful of cells both passes misread. Mungyo publishes
no pigment, transparency or lightfastness data, so those fields are null.
macOS-only (`sips` + Vision):

```sh
python3 scripts/mungyo/extract_colors.py
```
