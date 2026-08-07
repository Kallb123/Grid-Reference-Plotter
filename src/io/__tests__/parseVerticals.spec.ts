import { describe, expect, it } from 'vitest'
import { buildFootprint } from '../../domain/footprint'
import { parseVerticals } from '../parseVerticals'
import { readSheetGrid } from '../readWorkbook'
import type { SheetTable } from '../readWorkbook'
import type { VerticalFixtureRow } from './fixtures'
import { FIRST_DATA_LINE, HEADER_LINE, SAMPLE_VERTICAL_ROWS, verticalsGrid } from './fixtures'

const SHEET = 'R2.4a - Full single listing wit'

function tableFor(rows: readonly VerticalFixtureRow[] = SAMPLE_VERTICAL_ROWS): SheetTable {
  const { table } = readSheetGrid(SHEET, verticalsGrid(rows))
  if (table === null) throw new Error('fixture did not produce a table')
  return table
}

describe('parseVerticals', () => {
  it('reads every row of a well-formed listing', () => {
    const { records, issues, rowsRead } = parseVerticals(tableFor())

    expect(issues).toEqual([])
    expect(rowsRead).toBe(SAMPLE_VERTICAL_ROWS.length)
    expect(records).toHaveLength(SAMPLE_VERTICAL_ROWS.length)
    expect(records.every((record) => record.kind === 'vertical')).toBe(true)
  })

  it('reproduces the worked example in INPUT-FORMAT.md §4', () => {
    const [record] = parseVerticals(tableFor()).records
    if (record === undefined) throw new Error('no record')

    // MAL/67055, frame 23, SK 421 849, 1:10500, 6", Black and White 9 x 9
    expect(record.ref.easting).toBe(442150)
    expect(record.ref.northing).toBe(384950)
    expect(record.ref.precisionM).toBe(100)
    expect(record.scaleDenominator).toBe(10500)
    expect(record.film.widthMm).toBeCloseTo(228.6, 10)
    expect(record.focalLengthMm).toBeCloseTo(152.4, 10)
    expect(record.id).toBe('MAL/67055 frame 23')
  })

  it('feeds the domain layer a footprint of the size the guide predicts', () => {
    // The parse is only worth anything if what comes out sizes correctly: 0.2286 × 10500.
    const [record] = parseVerticals(tableFor()).records
    if (record === undefined) throw new Error('no record')

    const footprint = buildFootprint(record)

    expect(footprint.groundWidthM).toBeCloseTo(2400.3, 6)
    expect(footprint.groundHeightM).toBeCloseTo(2400.3, 6)
    expect(footprint.flyingHeightM).toBeCloseTo(1600.2, 6)
    expect(footprint.uncertaintyM).toBe(50)
  })

  it('keeps a library number as text — `5356A` is a real value', () => {
    const record = parseVerticals(tableFor()).records[1]

    expect(record?.provenance.libraryNumber).toBe('5356A')
  })

  it('renders Excel’s float frame numbers as integers', () => {
    // Excel hands `Frame number` over as a float; `23.0` must not display as `23.0`.
    const { records } = parseVerticals(tableFor([{ ...first(), frame: 23.0 }]))

    expect(records[0]?.provenance.frameNumber).toBe('23')
  })

  it('carries the provenance columns through untouched', () => {
    const [record] = parseVerticals(tableFor()).records

    expect(record?.provenance).toEqual({
      sortieNumber: 'MAL/67055',
      libraryNumber: '4777',
      cameraPosition: 'V',
      frameNumber: '23',
      run: '1',
      date: '13 JUN 1967',
      sortieQuality: 'A',
      held: 'P',
      filmHeldBy: 'NMR',
    })
  })

  it('converts the catalogue’s inches on the way in', () => {
    const { records } = parseVerticals(tableFor())
    const twelveInchLens = records[2]

    expect(twelveInchLens?.focalLengthMm).toBeCloseTo(304.8, 10)
    // 12″ at 1:7000 is a flying height of 7000 ft — the check in INPUT-FORMAT.md §4.
    expect(buildFootprint(twelveInchLens!).flyingHeightM).toBeCloseTo(2133.6, 6)
  })

  describe('a malformed row does not take the others with it', () => {
    const rows: VerticalFixtureRow[] = [
      first(),
      { ...first(), sortie: 'MAL/68058', frame: 160, centre: 'SK 42 84 9' },
      { ...first(), sortie: 'OS/71509', frame: 7 },
    ]

    it('keeps the good rows', () => {
      const { records, rowsRead } = parseVerticals(tableFor(rows))

      expect(rowsRead).toBe(3)
      expect(records).toHaveLength(2)
      expect(records.map((record) => record.provenance.sortieNumber)).toEqual([
        'MAL/67055',
        'OS/71509',
      ])
    })

    it('reports the bad one against its own line, with a readable reason', () => {
      const { issues } = parseVerticals(tableFor(rows))

      expect(issues).toHaveLength(1)
      expect(issues[0]?.line).toBe(FIRST_DATA_LINE + 1)
      expect(issues[0]?.sheet).toBe(SHEET)
      expect(issues[0]?.reason).toContain('Centre point')
      expect(issues[0]?.severity).toBeUndefined() // an error: the frame is not on the map
    })
  })

  it('reports each way a row can fail to place or size a frame', () => {
    const rows: VerticalFixtureRow[] = [
      { ...first(), centre: null },
      { ...first(), centre: 'ZZ 421 849' },
      { ...first(), scale: 'not a scale' },
      { ...first(), scale: 0 },
      { ...first(), film: 'Black and White' },
    ]

    const { records, issues } = parseVerticals(tableFor(rows))

    expect(records).toEqual([])
    expect(issues.map((issue) => issue.reason)).toEqual([
      'Centre point is empty, so the frame cannot be placed on the map.',
      expect.stringContaining('is not a National Grid square'),
      expect.stringContaining('Scale 1: is “not a scale”'),
      expect.stringContaining('Scale 1: is “0”'),
      expect.stringContaining('no frame size such as “9 x 9” or “35mm” could be read'),
    ])
  })

  it('keeps a frame whose focal length is unreadable, and says what was lost', () => {
    // Focal length is redundant for the footprint — it only yields the flying height — so losing
    // it must not lose the frame.
    const { records, issues } = parseVerticals(tableFor([{ ...first(), focal: 'six inches' }]))

    expect(records).toHaveLength(1)
    expect(records[0]?.focalLengthMm).toBeUndefined()
    expect(issues[0]?.severity).toBe('warning')
    expect(issues[0]?.reason).toContain('The frame was kept, without a flying height.')
  })

  it('gives every record a unique id even when a listing repeats a frame', () => {
    const { records } = parseVerticals(tableFor([first(), first()]))

    expect(records.map((record) => record.id)).toEqual([
      'MAL/67055 frame 23',
      'MAL/67055 frame 23 (row 16)',
    ])
  })

  it('reports a missing required column once, not once per row', () => {
    // The sheet is still recognisably a verticals listing, so the message names the column at
    // fault rather than the reader shrugging at the whole sheet.
    const { table } = tableWithoutHeader(16) // `Film details (in inches)`
    const { records, issues } = parseVerticals(table)

    expect(records).toEqual([])
    expect(issues).toHaveLength(1)
    expect(issues[0]?.line).toBe(HEADER_LINE)
    expect(issues[0]?.reason).toContain('no “Film details” column')
    expect(issues[0]?.reason).toContain('4 rows could not be read')
  })

  it('names both missing columns when a sheet is missing more than one', () => {
    const { table } = tableWithoutHeader(14, 16) // `Scale 1:` and `Film details`
    const { issues } = parseVerticals(table)

    expect(issues[0]?.reason).toContain('no “Scale 1:” or “Film details” column')
  })

  it('believes a header that quotes millimetres rather than assuming inches', () => {
    const grid = verticalsGrid([{ ...first(), focal: 152.4 }])
    const headerRow = grid[HEADER_LINE - 1]
    if (headerRow === undefined) throw new Error('no header row')
    headerRow[15] = 'Focal length (mm)'
    grid[HEADER_LINE] = grid[HEADER_LINE]?.map(() => null) ?? [] // no `(in inches)` continuation
    const { table } = readSheetGrid(SHEET, grid)
    if (table === null) throw new Error('no table')

    expect(parseVerticals(table).records[0]?.focalLengthMm).toBeCloseTo(152.4, 10)
  })
})

/** The sample listing with one or more header cells blanked out. */
function tableWithoutHeader(...columns: readonly number[]): { table: SheetTable } {
  const grid = verticalsGrid()
  const headerRow = grid[HEADER_LINE - 1]
  if (headerRow === undefined) throw new Error('no header row')
  for (const column of columns) headerRow[column] = null

  const { table } = readSheetGrid(SHEET, grid)
  if (table === null) throw new Error('the sheet was no longer recognised as a listing')
  return { table }
}

function first(): VerticalFixtureRow {
  const [row] = SAMPLE_VERTICAL_ROWS
  if (row === undefined) throw new Error('no sample rows')
  return { ...row }
}
