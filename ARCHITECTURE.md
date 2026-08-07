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
src/
  main.ts
  App.vue
  domain/                 ← pure TypeScript: no Vue, no DOM, no I/O
    types.ts              VerticalRecord, ObliqueRecord, Footprint, GridRef, Film…
    osgb.ts               grid ref parse/format; easting/northing ↔ WGS84
    footprint.ts          camera + height → ground size → rotated corner polygon
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
    usePhotoSet.ts        loaded records, derived footprints, selection
    useLeafletMap.ts      map lifecycle, layer sync, fit-to-bounds
    photoSummary.ts       one frame → labelled lines of text, for popup or panel
  components/
    MapView.vue           map + footprint layer
    FileDrop.vue          drag/drop + file picker
    PhotoTable.vue        tabular list, linked selection with the map
    PhotoDetail.vue       one frame: derived numbers and their inputs
    IssueList.vue         rows that failed to parse and why
```

`PhotoTable.vue`, `PhotoDetail.vue` and `exportGeoJson.ts` are milestones 5 and 7 and do not
exist yet; everything else above does. The frame detail currently renders from `photoSummary`
inside `App.vue`, and moves into `PhotoDetail.vue` when the table arrives to share it.

The `domain/` boundary is the important one: **anything that does arithmetic on coordinates
belongs there, imports nothing framework-shaped, and has tests**. Components render; they do
not calculate.

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
```

Selection is shared state in `usePhotoSet`, so hovering a table row highlights its polygon
and clicking a polygon scrolls the table — this linkage is the main thing that makes the tool
usable with 50+ candidate frames.

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
5. **Table and linked selection** — compare candidates, inspect derived numbers.
6. **Area of interest** — drop a pin or draw a polygon, sort frames by coverage of it. This is
   the feature that actually answers "which do I buy?". The archive's own guide warns that
   *"your area will not necessarily be in the centre of each photograph and may be on the edge
   of it"* — quantifying that is the point of the tool.
7. **Export** — GeoJSON/KML of the chosen frames, and a shortlist back out as a spreadsheet
   carrying the provenance columns needed to place an order.

Milestones 1–4 are the walking skeleton; **stop and get feedback there** — that point has now
been reached.

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
