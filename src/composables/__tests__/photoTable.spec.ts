/**
 * The table's rows and their ordering.
 *
 * The numbers themselves are tested in `src/domain/`; what matters here is that the comparison
 * the table exists for actually works — that a column sorts by the value it displays rather than
 * by the string it displays it as, and that a frame with nothing in a column is never sorted to
 * the top of it.
 */

import { describe, expect, it } from 'vitest'
import { buildFootprint, buildObliquePoint } from '../../domain/footprint'
import { parseGridRef } from '../../domain/osgb'
import type { ObliqueRecord, VerticalRecord } from '../../domain/types'
import { PHOTO_COLUMNS, buildRows, parseCatalogueDate, sortRows } from '../photoTable'
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

function rowsFor(records: readonly (VerticalRecord | ObliqueRecord)[]): PhotoRow[] {
  return buildRows(
    records.filter((record): record is VerticalRecord => record.kind === 'vertical').map((record) => buildFootprint(record)),
    records.filter((record): record is ObliqueRecord => record.kind === 'oblique').map((record) => buildObliquePoint(record)),
  )
}

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

describe('parseCatalogueDate', () => {
  it('reads the archive’s dd MMM yyyy', () => {
    expect(parseCatalogueDate('13 JUN 1967')).toBe(Date.UTC(1967, 5, 13))
    expect(parseCatalogueDate('01 JUL 2008')).toBe(Date.UTC(2008, 6, 1))
    // Case and stray whitespace are the report template's business, not the ordering's.
    expect(parseCatalogueDate(' 3 sep 1971 ')).toBe(Date.UTC(1971, 8, 3))
    expect(parseCatalogueDate('12 September 1971')).toBe(Date.UTC(1971, 8, 12))
  })

  it('refuses anything that is not a date in that form', () => {
    // Handing these to `Date` would get a plausible wrong answer out of some of them.
    expect(parseCatalogueDate('')).toBeNull()
    expect(parseCatalogueDate('1967')).toBeNull()
    expect(parseCatalogueDate('13/06/1967')).toBeNull()
    expect(parseCatalogueDate('13 JUX 1967')).toBeNull()
    expect(parseCatalogueDate('31 FEB 1967')).toBeNull()
  })
})
