# Archive

Retired code, kept for reference. **Nothing here is imported by the application** and nothing
here should be edited except this documentation.

| Path | What it is |
| --- | --- |
| [`MATHS.md`](MATHS.md) | The coordinate and photogrammetry maths, written up properly. The reason this directory exists. |
| [`osgb-gridref.js`](osgb-gridref.js) | Chris Veness's OS grid reference / datum conversion library, as vendored into the original app. |
| [`legacy/App.tsx`](legacy/App.tsx) | The old React app's footprint calculation — the only place the previous implementation did any domain maths. |
| [`legacy/deploy-pages.yml`](legacy/deploy-pages.yml) | The GitHub Pages workflow that deployed the CRA build. Published `build/`; a Vite rebuild publishes `dist/`. |

## Read `MATHS.md`, not the code

`MATHS.md` is the useful artefact. It has the projection parameters, the Helmert transform
values, the footprint derivation with worked numbers, the rotation formula, and — usefully —
a list of the five things the legacy implementation got wrong. The source files are here so
those claims can be checked, not so they can be copied.

## On `osgb-gridref.js`

Written by Chris Veness (Movable Type Ltd), 2005–2014, and vendored as a single file. It is
correct and does include the OSGB36↔WGS84 Helmert transform (`LatLonE.prototype.convertDatum`)
— the old app just never called it.

Do not revive it. The same author maintains
[`geodesy`](https://github.com/chrisveness/geodesy), a modern ESM/TypeScript package covering
the same ground, and that is what the rebuild should depend on. This copy is a 690-line
snapshot that patches `Number.prototype` and `String.prototype`, has `/* eslint-disable */` at
the top, and is missing the `LatLonE`/`GeoParams` module wiring the header comment refers to.

**Licensing:** upstream is distributed under MIT. This vendored copy carries only the
copyright header, not the licence text. If any of it is ever reused rather than merely read,
restore the full MIT notice with it. The rest of this repository is Apache-2.0.
