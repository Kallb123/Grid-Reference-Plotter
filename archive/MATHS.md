# The maths

Everything the app needs to turn a line of a supplier's catalogue into a shape on a map.
This is a reference document, kept in `archive/` because it outlives any particular
implementation — the code in this directory has been retired, the derivations here have not.

Contents:

1. [Grid reference → easting/northing](#1-grid-reference--eastingnorthing)
2. [Easting/northing → OSGB36 latitude/longitude](#2-eastingnorthing--osgb36-latitudelongitude)
3. [OSGB36 → WGS84](#3-osgb36--wgs84)
4. [Camera → ground footprint](#4-camera--ground-footprint)
5. [Placing and rotating the footprint](#5-placing-and-rotating-the-footprint)
6. [Grid convergence and scale factor](#6-grid-convergence-and-scale-factor)
7. [What the legacy implementation did](#7-what-the-legacy-implementation-did)

---

## 1. Grid reference → easting/northing

The National Grid divides Great Britain into 100 km squares labelled with two letters. The
first letter names a 500 km square, the second a 100 km square within it. **`I` is skipped**
in both sequences — the single most common source of off-by-one bugs in grid reference code.

Letters map to indices from the false origin (the south-west corner of square `SV`,
south-west of the Isles of Scilly):

```
l1 = charCode(letter1) - charCode('A');  if (l1 > 7) l1--     // skip 'I'
l2 = charCode(letter2) - charCode('A');  if (l2 > 7) l2--

e100km = ((l1 - 2) % 5) * 5 + (l2 % 5)
n100km = (19 - floor(l1 / 5) * 5) - floor(l2 / 5)
```

Valid range is `e100km` 0–6, `n100km` 0–12; anything else is not a GB grid square.

The digits that follow are split in half — first half easting, second half northing — and
appended. **A grid reference denotes a square, not a point**, and the number of digits sets
its size:

| Digits | Example | Square | Offset to centre |
| ---: | --- | ---: | ---: |
| 0 | `SK` | 100 km | +50 000 m |
| 2 | `SK 3 7` | 10 km | +5 000 m |
| 4 | `SK 34 78` | 1 km | +500 m |
| 6 | `SK 345 789` | 100 m | +50 m |
| 8 | `SK 3456 7890` | 10 m | +5 m |
| 10 | `SK 34567 78901` | 1 m | 0 |

Take the **centre** of the square as the nominal position and carry half the square's side
as the positional uncertainty. A 4-figure reference is a ±500 m statement; the UI should say
so rather than drawing a footprint as though the centre were known to the metre.

## 2. Easting/northing → OSGB36 latitude/longitude

The National Grid is a Transverse Mercator projection of the Airy 1830 ellipsoid:

| Parameter | Value |
| --- | --- |
| Semi-major axis `a` | 6 377 563.396 m |
| Semi-minor axis `b` | 6 356 256.909 m |
| Scale factor on central meridian `F0` | 0.999 601 271 7 |
| True origin | 49°N, 2°W |
| False origin | E 400 000 m, N −100 000 m |

The inverse projection (grid → latitude/longitude) has no closed form for the footpoint
latitude, so it iterates the meridional arc until the residual is below 0.01 mm, then applies
the standard OS series expansion (the `VII`–`XIIA` coefficients). The full implementation is
in [`osgb-gridref.js`](osgb-gridref.js), `OsGridRef.osGridToLatLong`. It is textbook OS
*Guide to Coordinate Systems in Great Britain* material and does not need reinventing —
but note what it returns: **latitude and longitude on OSGB36**, which is not what a web map
wants.

## 3. OSGB36 → WGS84

This is the step that gets skipped, and skipping it is not a rounding error: **OSGB36 and
WGS84 coordinates for the same physical point differ by roughly 70–120 m across Great
Britain.** On a 1:10 000 frame covering 2.3 km, that is a 5% displacement — enough to put a
site inside a footprint that does not actually cover it.

The seven-parameter Helmert transform, **OSGB36 → WGS84**:

| Parameter | Value |
| --- | --- |
| `tx`, `ty`, `tz` | +446.448 m, −125.157 m, +542.060 m |
| `rx`, `ry`, `rz` | +0.1502″, +0.2470″, +0.8421″ |
| Scale `s` | −20.4894 ppm |

(The reverse direction, WGS84 → OSGB36, is the same values negated — that is how they are
stored in `osgb-gridref.js`.)

Applied as: geodetic → geocentric Cartesian on the source ellipsoid, rotate/scale/translate,
Cartesian → geodetic on the target ellipsoid. Implementation:
`LatLonE.prototype.convertDatum` and `Vector3d.prototype.applyTransform`.

**Accuracy.** A Helmert transform is good to a few metres — 2–5 m over GB. That is fine for
plotting photo footprints kilometres across. Sub-metre work needs OSTN15, a gridded shift
table, which is a much larger dependency and unnecessary here.

## 4. Camera → ground footprint

For a **vertical** aerial photograph, similar triangles give everything:

```
                    H            ground dimension = film dimension × H / f
scale denominator = ─                             = film dimension × m
                    f
```

where `f` is the focal length and `H` is the **height above the ground being photographed**
— not altitude above sea level. If the catalogue gives altitude ASL, subtract the terrain
elevation; a 100 m error there is 3.3% of the footprint at 3000 m AGL.

Sources give either `H` or the scale, and occasionally both. If both, derive from each and
report the discrepancy rather than silently preferring one.

Common formats and lenses, since catalogues quote them in inches:

| | mm |
| --- | ---: |
| 9″ film frame | 228.6 |
| 6″ lens | 152.4 |
| 8¼″ lens | 209.6 |
| 12″ lens | 304.8 |

**Worked examples**

| Film | Lens | Height AGL | Scale | Ground side |
| --- | --- | ---: | ---: | ---: |
| 9″ | 6″ | 3000 m | 1:19 685 | 4500 m |
| 9″ | 12″ | 1500 m | 1:4 921 | 1125 m |
| 9″ | 6″ | — | 1:10 000 | 2286 m |

The first row the short way: `9/6 = 1.5`, and `1.5 × 3000 m = 4500 m`. The film-to-focal
ratio *is* the ground-to-height ratio.

**Digital sensors** work identically with sensor dimensions in place of film. If the source
quotes ground sample distance instead, `ground dimension = GSD × pixel count`, which sidesteps
focal length and height entirely.

**Caveats worth stating in the UI, not modelling:** the frame is only square-on if the
aircraft was level (tip/tilt/crab distort real frames by a few percent), and the footprint is
only rectangular over flat ground.

## 5. Placing and rotating the footprint

Do this **in eastings and northings, then convert each corner** — the National Grid is a
plane, so the geometry is exact plane arithmetic. Converting the centre to latitude/longitude
first and projecting geodesic bearings outward is more work and less accurate.

With centre `(E₀, N₀)`, across-track ground width `w`, along-track ground height `h`, and
heading `θ` clockwise from **grid** north:

```
along-track unit vector   u = ( sin θ,  cos θ )
across-track unit vector  r = ( cos θ, -sin θ )

corner(a, b) = ( E₀ + a·(h/2)·sin θ + b·(w/2)·cos θ ,
                 N₀ + a·(h/2)·cos θ − b·(w/2)·sin θ )      for a, b ∈ {+1, −1}
```

Sanity checks: at `θ = 0` this reduces to an axis-aligned box `(E₀ ± w/2, N₀ ± h/2)`; at
`θ = 90°` the two ground dimensions swap. Convert all four corners through §2 and §3 and draw
them as a polygon — **not** as a lat/lon bounding box, which cannot represent rotation.

If no heading is given, `θ = 0` and the footprint is grid-north-aligned. Say so in the UI;
real sorties fly along lines at arbitrary bearings.

## 6. Grid convergence and scale factor

Two second-order effects. One matters if headings are involved, the other never does.

**Grid convergence** — grid north is not true north. To first order:

```
γ ≈ (λ − λ₀) · sin φ            λ₀ = 2°W
```

At 4°W, 55°N that is −1.64°, and it reaches roughly 4° at the extremities of the grid. On a
4.5 km frame, 1.64° displaces each corner by about 90 m. So: **if a heading is a true
bearing, subtract convergence to get the grid bearing** used in §5
(`grid bearing = true bearing − γ`). If it is already a grid bearing, use it as-is. Whichever
the data means, record the assumption.

**Local scale factor** — a metre on the grid is not a metre on the ground. `F0` is
0.99960 on the central meridian, rising to about 1.00040 at the edges of GB: a maximum
departure of 0.04%, or 1.8 m on a 4500 m footprint. Ignore it, but know why it is being
ignored rather than not knowing it exists.

## 7. What the legacy implementation did

The retired React app's footprint code is in [`legacy/App.tsx`](legacy/App.tsx). It read a
headerless CSV:

```
gridref, scale_denominator, film_width_cm, film_height_cm
```

and computed `widthMetres = scale × film_cm / 100`, which is §4 in disguise and correct. What
followed was not, and these are the specific things the rebuild must not repeat:

1. **No datum transform.** `osGridToLatLong` returns OSGB36; the result was handed straight
   to Leaflet, which is WGS84. Every footprint was 70–120 m out of place. The archived
   library *contains* `convertDatum` — it simply was never called.
2. **Corner bearings hard-coded to 45°/225°.** The half-diagonal length was computed
   correctly from `w` and `h`, then projected along a 45° bearing. That is only the true
   corner direction for a square frame; for any other aspect ratio the rectangle came out the
   wrong shape.
3. **Geodesic projection instead of plane grid arithmetic.** Corners were projected with
   great-circle bearing/distance in nautical miles — round-tripping through a different
   coordinate model for no gain over §5.
4. **`parseInt` on measurements.** A 152.4 mm lens became 152 mm. Everything downstream
   inherited the error.
5. **Axis-aligned Leaflet bounds.** `LatLngBounds` cannot express a rotated rectangle, so
   flight heading could never have been supported.

---

### References

- Ordnance Survey, *A Guide to Coordinate Systems in Great Britain* — the authoritative
  source for §1, §2, §3 and §6.
- Chris Veness, *Movable Type Scripts* — [latlong-gridref](https://www.movable-type.co.uk/scripts/latlong-gridref.html);
  the origin of [`osgb-gridref.js`](osgb-gridref.js) and of the maintained
  [`geodesy`](https://github.com/chrisveness/geodesy) package the rebuild should use.
- Any standard photogrammetry text for §4; the similar-triangles relation is the whole of it.
