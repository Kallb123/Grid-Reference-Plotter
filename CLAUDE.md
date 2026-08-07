@AGENTS.md

# CLAUDE.md

The included [`AGENTS.md`](AGENTS.md) is the working guide for this repository (commands,
conventions, testing, and the domain rules that produce wrong answers when ignored). It
applies to you in full; this file only adds Claude-specific notes.

For what the app is and how it is designed, read [`ARCHITECTURE.md`](ARCHITECTURE.md).
For the supplier file format, read [`INPUT-FORMAT.md`](INPUT-FORMAT.md).
For the coordinate and photogrammetry maths, read [`archive/MATHS.md`](archive/MATHS.md).

## Orientation

The repository has been reset to documentation plus `archive/`. There is no application code
yet — the Vue 3 + Vite scaffold is the first job. Don't go looking for `src/`.

## Notes for this codebase

- **The maths is already written down.** `archive/MATHS.md` has the projection parameters,
  the Helmert values, the footprint derivation with worked examples, and the rotation formula.
  Use it rather than deriving from memory, and use it to write tests — the worked examples are
  test cases.
- **The old implementation's bugs are catalogued** in `archive/MATHS.md` §7. Check work
  against that list; the failures are subtle and produce output that looks entirely plausible.
- **Prefer the `geodesy` package to hand-rolled conversions.** The archived library is a
  reference, not a dependency.
- **`src/domain/` stays pure.** If a change adds a Vue, DOM, or Leaflet import under
  `src/domain/`, it is in the wrong file.
- **The input format is documented from a real sample.** `INPUT-FORMAT.md` records what was
  observed in a Historic England result set and what is only inferred from the supplier's
  guide — the oblique sheet layout is the latter. Keep that distinction when you extend it,
  and update the document in the same change as the parser.
- **Don't invent a footprint that isn't in the data.** Obliques carry no scale, focal length,
  height or bearing. A point is the honest answer; a plausible-looking trapezoid is not.
- **Supplier files stay out of the repository.** They are customer enquiry data. Build test
  fixtures from the documented layout instead.
