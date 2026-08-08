@AGENTS.md

# CLAUDE.md

The included [`AGENTS.md`](AGENTS.md) is the working guide for this repository (commands,
conventions, testing, and the domain rules that produce wrong answers when ignored). It
applies to you in full; this file only adds Claude-specific notes.

For what the app is and how it is designed, read [`ARCHITECTURE.md`](ARCHITECTURE.md).
For the supplier file format, read [`INPUT-FORMAT.md`](INPUT-FORMAT.md).
For the coordinate and photogrammetry maths, read [`archive/MATHS.md`](archive/MATHS.md).

## Orientation

The Vue 3 + Vite scaffold, the pure domain layer, the workbook reader (`src/io/`), the map, the
linked table, the area of interest and the listing filter (`src/composables/`, `src/components/`)
exist. The exports do not. `ARCHITECTURE.md` §9 tracks what is done and what is next.

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
  height or bearing. A point is the honest answer; a plausible-looking trapezoid is not. The
  same goes for filtering them: with no scale, a request for fine detail says nothing about an
  oblique, so `domain/filter` keeps it and says it could not be judged.
- **`domain/detail` describes the catalogue's scale, not the photograph.** The bands turn a
  supplied nominal denominator into words a customer can act on. Extending them is fine;
  claiming a resolution for a print nobody has seen is not.
- **Supplier files stay out of the repository.** They are customer enquiry data. Build test
  fixtures from the documented layout instead.
- **Nothing from a workbook goes near `innerHTML`.** Map popups are built outside the Vue
  template, in `useLeafletMap`, so the escaping Vue would have done is not there. Build them as
  DOM nodes with `textContent` — a film description is attacker-controlled text in a tool whose
  premise is that the user's file never leaves their machine.
