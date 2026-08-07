# Working in this repository

Guidance for anyone — human or agent — writing code here. Read
[`ARCHITECTURE.md`](ARCHITECTURE.md) first for what the app is and how it is put together,
and [`INPUT-FORMAT.md`](INPUT-FORMAT.md) before touching anything that reads a supplier file;
this file is about how to work on it.

## Current state

The repository was deliberately reset. The previous Create React App implementation has been
removed; what remains is documentation plus [`archive/`](archive/), which holds the
coordinate maths and the old implementation for reference.

**There is no application yet.** The first task is scaffolding it — Vite + Vue 3 +
TypeScript, per `ARCHITECTURE.md` §3. Until that exists, the commands below describe the
intended setup rather than something you can run.

## Commands

```bash
npm install
npm run dev          # Vite dev server
npm run build        # production build → dist/
npm run preview      # serve the production build locally
npm run test         # Vitest, single run
npm run test:watch   # Vitest, watch mode
npm run typecheck    # vue-tsc --noEmit
npm run lint         # ESLint
```

Run `npm run test` and `npm run typecheck` before committing. If you change anything under
`src/domain/`, run the tests — that code is the reason the answers are right.

## Conventions

- **Vue 3 `<script setup>` with TypeScript.** Composition API throughout; no Options API.
- **Components render, the domain calculates.** No coordinate arithmetic in a `.vue` file.
  If you find yourself writing trigonometry in a component, it belongs in `src/domain/`.
- **`src/domain/` is pure.** No Vue imports, no DOM, no fetch, no Leaflet types. It is
  plain TypeScript that takes numbers and returns numbers, which is what makes it testable.
- **Units are in the name.** `focalLengthMm`, `heightAboveGroundM`, `headingDeg`,
  `groundWidthM`. A bare `width` or `height` in this codebase is a bug waiting to happen —
  the domain has film millimetres, ground metres, and screen pixels all in play at once.
- **Never `parseInt` a measurement.** Use `Number()` / `parseFloat` and validate. Truncating
  152.4 mm to 152 mm is a real error in real data.
- **Fail loudly per row, not per file.** One malformed line must not discard the other
  forty-nine. Collect it in `ParseIssue[]` with a line number and a readable reason.
- Prefer plain functions to classes. Prefer explicit types on module boundaries.

## Domain rules that catch people out

These are the mistakes that produce plausible-looking, wrong output. `archive/MATHS.md` has
the derivations.

1. **Always convert OSGB36 → WGS84.** Grid references are OSGB36; map tiles are WGS84.
   The gap is 70–120 m in Great Britain — 107 m on the first row of the real sample. This was
   the headline bug in the old app: it plotted OSGB36 latitudes straight onto an OSM basemap.
2. **A grid reference is a square.** Supplier centre points are six-figure — a 100 m square,
   so ±50 m. Use its centre and keep `precisionM` so the UI can be honest about it.
3. **The supplier's scale is nominal.** It is the survey's target, and real frames vary with
   aircraft altitude and terrain. Footprints are indicative extents, never surveyed
   boundaries, and the UI must not imply otherwise.
4. **Obliques get no footprint.** No scale, no focal length, no height, no bearing — there is
   nothing to compute from. Plot the point and stop.
5. **Catalogue units are inches.** `6` is a 6″ lens (152.4 mm); `9 x 9` is a 228.6 mm frame.
   Convert on the way in.
6. **Photo scale uses height *above ground*,** not altitude above sea level.
7. **Grid north ≠ true north.** Convergence reaches ~4° at the edges of the grid. No current
   source supplies a heading, so this is dormant — but it matters by tens of metres the day
   one does.
8. **Do the rectangle geometry in eastings/northings,** then convert each corner. The grid is
   a plane; treat it as one.

## Testing

The domain layer carries the test burden, and it can: it is pure functions.

- Grid reference parsing: each precision from 2 to 10 figures, with and without spaces,
  lowercase letters, the skipped `I` in the letter pairs, and rejection of nonsense.
- Datum conversion: known OS control points, asserted to ≤5 m.
- Footprint sizing: the worked examples in `archive/MATHS.md` §4 — including the three the
  supplier's own guide supplies (1:2500 ≈ 0.13 sq miles, 1:10 000 ≈ 2, 1:15 000 ≈ 4.5).
- Rotation: heading 0° gives an axis-aligned box; 90° swaps the ground dimensions;
  360° round-trips.
- Workbook parsing: header found below banner rows; columns mapped through spacer and merged
  cells; `Total Frames` trailer skipped and used to check the row count; `5356A` kept as text;
  `23.0` rendered `23`; a malformed row landing in `ParseIssue[]` without taking the others
  with it.

Build fixtures from `INPUT-FORMAT.md` §3 rather than committing supplier files — those are
customer data and third-party catalogue records, and they stay out of the repository.

UI tests are worth writing for parsing-to-display wiring and not much else.

## Don't

- Don't add a backend or upload user files anywhere. Everything runs in the browser, and the
  supplier quote files people load here are theirs.
- Don't add a Leaflet Vue wrapper. We draw polygons ourselves; a wrapper adds a dependency
  that lags Vue releases for no benefit.
- Don't edit anything in `archive/` except its documentation. It is a record, not a library.
- Don't commit supplier files. They are customer enquiry data and third-party catalogue
  records. Document the format in `INPUT-FORMAT.md` and build synthetic fixtures from it.
- Don't guess at the file format beyond `INPUT-FORMAT.md`. Extending it is fine — quietly
  hard-coding a different guess is not. Update the document in the same change, and mark what
  is observed from a real sample versus inferred from the supplier's guide.
- Don't invent a footprint for a record that doesn't support one. Plausible-looking output
  that isn't derivable from the data is worse than no output.

## Commits

Short imperative subjects (`Add OSGB grid reference parser`). Keep the domain layer and its
tests in the same commit. Development happens on feature branches; `main` should always build.
