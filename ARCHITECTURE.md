# Architecture

Status: **in progress**. This document is the design the rebuild follows; [§9](#9-roadmap)
records how far it has got. Where a decision has not been made yet it is listed under
[Open questions](#open-questions) rather than guessed at in code.

---

## 1. The problem

Suppliers of UK aerial photography (Historic England Archive, NCAP, Aerofilms, local
authority and commercial survey archives) catalogue each frame by:

- an **Ordnance Survey National Grid reference** for the point the camera was over, e.g. `SK 3456 7890`
- **camera and sortie metadata** — focal length, film/sensor format, flying height or photo scale, date, sortie and frame number

A customer picking frames to buy gets a list of these and has to answer one question:
*which of these photos actually cover the site I care about?* A grid reference is opaque
to most people, and the frame's **footprint** — how much ground it covers — is not stated
at all; it is implied by the lens and the flying height.

This app answers that question visually: drop in the supplier's file, get every candidate
frame drawn as a footprint on a map, and compare them against the area of interest.

## 2. Domain primer

Two conversions sit at the heart of the app. Both are set out with worked numbers in
[`archive/MATHS.md`](archive/MATHS.md); this is the summary.

### 2.1 Grid reference → position

An OS grid reference is a **square, not a point**. `SK37` is a 10 km square, `SK 3456 7890`
is a 10 m square. Parsing yields an easting/northing in metres from the National Grid false
origin; we take the **centre** of the square as the nominal camera position and carry the
square's size forward as a stated uncertainty.

Those eastings/northings are on the **OSGB36** datum (Airy 1830 ellipsoid). Web map tiles
are **WGS84**. The two disagree by roughly **70–120 m across Great Britain**, so the datum
transform is mandatory, not a refinement — omitting it was the principal bug in the old
version of this app.

### 2.2 Camera → ground footprint

For a vertical aerial photograph:

```
scale denominator  m = H / f            (H = height above the ground, f = focal length)
ground dimension       = film dimension × m
                       = film dimension × H / f
```

A 9″ (228.6 mm) frame taken with a 6″ (152.4 mm) lens from 3000 m above ground covers
`0.2286 × 3000 / 0.1524` = **4500 m** square. Either `H` **or** a stated scale is enough;
if both are present they are cross-checked and a disagreement is reported.

`H` is height **above the ground**, not above sea level. If the source gives altitude ASL,
the terrain elevation must be subtracted — a 100 m error in terrain height at 3000 m AGL
is a 3.3% error in footprint size.

### 2.3 Placing the footprint

Offsets are computed **in grid metres, then converted per corner** — the National Grid is a
plane, so a rectangle centred on `(E, N)` and rotated by the flight heading is exact
arithmetic. Converting the centre to lat/lon first and projecting geodesic bearings (what the
old app did) is both harder and less accurate. Two subtleties, both documented in
`archive/MATHS.md`: grid north is not true north (convergence, up to ~4°), and grid distance
is not ground distance (local scale factor, ≤0.04% — negligible here).

## 3. Stack

| Concern | Choice | Why |
| --- | --- | --- |
| Framework | **Vue 3**, `<script setup>`, TypeScript | Requested; SFCs suit a small, view-heavy tool |
| Build | **Vite** | Default for Vue 3; fast, static output |
| Map | **Leaflet 1.9**, used directly from a composable | We draw our own polygons, so a wrapper library buys nothing and lags Vue releases |
| Basemap | OSM raster tiles; optional OS Maps API key | Works with no key; users in OS coordinates often prefer OS raster |
| Coordinates | [`geodesy`](https://github.com/chrisveness/geodesy) (MIT) | Same lineage as the archived code, but maintained ESM/TS and **does the OSGB36→WGS84 Helmert transform properly** |
| Spreadsheets | **SheetJS (`xlsx`)** | Suppliers send Excel workbooks, and the one real sample is `.xls` (BIFF8) — see [`INPUT-FORMAT.md`](INPUT-FORMAT.md). SheetJS reads both `.xls` and `.xlsx`; CSV falls out of the same reader |
| Tests | **Vitest** | Vite-native; the domain layer is pure and heavily unit-tested |
| State | Composables (`usePhotoSet`) | One view, one dataset — Pinia only if a second view appears |
| Hosting | GitHub Pages, static | No server; user files never leave the browser |

**No backend.** Parsing and geometry all run client-side. This is a privacy property worth
keeping: supplier quote files stay on the user's machine.

**A note on the SheetJS dependency.** SheetJS stopped publishing to npm at `0.18.5` and moved to
its own CDN, so `npm install xlsx` gets a build that carries two open advisories (a prototype
pollution and a ReDoS, both fixed in `0.19.3`/`0.20.2` on the CDN). `0.18.5` is what is pinned
here because the CDN is not reachable from every environment this is built in. Two things reduce
the exposure meanwhile: `readWorkbook` takes cells as arrays (`sheet_to_json` with `header: 1`)
and never lets sheet content become object keys, and there is no server — a malicious workbook
would only ever reach the browser of whoever opened it. Worth revisiting: installing from
`https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` where the network allows it, or vendoring
that tarball.

## 4. Layout

```
public/                   ← copied to the site root, unbundled
  favicon.svg             the brand mark, colour-scheme aware; PNG fallbacks alongside it
  apple-touch-icon.png
  brand/                  the kit's lockups and marks, light and dark
src/
  main.ts
  App.vue
  styles.css              the brand's tokens: palette, ramps, type, radius, rule weight
  domain/                 ← pure TypeScript: no Vue, no DOM, no I/O
    types.ts              VerticalRecord, ObliqueRecord, Footprint, GridRef, Film, AreaOfInterest…
    osgb.ts               grid ref parse/format; easting/northing ↔ WGS84
    footprint.ts          camera + height → ground size → rotated corner polygon
    geometry.ts           plane polygon maths in grid metres: area, clipping, distances
    coverage.ts           area of interest × footprint → how much, how close to the edge
    bounds.ts             the box round what is plotted, for fit-to-bounds
    units.ts              inches/mm/feet/metres normalisation
  io/
    parseWorkbook.ts      bytes → records + issues; the one entry point a component needs
    readWorkbook.ts       file → sheets; locates the header row, classifies each sheet
    parseVerticals.ts     vertical listing rows → VerticalRecord[] + ParseIssue[]
    parseObliques.ts      oblique listing rows → ObliqueRecord[] + ParseIssue[]
    columns.ts            header-text → column mapping, film/format string parsing
    exportGeoJson.ts      footprints and points → GeoJSON FeatureCollection
  composables/
    usePhotoSet.ts        loaded records, derived footprints, selection and hover
    useAreaOfInterest.ts  the marked site, the state of drawing one, and every frame's verdict
    useLeafletMap.ts      map lifecycle, layer sync, fit-to-bounds, drawing the site
    photoSummary.ts       one frame → labelled lines of text, for popup or panel
    photoTable.ts         frames → table rows, and the column ordering
  components/
    BrandLockup.vue       the mark and the name, inlined so the ink follows the colour scheme
    MapView.vue           map + footprint layer, legend, and the prompt shown while drawing
    FileDrop.vue          drag/drop + file picker
    AreaOfInterestPanel.vue  mark, describe and clear the site; the coverage tally
    PhotoTable.vue        tabular list, linked selection with the map
    PhotoDetail.vue       one frame: derived numbers and their inputs
    IssueList.vue         rows that failed to parse and why
```

`exportGeoJson.ts` is milestone 7 and does not exist yet; everything else above does.

`photoSummary.ts` and `photoTable.ts` are both plain modules rather than components, for the
same reason: the summary has to render into a Leaflet popup as well as a Vue template, the
table's ordering has to be testable without a browser, and neither is arithmetic — every number
they format was worked out in `domain/`.

The `domain/` boundary is the important one: **anything that does arithmetic on coordinates
belongs there, imports nothing framework-shaped, and has tests**. Components render; they do
not calculate.

**The brand.** Two overlapping photographic frames with the ground they share in red — the app's
two subjects, a frame and its footprint. `src/styles.css` carries the palette, the tonal ramps,
the type and the zeroed radius as variables; components take colours from those and never write a
hex. Three of the values (`--brand-ground`, `--brand-ink`, `--brand-red`) are deliberately outside
the colour-scheme swap, for the mark's red field and for the chrome that floats on the basemap —
the basemap is a light raster whether or not the page is dark. The map reads its three plot
colours off the mark: ink for the frames, the accent for the one being inspected, and a deep step
of it for obliques, which are positions rather than extents. Archivo is bundled with the app; a
webfont fetched from a CDN while the user's workbook is open would undercut the claim that
nothing about the file leaves their machine.

## 5. Data flow

```
Workbook ─▶ io/readWorkbook ─▶ sheet classified by header row
                                 │
                                 ├─ verticals ─▶ VerticalRecord[] ─▶ domain/footprint ─▶ Footprint[]
                                 ├─ obliques  ─▶ ObliqueRecord[]  ─▶ domain/osgb     ─▶ Point[]
                                 └─ any row that fails ──────────▶ ParseIssue[]
                                                                          │
                                                                          ├─▶ MapView (polygons + markers)
                                                                          ├─▶ PhotoTable (rows)
                                                                          └─▶ exportGeoJson

Map click ─▶ AreaOfInterest (WGS84) ─▶ domain/osgb ─▶ grid metres ─▶ domain/coverage
                                                                          │
                                                              FrameCoverage per frame
                                                                          │
                                                    ├─▶ MapView   (frames that miss it faded)
                                                    ├─▶ PhotoTable (two more columns, sorted by them)
                                                    └─▶ PhotoDetail / popups (how much, how close)
```

Selection and hover are shared state in `usePhotoSet`, so hovering a table row highlights its
polygon and clicking a polygon scrolls the table — this linkage is the main thing that makes the
tool usable with 50+ candidate frames. Neither view owns either piece of state: both show the
same frames, and each has to react to what the user does in the other. The area of interest is
shared the same way, in `useAreaOfInterest`, and for the same reason: it is drawn on the map and
it reorders the table.

The site is the only input in the app that does not come out of a spreadsheet, and it arrives in
WGS84 because that is what a map click is. It is converted to National Grid metres before
anything is measured, so the comparison happens on the plane both the site and the frames really
live on and the datum transform cannot introduce a discrepancy between the two.

Rows that cannot be parsed **never** silently vanish. Every one lands in `ParseIssue[]` with
its line number and a plain-English reason, and the UI shows the count.

## 6. Core types (sketch)

```ts
interface GridRef {
  text: string          // as supplied, e.g. "SK 3456 7890"
  easting: number       // metres from National Grid false origin (OSGB36)
  northing: number
  precisionM: number    // side of the square the ref denotes: 10000, 1000, 100, 10, 1
}

interface Film {
  widthMm: number           // across-track; 9" frame ⇒ 228.6
  heightMm: number          // along-track
  description: string       // "Black and White 9 x 9", kept verbatim for display
}

/** Provenance columns: how a customer actually places an order. Carried through untouched. */
interface Provenance {
  sortieNumber: string
  libraryNumber: string     // text — "5356A" is a real value
  cameraPosition: string    // NOT a vertical/oblique flag; see INPUT-FORMAT.md §5
  frameNumber: string
  run?: string
  date?: string             // "13 JUN 1967" as supplied
  sortieQuality?: string
  held?: 'P' | 'N' | string
  filmHeldBy?: string
  photoReference?: string   // oblique listings only
  originalNumber?: string   // oblique listings only
}

interface VerticalRecord {
  kind: 'vertical'
  id: string
  ref: GridRef
  film: Film
  scaleDenominator: number  // nominal target scale, as supplied
  focalLengthMm?: number    // redundant for the footprint; gives flying height
  provenance: Provenance
}

/** Obliques carry no scale, focal length, height or bearing — a footprint is not derivable. */
interface ObliqueRecord {
  kind: 'oblique'
  id: string
  ref: GridRef
  filmType?: string
  provenance: Partial<Provenance>
}

interface Footprint {
  record: VerticalRecord
  groundWidthM: number
  groundHeightM: number
  flyingHeightM?: number                      // focal length × scale denominator
  centre: [number, number]                    // WGS84 [lng, lat]
  corners: [Corner, Corner, Corner, Corner]   // WGS84, clockwise from top-left
  uncertaintyM: number                        // half the grid square: 50 m for a six-figure ref
  notes: string[]                             // e.g. "scale is nominal", "heading assumed grid north"
}

/** What the user marked. A pin is a point: they said where their site is, not how big it is. */
type AreaOfInterest =
  | { kind: 'point'; position: LngLat }
  | { kind: 'polygon'; ring: readonly LngLat[] }   // vertices in order, not closed

/** What one frame does about that site. */
interface FrameCoverage {
  id: string
  verdict: 'full' | 'partial' | 'none'
  coveredFraction: number   // 0–1 of the site's area; a pin is 0 or 1
  coveredAreaM2: number     // zero for a pin, which has no area
  edgeClearanceM: number    // + inside with room to spare, 0 straddling, − by the size of the miss
  offCentreM: number        // site centre to frame centre
  marginal: boolean         // the clearance is inside the centre point's own ±50 m
  notes: string[]
}
```

## 7. Input format

Documented in full in **[`INPUT-FORMAT.md`](INPUT-FORMAT.md)**, from a real Historic England
Archive result set and its accompanying guide. The parts that shape the architecture:

- The file is an **Excel workbook** (`.xls`, BIFF8 in the sample), not a CSV, and one workbook
  holds **several sheets** — verticals and obliques are separate tabs.
- Sheets are formatted reports: banner rows, a two-row header, spacer columns, merged cells,
  and a `Total Frames` trailer. **Find the header row by content and map columns by header
  text**; nothing about row or column position is safe to hard-code.
- Verticals give **scale directly** (`Scale 1:`), so no flying height or terrain lookup is
  needed: `ground side = film side × scale denominator`. Focal length is supplied too, and is
  redundant for the footprint — it yields the flying height, which is worth displaying.
- Centre points are **six-figure grid references** — a 100 m square, ±50 m.
- **No heading is supplied**, so footprints are grid-north aligned. The rotation maths in
  `archive/MATHS.md` §5 stays in the domain layer against a future source that has bearings,
  but nothing feeds it today.
- Scale is the survey's **target** scale; actual frames vary with aircraft altitude and
  terrain. Footprints are indicative extents, and the UI must say so.
- **Obliques carry no scale, focal length, height or bearing.** No footprint is derivable;
  they are plotted as points with their ±50 m uncertainty.

Units follow the catalogue: focal lengths and film formats are in **inches** (`6`, `9 x 9`),
not millimetres. Convert on the way in, and never `parseInt` a measurement — a 12″ lens is
304.8 mm and a 9″ frame is 228.6 mm.

The legacy headerless CSV format (`gridref, scale, film_width_cm, film_height_cm`) is recorded
in `archive/MATHS.md` §7. It is not a compatibility target.

## 8. Correctness requirements

These are the things that make the output trustworthy, in rough order of how much damage they
do when wrong. A change that touches any of them needs a test.

1. **Datum transform applied.** OSGB36 → WGS84 before anything is drawn. Skipping it puts
   every footprint 70–120 m out. Regression test: a known control point checked to ≤5 m.
2. **Fractional measurements preserved.** No integer truncation anywhere in the numeric path.
3. **Grid-square precision surfaced.** A six-figure reference is a ±50 m statement about where
   the camera was; the UI must say so rather than implying 1 m certainty.
4. **Nominal scale presented as nominal.** The supplier's scale is a target, not a
   measurement; real frames vary with altitude and terrain. Footprints are indicative extents,
   and must not be drawn or described as surveyed boundaries.
5. **No footprint invented for obliques.** Without scale, height or bearing there is no
   defensible ground shape. A point is the honest answer.
6. **Height is above ground.** If a source gives altitude ASL, that is a different number and
   must be labelled as such.
7. **Heading convention stated.** Today no source supplies one, so footprints are grid-north
   aligned and say so. If a source ever does: true bearings need grid convergence applied,
   grid bearings do not, and the code records which it assumed.
8. Corner geometry computed in grid metres, converted per corner.
9. **Coverage inherits the extent's uncertainty.** A frame's footprint is an estimate, so any
   figure measured against it is a comparison with an estimate. Where the site sits closer to a
   frame's edge than the ±50 m the centre point is known to, "covers" and "misses" are the same
   answer as far as the data can tell, and the UI says so rather than reporting a verdict it
   cannot support.
10. **No coverage claimed for an oblique.** With no extent there is nothing to intersect. The
    distance from the site to the archive's map reference is real and is shown as a distance;
    it is never presented as, or sortable alongside, coverage.

## 9. Roadmap

1. ~~**Scaffold**~~ — *done.* Vite + Vue 3 + TS, Vitest, ESLint, GitHub Pages workflow (the
   archived CRA workflow published `build/`; Vite publishes `dist/`).
2. ~~**Domain core**~~ — *done.* `osgb.ts`, `footprint.ts` and `units.ts` with the test suite.
   Headless and verifiable before any UI exists.
3. ~~**Workbook parsing**~~ — *done.* `src/io/` reads the supplier `.xls` (and `.xlsx`, and CSV,
   from the same reader), finds the header row under the banner, folds in the continuation row,
   maps columns by header text, and cross-checks the row count against the `Total Frames`
   trailer. Bad rows land in `ParseIssue[]` with a line number and a readable reason. Headless
   and tested; no UI consumes it yet.
4. ~~**Map + footprints**~~ — *done.* Drop or pick a workbook, and every vertical is drawn as a
   footprint polygon and every oblique as a point with its ±50 m square. The view fits the
   result set on load, clicking a frame shows the numbers behind it and the caveats that come
   with them, and rows that failed to parse are listed with their line numbers rather than
   quietly missing. Leaflet is driven from `useLeafletMap` with no wrapper library; popups are
   built as DOM nodes, never as HTML strings, because every value in them came out of a
   spreadsheet a stranger sent the user.
5. ~~**Table and linked selection**~~ — *done.* Every plotted frame is a row — verticals and
   obliques together, because they are candidates for the same purchase — sortable by frame,
   date, centre point, scale, ground extent or area. Sorting runs on the value, not on the text
   of it: dates order chronologically although the catalogue stores them as `13 JUN 1967`, and a
   frame with nothing in a column stays last whichever way the column points, so reversing a sort
   never promotes an oblique to "finest scale". A third click on a heading returns the listing to
   the supplier's own order, which is information in its own right. Selection and hover are shared
   through `usePhotoSet`, so pointing at a row lights up its polygon, choosing a frame in either
   view selects it in both, and a frame chosen on the map scrolls its row into view — and pans the
   map to itself only if it was off screen, since re-centring on every click would fight a user
   who has panned deliberately.
6. ~~**Area of interest**~~ — *done.* Drop a pin or draw an outline on the map, and every frame is
   measured against it: how much of the site falls inside the frame, how far the site sits from
   the frame's nearest edge, and how far it is from the middle of the picture. The table gains two
   columns and orders itself by coverage the moment a site is marked; the map fades the frames
   that do not reach it, so a listing that was thirty overlapping rectangles becomes the handful
   that matter; and the misses can be dropped from the table outright. The archive's own guide
   warns that *"your area will not necessarily be in the centre of each photograph and may be on
   the edge of it"* — the edge margin is that warning made into a number, and where the margin is
   smaller than the ±50 m the centre point is known to, the frame says so rather than claiming a
   verdict the data cannot support. The geometry is plane arithmetic in National Grid metres
   (`domain/geometry.ts`, `domain/coverage.ts`); drawing is hand-rolled on Leaflet rather than
   taken from a plugin, because two shapes do not justify one.
7. **Export** — GeoJSON/KML of the chosen frames, and a shortlist back out as a spreadsheet
   carrying the provenance columns needed to place an order.

Milestones 1–4 were the walking skeleton, 5 made it a comparison tool, and 6 answers the question
the app exists for: **which of these frames covers my site?** What is left is getting the answer
back out — a shortlist, with the columns a supplier needs to take an order.

## Open questions

- **The oblique sheet layout.** No oblique result set has been seen. The fields are known from
  the supplier's guide (`INPUT-FORMAT.md` §6), the sheet's actual shape is not.
- **Other suppliers.** Only Historic England's format has been seen. NCAP, Aerofilms and local
  authority archives presumably differ; the header-driven parser is what should make a second
  format cheap rather than structural.
- **The `Camera position` code set.** Only `V` appears in the sample.
- **Terrain heights.** Not needed for Historic England data, which gives scale directly. It
  would only matter for a source quoting altitude ASL, and would need a DTM (OS Terrain 50 is
  open data).
- **OS Maps basemap.** Requires an OS Data Hub key. Nice for users working in grid
  references, but adds key management — deferred until someone asks.
- **Typing a site in rather than clicking one.** A customer who already has a grid reference for
  their site has to find it on the map to mark it. `parseGridRef` would take the text directly;
  the question is whether it earns a second input on the panel or belongs with the export work.
- **Whether a site should survive a reload.** It is the one thing in the app the user made
  themselves, and it is currently lost on refresh. `localStorage` would keep it, at the cost of
  the app storing something about the user's enquiry — which is exactly what the no-backend
  promise is about, even locally.
