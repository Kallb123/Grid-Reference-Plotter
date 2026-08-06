# Architecture

Status: **greenfield**. The repository has been reset; this document is the design the
rebuild follows. Where a decision has not been made yet it is listed under
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
| CSV | **PapaParse** | Browser-first, tolerant of real-world files, gives row/column error positions |
| Tests | **Vitest** | Vite-native; the domain layer is pure and heavily unit-tested |
| State | Composables (`usePhotoSet`) | One view, one dataset — Pinia only if a second view appears |
| Hosting | GitHub Pages, static | No server; user files never leave the browser |

**No backend.** Parsing and geometry all run client-side. This is a privacy property worth
keeping: supplier quote files stay on the user's machine.

## 4. Layout

```
src/
  main.ts
  App.vue
  domain/                 ← pure TypeScript: no Vue, no DOM, no I/O
    types.ts              PhotoRecord, Footprint, GridRef, Camera…
    osgb.ts               grid ref parse/format; easting/northing ↔ WGS84
    footprint.ts          camera + height → ground size → rotated corner polygon
    units.ts              inches/mm/feet/metres normalisation
  io/
    parseInput.ts         file text → PhotoRecord[] + ParseIssue[]
    columns.ts            header aliasing and unit sniffing
    exportGeoJson.ts      footprints → GeoJSON FeatureCollection
  composables/
    usePhotoSet.ts        loaded records, derived footprints, selection
    useLeafletMap.ts      map lifecycle, layer sync, fit-to-bounds
  components/
    MapView.vue           map + footprint layer
    FileDrop.vue          drag/drop + file picker
    PhotoTable.vue        tabular list, linked selection with the map
    PhotoDetail.vue       one frame: derived numbers and their inputs
    IssueList.vue         rows that failed to parse and why
```

The `domain/` boundary is the important one: **anything that does arithmetic on coordinates
belongs there, imports nothing framework-shaped, and has tests**. Components render; they do
not calculate.

## 5. Data flow

```
File ─▶ io/parseInput ─▶ PhotoRecord[]        ─▶ domain/footprint ─▶ Footprint[]
                      └▶ ParseIssue[]                                    │
                                                                         ├─▶ MapView (polygons)
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

interface Camera {
  focalLengthMm: number
  formatWidthMm: number     // film/sensor across-track dimension
  formatHeightMm: number    // along-track
}

interface PhotoRecord {
  id: string
  ref: GridRef
  camera: Camera
  heightAboveGroundM?: number
  scaleDenominator?: number   // either this or the height is required
  headingDeg?: number         // clockwise from north; absent ⇒ assume grid north
  meta: Record<string, string>  // sortie, frame, date, film type — passed through untouched
}

interface Footprint {
  record: PhotoRecord
  groundWidthM: number
  groundHeightM: number
  scaleDenominator: number
  centre: [number, number]                    // WGS84 [lng, lat]
  corners: [Corner, Corner, Corner, Corner]   // WGS84, clockwise from top-left
  uncertaintyM: number                        // from grid-ref precision
  notes: string[]                             // e.g. "scale derived from height"
}
```

## 7. Input format

The real supplier file has not been supplied yet — see
[Open questions](#open-questions). Until it is, the parser targets a **CSV with a header
row and flexible column names**, which is what such files invariably are:

| Column | Aliases | Required |
| --- | --- | --- |
| `gridref` | `grid ref`, `os ref`, `ngr`, `reference` | yes |
| `focal_length_mm` | `focal length`, `lens`, `f` | yes |
| `format_width_mm` | `film width`, `frame width` | yes (defaults to a square frame if only one given) |
| `format_height_mm` | `film height`, `frame height` | no |
| `height_m` | `flying height`, `agl`, `altitude` | one of height/scale |
| `scale` | `photo scale`, `1:x` | one of height/scale |
| `heading_deg` | `bearing`, `flight line` | no |
| anything else | — | passed through into `meta` and shown in the detail panel |

Design rules for the parser:

- **Sniff units, don't assume them.** `6` in a focal length column is inches; `152` is
  millimetres; `"6\""` and `"152.4mm"` are explicit. Record which interpretation was used and
  show it in the UI.
- **Never `parseInt` a measurement.** Focal lengths and formats are fractional
  (152.4 mm, 228.6 mm) — the old code truncated them.
- Accept grid references with or without spaces, and at any precision.

The legacy headerless format (`gridref, scale, film_width_cm, film_height_cm`) is recorded in
`archive/MATHS.md` for reference; it is not a compatibility target.

## 8. Correctness requirements

These are the things that make the output trustworthy, in rough order of how much damage they
do when wrong. A change that touches any of them needs a test.

1. **Datum transform applied.** OSGB36 → WGS84 before anything is drawn. Skipping it puts
   every footprint 70–120 m out. Regression test: a known control point checked to ≤5 m.
2. **Fractional measurements preserved.** No integer truncation anywhere in the numeric path.
3. **Grid-square precision surfaced.** A 4-figure reference is a ±500 m statement about where
   the camera was; the UI must say so rather than implying 1 m certainty.
4. **Height is above ground.** If a source gives altitude ASL, that is a different number and
   must be labelled as such.
5. **Heading convention stated.** If headings are true bearings, grid convergence is applied;
   if grid bearings, it is not. Whichever the data means, the code says which it assumed.
6. Corner geometry computed in grid metres, converted per corner.

## 9. Roadmap

1. **Scaffold** — Vite + Vue 3 + TS, Vitest, lint, GitHub Pages workflow (the archived
   CRA workflow published `build/`; Vite publishes `dist/`).
2. **Domain core** — `osgb.ts` and `footprint.ts` with the full test suite. Headless and
   verifiable before any UI exists.
3. **Map + footprints** — file drop, parse, draw, fit bounds. The minimum useful tool.
4. **Table and linked selection** — compare candidates, inspect derived numbers.
5. **Area of interest** — drop a pin or draw a polygon, sort frames by coverage of it. This is
   the feature that actually answers "which do I buy?".
6. **Export** — GeoJSON/KML of the chosen frames, and a filtered shortlist back out as CSV.

Milestones 1–3 are the walking skeleton; stop and get feedback there.

## Open questions

- **The real input file.** A sample from an actual supplier would settle the column names,
  units, and whether heading is even provided. Everything in §7 is a considered guess.
- **Heading data.** If suppliers don't give flight headings, footprints default to
  grid-north-aligned and the rotation code is dormant but harmless. Worth confirming.
- **Terrain heights.** Deriving height-above-ground from altitude ASL needs a DTM lookup
  (OS Terrain 50 is open data). Out of scope for now; the app takes AGL or scale as given.
- **OS Maps basemap.** Requires an OS Data Hub key. Nice for users working in grid
  references, but adds key management — deferred until someone asks.
