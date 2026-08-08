# Grid Reference Plotter

Plot UK aerial photography footprints on a map.

When you buy aerial photography in the UK, suppliers describe each available frame with an
Ordnance Survey grid reference and some camera details — focal length, film format, flying
height or scale. That tells you very little about what the photograph actually shows. This
tool takes the supplier's list, works out the ground each frame covers, and draws them all on
a map so you can see which ones include the place you care about.

Everything runs in your browser. The files you load are never uploaded anywhere.

## Status

**Rebuilding, and usable.** Drop a supplier's results workbook on the page and every frame is
drawn: verticals as footprints, obliques as points. Underneath are grid reference parsing, the
OSGB36 → WGS84 datum transform and the footprint geometry, all under test; alongside the map is a
table of the same frames, sortable by date, scale or ground extent, linked to the map both ways.
Rows that could not be read are listed with their line numbers rather than quietly dropped.

Still to come: marking an area of interest and ranking frames by how well they cover it, and
exporting a shortlist. See §9 of the architecture for the order.

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
