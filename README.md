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

Then mark your site — drop a pin or draw an outline round it — and the listing sorts itself by
how well each frame covers it. You get how much of the site is in each picture, how far it sits
from the frame's nearest edge, and how far off centre it is; frames that miss are faded on the
map and can be dropped from the table. The archive's own guide warns that *"your area will not
necessarily be in the centre of each photograph and may be on the edge of it"* — the edge margin
is that warning as a number. Where the margin is smaller than the ±50 m the supplier's centre
point is good to, the app says so rather than claiming a frame covers your site when the data
cannot tell.

Still to come: exporting the shortlist. See §9 of the architecture for the order.

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — what is being built and how
- [`INPUT-FORMAT.md`](INPUT-FORMAT.md) — the supplier result files, documented from a real
  Historic England Archive search
- [`AGENTS.md`](AGENTS.md) — how to work in this repository
- [`archive/MATHS.md`](archive/MATHS.md) — the coordinate conversions and footprint geometry
- [`archive/`](archive/) — the previous React implementation, retired
- [`public/brand/`](public/brand/) — the lockups and marks; the icon set is beside them in
  [`public/`](public/), and the palette and type are the variables at the top of
  [`src/styles.css`](src/styles.css)

Input is the Excel workbook the archive sends with a search result. Vertical photographs get a
drawn footprint; obliques get a point, because their listing contains nothing a footprint can
be derived from.

## Licence

Apache-2.0. See [LICENSE](LICENSE); see [`archive/README.md`](archive/README.md) for the
third-party code kept for reference.
