/**
 * The oblique layout under test here is **inferred from the supplier's guide, not observed** —
 * no oblique result set has been seen (INPUT-FORMAT.md §6, §8). These tests therefore assert the
 * behaviour that does not depend on the layout being right: that a `Map Reference` column is
 * found by its header wherever it sits, that a record carries no footprint, and that an
 * unrecognised sheet fails loudly instead of quietly producing nothing.
 */

import { describe, expect, it } from 'vitest'
import { buildObliquePoint } from '../../domain/footprint'
import type { CellValue } from '../columns'
import { parseObliques } from '../parseObliques'
import { readSheetGrid } from '../readWorkbook'
import type { SheetTable } from '../readWorkbook'
import type { ObliqueFixtureRow } from './fixtures'
import { obliquesGrid, SAMPLE_OBLIQUE_ROWS } from './fixtures'

const SHEET = 'Oblique'

function tableFor(rows: readonly ObliqueFixtureRow[] = SAMPLE_OBLIQUE_ROWS): SheetTable {
  const { table } = readSheetGrid(SHEET, obliquesGrid(rows))
  if (table === null) throw new Error('fixture did not produce a table')
  return table
}

describe('parseObliques', () => {
  it('reads the guide’s fields into oblique records', () => {
    const { records, issues } = parseObliques(tableFor())

    expect(issues).toEqual([])
    expect(records).toHaveLength(2)
    expect(records[0]).toMatchObject({
      kind: 'oblique',
      id: 'SK 4218/49',
      filmType: 'Black and White 35mm',
      provenance: {
        photoReference: 'SK 4218/49',
        frameNumber: 'EPW012345',
        originalNumber: '12345',
        date: '21 MAY 1926',
      },
    })
  })

  it('places the point from the Map Reference column', () => {
    const [record] = parseObliques(tableFor()).records

    expect(record?.ref.easting).toBe(442150)
    expect(record?.ref.northing).toBe(384950)
    expect(record?.ref.precisionM).toBe(100)
  })

  it('yields a point and no footprint, because none is derivable', () => {
    const [record] = parseObliques(tableFor()).records
    if (record === undefined) throw new Error('no record')

    const point = buildObliquePoint(record)

    expect(point.uncertaintyM).toBe(50)
    expect(point.notes.join(' ')).toContain('no ground extent can be derived')
    expect(record).not.toHaveProperty('scaleDenominator')
    expect(record).not.toHaveProperty('film')
  })

  it('reports a bad map reference and keeps the other rows', () => {
    const rows: ObliqueFixtureRow[] = [
      { ...first(), mapReference: 'SK 4218 49' },
      { ...first(), photoReference: 'SK 4308/12', mapReference: 'SK 430 855' },
    ]

    const { records, issues } = parseObliques(tableFor(rows))

    expect(records).toHaveLength(1)
    expect(records[0]?.id).toBe('SK 4308/12')
    expect(issues).toHaveLength(1)
    expect(issues[0]?.reason).toContain('Map Reference')
  })

  it('reports an empty map reference rather than plotting nothing at 0,0', () => {
    const { records, issues } = parseObliques(tableFor([{ ...first(), mapReference: null }]))

    expect(records).toEqual([])
    expect(issues[0]?.reason).toBe(
      'Map Reference is empty, so the frame cannot be placed on the map.',
    )
  })

  it('says which column it could not find when the wording is unfamiliar', () => {
    // The guide's prose is all we have, so a real oblique sheet may well word this differently.
    // Being told the column is missing is what makes that a five-minute fix.
    const grid: CellValue[][] = [
      ['Photo Reference (NGR and Index Number)', 'Film and Frame Number', 'Original Number', 'Date', 'Film type', 'Grid square'],
      ['SK 4218/49', 'EPW012345', '12345', '21 MAY 1926', 'Black and White 35mm', 'SK 421 849'],
    ]
    const { table, issues: readIssues } = readSheetGrid(SHEET, grid)

    // Without a recognised grid reference column the sheet is not classifiable at all.
    expect(table).toBeNull()
    expect(readIssues[0]?.reason).toContain('listing type could not be told')
  })

  it('falls back to the film and frame number for an id', () => {
    const { records } = parseObliques(tableFor([{ ...first(), photoReference: null }]))

    expect(records[0]?.id).toBe('EPW012345')
  })
})

function first(): ObliqueFixtureRow {
  const [row] = SAMPLE_OBLIQUE_ROWS
  if (row === undefined) throw new Error('no sample rows')
  return { ...row }
}
