# Sennelier Oil Pastels

A mobile-first web app to track a personal inventory of Sennelier oil pastels,
built on a structured catalogue of the **120** colours extracted from the
official colour chart (`Colourchart_Oilpastels.pdf`).

## Web app

Monorepo (pnpm workspaces): `web/` (React + Vite + Tailwind), `server/`
(Hono + `node:sqlite`), `shared/` (Zod schemas + types used by both). Username/
password login, per-colour quantity + a remaining-level chip (Full → Empty).

```sh
pnpm install
pnpm seed     # create SQLite db (server/var/app.db) + load the catalogue
pnpm dev      # web on http://localhost:5173, API on :3000 (Vite proxies /api, /swatches)
```

Open `http://localhost:5173`, register an account, and browse. Other scripts:
`pnpm build` + `pnpm start` (single Node process serving API + `web/dist`),
`pnpm test`, `pnpm typecheck`.

- **Requirements:** Node ≥ 22.5 (uses the built-in `node:sqlite`; no native
  build needed — portable to any recent-Node host). A dev account `jaakko` /
  `pastels123` already exists in the seeded db; delete `server/var/app.db` to reset.
- **Auth:** session cookie; registration is open (local/personal use). OAuth
  social login is a planned follow-up (the schema leaves room for it).

## Colour data

Structured catalogue extracted from the official chart; the app seeds from it and
the extractor (`scripts/extract_colors.py`) remains its single source of truth.

## Files

| Path | What |
|------|------|
| `data/colors.json` | The catalogue — 120 entries (see schema below). |
| `data/swatches/<code>.png` | Cropped swatch image of each colour's real stroke. |
| `data/names.json` | Authoritative 6-language names, transcribed from the chart. |
| `scripts/extract_colors.py` | Regenerates `colors.json` + swatches from the PDF. |
| `Colourchart_Oilpastels.pdf` / `.png` | Original source chart. |

## `colors.json` schema

```json
{
  "code": "038",                     // Sennelier colour code (string, may have leading zeros)
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

Notes:
- `hex` is sampled from the *printed* chart swatch (median of the stroke pixels),
  so it approximates the pastel — good enough to render in a UI, not a colorimetric match.
- The catalogue includes `221` Transparent medium and the iridescent metallics
  (`111`–`135`, `125`, `123`), which is why the count is 120 cells.

## Regenerating

Requires [poppler](https://poppler.freedesktop.org/) (`pdftotext`, `pdftoppm`); no
Python packages needed.

```sh
python3 scripts/extract_colors.py
```

### How it works
The chart is an 8-band × 15-column grid. Each cell is anchored on its 3-digit
code (`pdftotext -bbox` gives word coordinates). The tricky part is that long
names and pigment lists **overflow horizontally** into neighbouring columns, so:

- **names** come from `data/names.json` (read directly from the chart); the
  geometric FR name is parsed only as a cross-check.
- **transparency + pigments** are recovered by splitting each band's pigment row
  on the `T`/`O`/`T/O` tokens (short, reliably anchored at each cell's left edge —
  every band splits into exactly 15 cells).
- **lightfastness** comes from the `*` group at each cell's line-3 anchor.
- **swatches/hex** are cropped/sampled from a render of the region just above
  each code (`[code.x, next_code.x)`).
