# Grid Reference Plotter

Plot UK aerial photography footprints on a map.

When you buy aerial photography in the UK, suppliers describe each available frame with an
Ordnance Survey grid reference and some camera details — focal length, film format, flying
height or scale. That tells you very little about what the photograph actually shows. This
tool takes the supplier's list, works out the ground each frame covers, and draws them all on
a map so you can see which ones include the place you care about.

Everything runs in your browser. The files you load are never uploaded anywhere.

## Status

**Rebuilding.** The repository has been reset and is being rewritten as a Vue 3 application;
there is no runnable app in this branch yet.

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — what is being built and how
- [`INPUT-FORMAT.md`](INPUT-FORMAT.md) — the supplier result files, documented from a real
  Historic England Archive search
- [`AGENTS.md`](AGENTS.md) — how to work in this repository
- [`archive/MATHS.md`](archive/MATHS.md) — the coordinate conversions and footprint geometry
- [`archive/`](archive/) — the previous React implementation, retired

Input is the Excel workbook the archive sends with a search result. Vertical photographs get a
drawn footprint; obliques get a point, because their listing contains nothing a footprint can
be derived from.

## Licence

Apache-2.0. See [LICENSE](LICENSE); see [`archive/README.md`](archive/README.md) for the
third-party code kept for reference.
