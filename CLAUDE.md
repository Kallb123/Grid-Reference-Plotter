# CLAUDE.md

Read [`AGENTS.md`](AGENTS.md) — it is the working guide for this repository (commands,
conventions, testing, and the domain rules that produce wrong answers when ignored). It
applies to you in full; this file only adds Claude-specific notes.

For what the app is and how it is designed, read [`ARCHITECTURE.md`](ARCHITECTURE.md).
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
- **Where the format is unknown, say so.** The supplier file format in `ARCHITECTURE.md` §7
  is an informed guess. Extending it is fine; quietly hard-coding a different guess is not —
  update the doc in the same change.
