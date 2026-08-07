import { describe, expect, it } from 'vitest'
import { buildFootprint, buildObliquePoint } from '../../domain/footprint'
import { parseWorkbook } from '../parseWorkbook'
import {
  obliquesGrid,
  SAMPLE_OBLIQUE_ROWS,
  SAMPLE_VERTICAL_ROWS,
  verticalsGrid,
  verticalsMerges,
  writeWorkbookBytes,
} from './fixtures'

const SHEET = 'R2.4a - Full single listing wit'

function bytes(...sheets: Parameters<typeof writeWorkbookBytes>[0]): Uint8Array {
  return writeWorkbookBytes(sheets, 'xls')
}

describe('parseWorkbook', () => {
  it('reads a supplier .xls end to end', () => {
    const parsed = parseWorkbook(
      bytes({
        name: SHEET,
        grid: verticalsGrid(),
        merges: verticalsMerges(SAMPLE_VERTICAL_ROWS.length),
      }),
    )

    expect(parsed.issues).toEqual([])
    expect(parsed.verticals).toHaveLength(SAMPLE_VERTICAL_ROWS.length)
    expect(parsed.obliques).toEqual([])
    expect(parsed.sheets).toEqual([
      {
        sheetName: SHEET,
        kind: 'verticals',
        headerLine: 13,
        rowsRead: 4,
        recordsParsed: 4,
        totalFramesStated: 4,
      },
    ])
  })

  it('sorts records by kind across sheets, not by which tab they came from', () => {
    const parsed = parseWorkbook(
      bytes(
        { name: SHEET, grid: verticalsGrid() },
        { name: 'R2.4b - Obliques', grid: obliquesGrid() },
      ),
    )

    expect(parsed.verticals).toHaveLength(SAMPLE_VERTICAL_ROWS.length)
    expect(parsed.obliques).toHaveLength(SAMPLE_OBLIQUE_ROWS.length)
    expect(parsed.sheets.map((sheet) => sheet.kind)).toEqual(['verticals', 'obliques'])

    // What each kind is good for: a footprint for one, a point for the other.
    expect(buildFootprint(parsed.verticals[0]!).groundWidthM).toBeCloseTo(2400.3, 6)
    expect(buildObliquePoint(parsed.obliques[0]!).position).toHaveLength(2)
  })

  it('checks the row count against the sheet’s own Total Frames', () => {
    // The trailer is free validation: if it disagrees, the parser's idea of where the listing
    // starts and stops is wrong, and the map is missing frames.
    const parsed = parseWorkbook(
      bytes({ name: SHEET, grid: verticalsGrid(SAMPLE_VERTICAL_ROWS, { totalFrames: 29 }) }),
    )

    expect(parsed.verticals).toHaveLength(4)
    expect(parsed.issues).toHaveLength(1)
    expect(parsed.issues[0]?.reason).toContain('“Total Frames” says 29, but 4 rows')
    expect(parsed.sheets[0]?.totalFramesStated).toBe(29)
  })

  it('says nothing about the total when the sheet agrees with itself', () => {
    const parsed = parseWorkbook(bytes({ name: SHEET, grid: verticalsGrid() }))

    expect(parsed.issues).toEqual([])
  })

  it('does not complain about a sheet with no trailer at all', () => {
    const parsed = parseWorkbook(
      bytes({
        name: SHEET,
        grid: verticalsGrid(SAMPLE_VERTICAL_ROWS, { totalFrames: null, totalSorties: null }),
      }),
    )

    expect(parsed.issues).toEqual([])
    expect(parsed.sheets[0]?.totalFramesStated).toBeUndefined()
  })

  it('counts a row that failed to parse as a row the sheet listed', () => {
    // A frame the parser could not read is still a frame the sheet listed, and it is already
    // reported on its own line — so it must not also trip the totals check.
    const rows = [...SAMPLE_VERTICAL_ROWS]
    rows[1] = { ...rows[1]!, centre: 'nonsense' }
    const parsed = parseWorkbook(bytes({ name: SHEET, grid: verticalsGrid(rows) }))

    expect(parsed.verticals).toHaveLength(3)
    expect(parsed.issues).toHaveLength(1)
    expect(parsed.issues[0]?.reason).toContain('Centre point')
    expect(parsed.sheets[0]).toMatchObject({ rowsRead: 4, recordsParsed: 3 })
  })

  it('reports a workbook with nothing in it rather than returning silence', () => {
    const parsed = parseWorkbook(bytes({ name: 'Notes', grid: [['Nothing to see here']] }))

    expect(parsed.verticals).toEqual([])
    expect(parsed.issues).toHaveLength(1)
    expect(parsed.issues[0]?.reason).toContain('No header row was found')
  })

  it('reads a CSV export of the same listing, since one reader does both', () => {
    const csv = verticalsGrid()
      .map((row) => row.map((cell) => (cell === null ? '' : `"${String(cell)}"`)).join(','))
      .join('\n')

    const parsed = parseWorkbook(new TextEncoder().encode(csv))

    expect(parsed.verticals).toHaveLength(SAMPLE_VERTICAL_ROWS.length)
    // Everything arrives as text from a CSV, and a measurement must survive that.
    expect(parsed.verticals[0]?.scaleDenominator).toBe(10500)
    expect(parsed.verticals[0]?.focalLengthMm).toBeCloseTo(152.4, 10)
  })
})
