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

The catalogue currently covers the Sennelier oil pastel range (120 colours);
the data model and UI aren't tied to a single brand, and more brands are on
the way.

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

The colour data lives in `data/` and the server seeds the database from it on
first start.

| Path | What |
|------|------|
| `data/colors.json` | The catalogue — 120 entries (see schema below). |
| `data/swatches/<code>.png` | Cropped swatch image of each colour's real stroke. |
| `data/names.json` | Authoritative 6-language names, transcribed from the chart. |
| `scripts/extract_colors.py` | Regenerates `colors.json` + swatches from the PDF. |
| `Colourchart_Oilpastels.pdf` / `.png` | Original source chart. |

### `colors.json` schema

```json
{
  "code": "038",                     // colour code (string, may have leading zeros)
  "name": "Vermilion",               // English name (convenience copy of names.en)
  "names": {                         // all six languages from the chart
    "fr": "Vermillon", "en": "Vermilion", "de": "Zinnober",
    "es": "Bermellón", "it": "Vermiglione", "nl": "Vermiljoen"
  },
  "transparency": "T",               // "T" (transparent) | "O" (opaque) | "T/O" (semi)
  "pigments": ["PO 20", "PR 108"],   // Colour Index pigment codes; [] for the medium
  "lightfastness": "I",              // "I" (***) | "II" (**) | "III" (*)  — I is most lightfast
  "iridescent": false,               // true for the metallic / pearlescent range
  "new": false,                      // chart flagged the colour "New"
  "giant": false,                    // also sold as a 78 ml "giant" stick (▲); only 001 & 023
  "hex": "#E8503E",                  // representative colour sampled from the printed swatch
  "swatch": "swatches/038.png"       // path to the cropped swatch image
}
```

`hex` is sampled from the *printed* chart swatch (median of the stroke
pixels), so it approximates the pastel — good enough to render in a UI, not a
colorimetric match. The catalogue includes the `221` Transparent medium and
the iridescent metallics, which is how it comes to 120 entries.

### Extracting the Sennelier chart

The catalogue was extracted from Sennelier's official colour chart PDF.
Regenerating it requires [poppler](https://poppler.freedesktop.org/)
(`pdftotext`, `pdftoppm`); no Python packages needed:

```sh
python3 scripts/extract_colors.py
```

The chart is an 8-band × 15-column grid. Each cell is anchored on its 3-digit
code (`pdftotext -bbox` gives word coordinates). The tricky part is that long
names and pigment lists overflow horizontally into neighbouring columns, so:

- **names** come from `data/names.json` (read directly from the chart); the
  geometric FR name is parsed only as a cross-check.
- **transparency + pigments** are recovered by splitting each band's pigment row
  on the `T`/`O`/`T/O` tokens (short, reliably anchored at each cell's left edge —
  every band splits into exactly 15 cells).
- **lightfastness** comes from the `*` group at each cell's line-3 anchor.
- **swatches/hex** are cropped/sampled from a render of the region just above
  each code (`[code.x, next_code.x)`).
