/**
 * The table's rows and their ordering.
 *
 * The numbers themselves are tested in `src/domain/`; what matters here is that the comparison
 * the table exists for actually works — that a column sorts by the value it displays rather than
 * by the string it displays it as, and that a frame with nothing in a column is never sorted to
 * the top of it.
 */

import { describe, expect, it } from 'vitest'
import { coverageOf } from '../../domain/coverage'
import { buildFootprint, buildObliquePoint } from '../../domain/footprint'
import { gridToWgs84, parseGridRef } from '../../domain/osgb'
import type { SiteCoverage } from '../../domain/coverage'
import type { AreaOfInterest, ObliqueRecord, VerticalRecord } from '../../domain/types'
import { PHOTO_COLUMNS, buildRows, photoColumns, sortRows } from '../photoTable'
import type { PhotoColumnKey, PhotoRow } from '../photoTable'

function vertical(overrides: Partial<VerticalRecord> = {}): VerticalRecord {
  return {
    kind: 'vertical',
    id: 'MAL/67055 frame 23',
    ref: parseGridRef('SK 421 849'),
    film: { widthMm: 228.6, heightMm: 228.6, description: 'Black and White 9 x 9' },
    scaleDenominator: 10500,
    focalLengthMm: 152.4,
    provenance: {
      sortieNumber: 'MAL/67055',
      libraryNumber: '4777',
      cameraPosition: 'V',
      frameNumber: '23',
      run: '1',
      date: '13 JUN 1967',
      sortieQuality: 'A',
      held: 'P',
      filmHeldBy: 'NMR',
    },
    ...overrides,
  }
}

function oblique(overrides: Partial<ObliqueRecord> = {}): ObliqueRecord {
  return {
    kind: 'oblique',
    id: 'EPW012345',
    ref: parseGridRef('SK 430 855'),
    filmType: 'Black and White 35mm',
    provenance: { photoReference: 'SK 4218/49', date: '21 MAY 1926' },
    ...overrides,
  }
}

function rowsFor(
  records: readonly (VerticalRecord | ObliqueRecord)[],
  area: AreaOfInterest | null = null,
): PhotoRow[] {
  const footprints = records
    .filter((record): record is VerticalRecord => record.kind === 'vertical')
    .map((record) => buildFootprint(record))
  const points = records
    .filter((record): record is ObliqueRecord => record.kind === 'oblique')
    .map((record) => buildObliquePoint(record))

  const coverage: SiteCoverage | null =
    area === null ? null : coverageOf(footprints, points, area)

  return buildRows(footprints, points, coverage)
}

/** A dropped pin at a National Grid easting and northing, which is how a site reaches the table. */
function pinAt(easting: number, northing: number): AreaOfInterest {
  return { kind: 'point', position: gridToWgs84({ easting, northing }) }
}

/** The centre of the 2400.3 m frame `vertical()` describes: SK 421 849 is E 442150, N 384950. */
const FRAME_CENTRE = pinAt(442_150, 384_950)

function textIn(rows: readonly PhotoRow[], key: PhotoColumnKey): string[] {
  return rows.map((row) => row.cells[key].text)
}

describe('buildRows', () => {
  it('gives a vertical the numbers behind its footprint', () => {
    // The worked example of INPUT-FORMAT.md §4: 9″ at 1:10500 is a 2400.3 m square.
    const [row] = rowsFor([vertical()])

    expect(row?.id).toBe('MAL/67055 frame 23')
    expect(row?.kind).toBe('vertical')
    expect(row?.cells.kind.text).toBe('Vertical')
    expect(row?.cells.centre.text).toBe('SK 421 849')
    expect(row?.cells.scale.text).toBe('1:10,500')
    expect(row?.cells.extent.text).toBe('2,400 × 2,400 m')
    expect(row?.cells.area.text).toBe('5.8 km²')
    expect(row?.cells.date.text).toBe('13 JUN 1967')
    expect(row?.cells.held.text).toBe('P')
  })

  it('leaves an oblique’s extent columns empty and says why', () => {
    const [row] = rowsFor([oblique()])

    expect(row?.kind).toBe('oblique')
    expect(row?.cells.kind.text).toBe('Oblique')
    // No scale, no extent, no area — and nothing sortable, so no ordering can imply one.
    for (const key of ['scale', 'extent', 'area'] as const) {
      expect(row?.cells[key].text).toBe('—')
      expect(row?.cells[key].sort).toBeNull()
      expect(row?.cells[key].note).toContain('no extent is derivable')
    }
    // What it does have is still shown.
    expect(row?.cells.centre.text).toBe('SK 430 855')
    expect(row?.cells.date.text).toBe('21 MAY 1926')
  })

  it('fills every declared column for every row', () => {
    for (const row of rowsFor([vertical(), oblique()])) {
      for (const column of PHOTO_COLUMNS) {
        expect(row.cells[column.key].text).not.toBe('')
      }
    }
  })

  it('shows an em dash rather than a blank where the listing carries no value', () => {
    const [row] = rowsFor([
      vertical({ provenance: { ...vertical().provenance, date: undefined, held: '' } }),
    ])

    expect(row?.cells.date.text).toBe('—')
    expect(row?.cells.date.sort).toBeNull()
    expect(row?.cells.held.text).toBe('—')
    expect(row?.cells.held.sort).toBeNull()
  })

  it('lists verticals and obliques together, in the order they were supplied', () => {
    const rows = rowsFor([
      vertical({ id: 'first' }),
      vertical({ id: 'second' }),
      oblique({ id: 'third' }),
    ])

    expect(rows.map((row) => row.id)).toEqual(['first', 'second', 'third'])
  })
})

describe('photoColumns', () => {
  it('leaves the site’s columns out until there is a site', () => {
    const keys = photoColumns(false).map((column) => column.key)

    expect(keys).not.toContain('covered')
    expect(keys).not.toContain('margin')
    expect(keys).toContain('scale')
  })

  it('puts them straight after the frame’s identity once there is one', () => {
    expect(photoColumns(true).map((column) => column.key).slice(0, 4)).toEqual([
      'frame',
      'kind',
      'covered',
      'margin',
    ])
  })

  it('starts the site’s columns at the end that answers the question', () => {
    // Ascending is the interesting end of a date or a scale; for coverage it is the other way —
    // the frame that covers the most, with the most room to spare, is the one being looked for.
    for (const key of ['covered', 'margin'] as const) {
      expect(PHOTO_COLUMNS.find((column) => column.key === key)?.descendingFirst).toBe(true)
    }
    expect(PHOTO_COLUMNS.find((column) => column.key === 'date')?.descendingFirst).toBeUndefined()
  })
})

describe('buildRows, against a site', () => {
  it('says how much of the site a frame covers, and how much room is left', () => {
    // 850 m east of the frame's centre, so 1200.15 − 850 = 350 m inside its eastern edge.
    const [row] = rowsFor([vertical()], pinAt(443_000, 384_950))

    expect(row?.cells.covered.text).toBe('All')
    expect(row?.cells.covered.sort).toBe(1)
    expect(row?.cells.margin.text).toBe('350 m in')
    expect(row?.cells.margin.sort).toBeCloseTo(350.15, 1)
  })

  it('says by how much a frame misses', () => {
    // 1850 m east of the centre, so 650 m beyond the eastern edge.
    const [row] = rowsFor([vertical()], pinAt(444_000, 384_950))

    expect(row?.cells.covered.text).toBe('None')
    expect(row?.cells.covered.sort).toBe(0)
    expect(row?.cells.margin.text).toBe('650 m out')
    // Negative, so it sorts below every frame that covers anything at all.
    expect(row?.cells.margin.sort).toBeLessThan(0)
  })

  it('calls a site on the frame’s edge what it is', () => {
    const site: AreaOfInterest = {
      kind: 'polygon',
      // A 400 m square straddling the frame's eastern edge at E 443350.15.
      ring: [
        gridToWgs84({ easting: 443_150.15, northing: 384_750 }),
        gridToWgs84({ easting: 443_550.15, northing: 384_750 }),
        gridToWgs84({ easting: 443_550.15, northing: 385_150 }),
        gridToWgs84({ easting: 443_150.15, northing: 385_150 }),
      ],
    }
    const [row] = rowsFor([vertical()], site)

    expect(row?.cells.covered.text).toBe('50%')
    expect(row?.cells.margin.text).toBe('on the edge')
    expect(row?.cells.margin.sort).toBe(0)
  })

  it('carries the caveat that the extent it was measured against is an estimate', () => {
    const [row] = rowsFor([vertical()], FRAME_CENTRE)
    expect(row?.cells.covered.note).toContain('indicative')
  })

  it('gives an oblique no verdict, and says why rather than leaving a blank', () => {
    const [row] = rowsFor([oblique()], FRAME_CENTRE)

    for (const key of ['covered', 'margin'] as const) {
      expect(row?.cells[key].text).toBe('—')
      // Nothing sortable, so no ordering of the site's columns can imply a verdict for it.
      expect(row?.cells[key].sort).toBeNull()
      expect(row?.cells[key].note).toContain('no extent is derivable')
    }
    // The one thing that *is* derivable — how far away its map reference is — is still offered.
    expect(row?.cells.covered.note).toContain('from your site')
  })

  it('leaves the site’s cells empty when no site has been marked', () => {
    const [row] = rowsFor([vertical()])

    expect(row?.cells.covered.text).toBe('—')
    expect(row?.cells.covered.sort).toBeNull()
    expect(row?.cells.margin.sort).toBeNull()
  })
})

describe('sortRows', () => {
  it('orders frames by how much of the site they cover', () => {
    const rows = rowsFor(
      [
        vertical({ id: 'misses', ref: parseGridRef('SK 471 849') }),
        vertical({ id: 'covers' }),
        // A 1:2500 frame is 571.5 m square, so ±285.75 m. Centred 200 m east of the pin it
        // still covers it, but with only 86 m to spare rather than 1200.
        vertical({ id: 'just covers', scaleDenominator: 2_500, ref: parseGridRef('SK 423 849') }),
      ],
      FRAME_CENTRE,
    )

    expect(sortRows(rows, 'covered', 'descending').map((row) => row.id)).toEqual([
      'covers',
      'just covers',
      'misses',
    ])

    // Both cover the site; the margin is what tells them apart, and it is the number the
    // archive's warning about sites "on the edge" of a photograph is about.
    expect(sortRows(rows, 'margin', 'descending').map((row) => row.id)).toEqual([
      'covers',
      'just covers',
      'misses',
    ])
  })

  it('never promotes an unmeasured frame by reversing the site’s columns', () => {
    const rows = rowsFor([vertical({ id: 'covers' }), oblique({ id: 'no extent' })], FRAME_CENTRE)

    for (const direction of ['ascending', 'descending'] as const) {
      expect(sortRows(rows, 'covered', direction).map((row) => row.id).at(-1)).toBe('no extent')
      expect(sortRows(rows, 'margin', direction).map((row) => row.id).at(-1)).toBe('no extent')
    }
  })
})

describe('sortRows', () => {
  it('leaves the listing’s own order alone when no column is chosen', () => {
    const rows = rowsFor([vertical({ id: 'b' }), vertical({ id: 'a' })])

    expect(sortRows(rows, null).map((row) => row.id)).toEqual(['b', 'a'])
  })

  it('sorts dates chronologically, not as the text they are stored as', () => {
    const dated = (id: string, date: string): VerticalRecord =>
      vertical({ id, provenance: { ...vertical().provenance, date } })

    // Sorting the strings would put 01 JUL 2008 first and 19 AUG 1968 before 13 JUN 1967.
    const rows = rowsFor([
      dated('c', '01 JUL 2008'),
      dated('a', '13 JUN 1967'),
      dated('b', '19 AUG 1968'),
    ])

    expect(sortRows(rows, 'date').map((row) => row.id)).toEqual(['a', 'b', 'c'])
    expect(sortRows(rows, 'date', 'descending').map((row) => row.id)).toEqual(['c', 'b', 'a'])
  })

  it('sorts scale by its denominator, finest first', () => {
    const rows = rowsFor([
      vertical({ id: 'a', scaleDenominator: 10500 }),
      vertical({ id: 'b', scaleDenominator: 2500 }),
      vertical({ id: 'c', scaleDenominator: 12000 }),
    ])

    // Ascending is 1:2500 first — the finest scale, the most detail over the least ground.
    expect(textIn(sortRows(rows, 'scale'), 'scale')).toEqual(['1:2,500', '1:10,500', '1:12,000'])
  })

  it('sorts ground extent by metres, not by the formatted string', () => {
    const rows = rowsFor([
      vertical({ id: 'a', scaleDenominator: 10000 }),
      vertical({ id: 'b', scaleDenominator: 2500 }),
    ])

    // "2,286 × 2,286 m" sorts before "572 × 572 m" as text; by metres it does not.
    expect(textIn(sortRows(rows, 'extent'), 'extent')).toEqual([
      '572 × 572 m',
      '2,286 × 2,286 m',
    ])
  })

  it('sorts frame identifiers naturally, so frame 9 precedes frame 23', () => {
    const rows = rowsFor([
      vertical({ id: 'MAL/67055 frame 160' }),
      vertical({ id: 'MAL/67055 frame 23' }),
      vertical({ id: 'MAL/67055 frame 9' }),
    ])

    expect(textIn(sortRows(rows, 'frame'), 'frame')).toEqual([
      'MAL/67055 frame 9',
      'MAL/67055 frame 23',
      'MAL/67055 frame 160',
    ])
  })

  it('keeps rows with no value in the column last, whichever way the column points', () => {
    const rows = rowsFor([
      oblique({ id: 'no scale' }),
      vertical({ id: 'a', scaleDenominator: 10500 }),
      vertical({ id: 'b', scaleDenominator: 2500 }),
    ])

    // Reversing the sort must not promote the frame that has no scale to the top of the list.
    expect(sortRows(rows, 'scale').map((row) => row.id)).toEqual(['b', 'a', 'no scale'])
    expect(sortRows(rows, 'scale', 'descending').map((row) => row.id)).toEqual([
      'a',
      'b',
      'no scale',
    ])
  })

  it('keeps tied rows in the order the supplier listed them', () => {
    const rows = rowsFor([
      vertical({ id: 'first', scaleDenominator: 10000 }),
      vertical({ id: 'second', scaleDenominator: 10000 }),
      vertical({ id: 'third', scaleDenominator: 10000 }),
    ])

    expect(sortRows(rows, 'scale').map((row) => row.id)).toEqual(['first', 'second', 'third'])
  })

  it('does not mutate the rows it was given', () => {
    const rows = rowsFor([vertical({ id: 'b' }), vertical({ id: 'a' })])
    sortRows(rows, 'frame')

    expect(rows.map((row) => row.id)).toEqual(['b', 'a'])
  })
})
