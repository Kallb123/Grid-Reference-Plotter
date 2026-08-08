# Working in this repository

Guidance for anyone — human or agent — writing code here. Read
[`ARCHITECTURE.md`](ARCHITECTURE.md) first for what the app is and how it is put together,
and [`INPUT-FORMAT.md`](INPUT-FORMAT.md) before touching anything that reads a supplier file;
this file is about how to work on it.

## Current state

The repository was deliberately reset. The previous Create React App implementation has been
removed; [`archive/`](archive/) holds the coordinate maths and the old implementation for
reference.

Milestones 1 to 7 of `ARCHITECTURE.md` §9 are done: the Vite + Vue 3 + TypeScript scaffold
exists, `src/domain/` carries grid reference parsing, the datum transform, the footprint geometry,
the plot bounds, the coverage maths, the scale bands and the listing filter, `src/io/` reads a
supplier workbook into records and issues, and `src/composables/` + `src/components/` join the two
to a Leaflet map and a sortable table — drop a workbook, see the footprints drawn and framed, mark
the site you want photographs of, read off which frames cover it and by how much, and answer four
questions that narrow fifty frames to the handful worth ordering. Next up is export (milestone 8):
the chosen frames back out as GeoJSON, and a shortlist as a spreadsheet carrying the columns a
supplier needs to take an order.

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
- **No colour, radius or typeface written into a component.** `src/styles.css` holds the brand's
  tokens; take `var(--ink)`, `var(--accent)`, `var(--radius-md)` and the rest from there. The
  exception is the map: Leaflet styles paths through JavaScript, so those colours are named
  constants in `useLeafletMap` and the legend imports them rather than repeating the hex.
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
   a plane; treat it as one. The same goes for anything measured against the user's area of
   interest: bring the site back to grid metres with `wgs84ToGrid` and intersect there. Comparing
   shapes in degrees is harder arithmetic for a worse answer.
9. **A coverage figure is a comparison with an estimate.** The frame it was measured against is
   an indicative extent positioned by a ±50 m centre point, so a site sitting 20 m inside a
   frame's edge is not demonstrably inside it. `FrameCoverage.marginal` is that case; do not
   drop it on the way to the screen.
10. **`wgs84ToGrid` throws off the National Grid.** It takes positions the *user* supplies, and
    nothing stops someone panning to France and clicking. Callers handle it; `useAreaOfInterest`
    refuses the site with a reason rather than letting the exception reach a render.
11. **A filter criterion a record cannot answer never rejects it.** An oblique has no scale, a
    listing may give no date, and `Held` carries codes this app has not seen. None of those is
    evidence against a frame, so `domain/filter` keeps it and reports the criterion as unjudged
    — and the UI says how many frames are on screen without having been tested. Dropping them
    would state something the file does not contain; keeping them quietly would overstate what
    the filter did.
12. **The detail bands describe the catalogue's scale, not the photograph.** `domain/detail`
    turns a supplied nominal denominator into words. It claims no resolution for a print nobody
    has seen, and a band changes only when the scale does. The words are also a trade in both
    directions: a finer band means a smaller picture of less ground, and every band says so.

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
- Plot bounds: a box covering every corner of every footprint; a lone oblique framed as its
  ±50 m square rather than a dimensionless point.
- Polygon geometry (`geometry.ts`): a square's area whichever way it is wound; a concave outline
  measured by its own area and not its bounding box; a subject clipped to a convex ring, including
  one cut into two separate pieces; the gap between two rings found from either direction.
- Coverage (`coverage.ts`): a pin inside a frame and outside it, with the clearance signed the
  right way; an outline wholly inside, straddling an edge, and clipped at a corner; a site nearer
  the edge than the centre point's ±50 m flagged as marginal; an oblique given a distance and
  never a verdict. Build the sites by converting known grid positions *to* WGS84 and handing those
  in — that puts the round trip under test alongside the geometry.
- The load path (`usePhotoSet`): real workbook bytes in, footprints and points out, with the
  worked example's numbers asserted at the far end; a bad row reported without losing the good
  ones; a superseded load not overwriting the one that replaced it.
- Table ordering (`photoTable`): each column sorted by its value rather than the text it is
  displayed as — dates chronologically, scale by denominator, frame identifiers naturally so
  frame 9 precedes frame 23; a row with nothing in the column last in *both* directions; ties
  left in the supplier's order.
- Scale bands (`detail.ts`): the bands tile the scales with no gap; a survey flown at exactly a
  boundary scale lands in the finer band; the sample's 1:2500 to 1:12 000 land where a customer
  would expect; the outer bands are stated open-ended rather than given an invented limit.
- The filter (`filter.ts`): each criterion applied on its own and all of them together; a year
  range inclusive at both ends; and, for every criterion, a record that cannot answer it kept
  *and* reported as unjudged — an oblique against a scale, an undated row against a date, an
  unrecognised `Held` code against a print. A filter that asks nothing reports nothing unjudged.
- The wizard's bookkeeping (`useFrameFilter`): the hidden set and the counts agree with each
  other; questions the listing cannot answer are not offered; a new file starts unfiltered.

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
  that isn't derivable from the data is worse than no output. The same rule applies to coverage:
  an oblique gets a distance, never a percentage, and a dropped pin is a point rather than a
  circle of some radius nobody supplied. It applies to filtering too: a frame the filter cannot
  judge is kept and reported, never dropped on the strength of a field the file doesn't carry.
- Don't offer a control the loaded listing cannot answer. The wizard drops the question when
  there are no scales, no dates, no site marked or no `Held` codes — a control that cannot change
  anything reads as a broken one.
- Don't add a Leaflet drawing plugin. The area of interest is a pin and a polygon, drawn by hand
  in `useLeafletMap` — a plugin would bring its own toolbar and a second UI vocabulary for two
  shapes.

## Commits

Short imperative subjects (`Add OSGB grid reference parser`). Keep the domain layer and its
tests in the same commit. Development happens on feature branches; `main` should always build.
