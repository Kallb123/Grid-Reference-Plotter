import { describe, expect, it } from 'vitest'
import type { CellValue } from '../columns'
import { readSheetGrid, readWorkbook } from '../readWorkbook'
import {
  FIRST_DATA_LINE,
  HEADER_LINE,
  obliquesGrid,
  SAMPLE_VERTICAL_ROWS,
  verticalsGrid,
  verticalsMerges,
  writeWorkbookBytes,
} from './fixtures'

const SHEET = 'R2.4a - Full single listing wit'

describe('readSheetGrid', () => {
  it('finds the header row below the banner rows', () => {
    const { table, issues } = readSheetGrid(SHEET, verticalsGrid())

    expect(issues).toEqual([])
    expect(table?.headerLine).toBe(HEADER_LINE)
    expect(table?.kind).toBe('verticals')
  })

  it('folds the header continuation row into the header above it', () => {
    // The sample's row 14 carries only `(in inches)`, under `Focal length` — that is where the
    // unit is stated, so losing it would leave a 6″ lens looking like 6 mm.
    const { table } = readSheetGrid(SHEET, verticalsGrid())

    expect(table?.headers[15]).toBe('Focal length (in inches)')
    expect(table?.rows[0]?.line).toBe(FIRST_DATA_LINE)
  })

  it('takes every data row and no report furniture', () => {
    const { table } = readSheetGrid(SHEET, verticalsGrid())

    expect(table?.rows).toHaveLength(SAMPLE_VERTICAL_ROWS.length)
    expect(table?.rows.map((row) => row.line)).toEqual([15, 16, 17, 18])
    expect(table?.rows.at(-1)?.cells[1]).toBe('OS/08047')
  })

  it('reads the Total Sorties and Total Frames trailer and stops there', () => {
    const { table } = readSheetGrid(SHEET, verticalsGrid())

    // The label is merged across two columns, so the value is not at a fixed offset.
    expect(table?.trailer.totalFrames).toBe(4)
    expect(table?.trailer.totalSorties).toBe(4)
    expect(table?.trailer.line).toBe(FIRST_DATA_LINE + SAMPLE_VERTICAL_ROWS.length)
  })

  it('keeps reading past a blank row inside the listing', () => {
    const grid = verticalsGrid()
    grid.splice(16, 0, new Array<CellValue>(21).fill(null))

    const { table } = readSheetGrid(SHEET, grid)

    expect(table?.rows).toHaveLength(SAMPLE_VERTICAL_ROWS.length)
    expect(table?.rows.map((row) => row.cells[1])).toContain('OS/08047')
  })

  it('skips a repeated header block without calling it a bad row', () => {
    const grid = verticalsGrid()
    const headerRow = grid[HEADER_LINE - 1] ?? []
    grid.splice(16, 0, [...headerRow])

    const { table, issues } = readSheetGrid(SHEET, grid)

    expect(issues).toEqual([])
    expect(table?.rows).toHaveLength(SAMPLE_VERTICAL_ROWS.length)
  })

  it('reports a row that turns up below the trailer rather than reading it', () => {
    const grid = verticalsGrid()
    const stray = grid[FIRST_DATA_LINE - 1] ?? []
    grid.push([...stray])

    const { table, issues } = readSheetGrid(SHEET, grid)

    expect(table?.rows).toHaveLength(SAMPLE_VERTICAL_ROWS.length)
    expect(issues).toHaveLength(1)
    expect(issues[0]?.severity).toBe('warning')
    expect(issues[0]?.reason).toContain('below the “Total …” trailer')
    expect(issues[0]?.line).toBe(grid.length)
  })

  it('classifies an oblique sheet by its Map Reference header', () => {
    const { table, issues } = readSheetGrid('Oblique', obliquesGrid())

    expect(issues).toEqual([])
    expect(table?.kind).toBe('obliques')
    expect(table?.rows).toHaveLength(2)
  })

  it('skips a sheet with no header row, and says why', () => {
    const grid: CellValue[][] = [['HISTORIC ENGLAND'], [null], ['Notes for the customer']]

    const { table, issues } = readSheetGrid('Notes', grid)

    expect(table).toBeNull()
    expect(issues).toHaveLength(1)
    expect(issues[0]?.severity).toBe('warning')
    expect(issues[0]?.reason).toContain('No header row was found')
  })

  it('will not guess the listing type from a header it half recognises', () => {
    // Enough columns to look like a header, but no centre point and no map reference — so there
    // is nothing to plot, and inventing a classification would be worse than reporting it.
    const grid: CellValue[][] = [
      ['Sortie number', 'Library  number', 'Frame number', 'Held', 'Date'],
      ['MAL/67055', '4777', 23, 'P', '13 JUN 1967'],
    ]

    const { table, issues } = readSheetGrid('Odd', grid)

    expect(table).toBeNull()
    expect(issues[0]?.reason).toContain('listing type could not be told')
  })
})

describe('readWorkbook', () => {
  it('reads a real .xls, through the merged cells and spacer columns', () => {
    // The sample supplier file is Excel 97–2003 binary, not CSV (INPUT-FORMAT.md §1), and its
    // header and data cells are merged across G:H, J:L, M:N, Q:R and S:U.
    const bytes = writeWorkbookBytes(
      [
        {
          name: SHEET,
          grid: verticalsGrid(),
          merges: verticalsMerges(SAMPLE_VERTICAL_ROWS.length),
        },
      ],
      'xls',
    )

    const { sheets, issues } = readWorkbook(bytes)

    expect(issues).toEqual([])
    expect(sheets).toHaveLength(1)
    expect(sheets[0]?.kind).toBe('verticals')
    expect(sheets[0]?.headerLine).toBe(HEADER_LINE)
    expect(sheets[0]?.rows).toHaveLength(SAMPLE_VERTICAL_ROWS.length)
    expect(sheets[0]?.trailer.totalFrames).toBe(SAMPLE_VERTICAL_ROWS.length)
  })

  it('reads .xlsx too — a newer enquiry may well ship one', () => {
    const bytes = writeWorkbookBytes([{ name: SHEET, grid: verticalsGrid() }], 'xlsx')

    const { sheets } = readWorkbook(bytes)

    expect(sheets[0]?.rows).toHaveLength(SAMPLE_VERTICAL_ROWS.length)
  })

  it('keeps numbers as numbers, so no measurement is stringified on the way in', () => {
    const bytes = writeWorkbookBytes([{ name: SHEET, grid: verticalsGrid() }], 'xls')

    const { sheets } = readWorkbook(bytes)
    const firstRow = sheets[0]?.rows[0]

    expect(typeof firstRow?.cells[14]).toBe('number') // Scale 1:
    expect(typeof firstRow?.cells[15]).toBe('number') // Focal length
    expect(typeof firstRow?.cells[2]).toBe('string') // Library number — `5356A` exists
  })

  it('finds a verticals and an oblique listing in one workbook', () => {
    // The guide states both types ship in the same workbook under separate tabs.
    const bytes = writeWorkbookBytes(
      [
        { name: SHEET, grid: verticalsGrid() },
        { name: 'R2.4b - Obliques', grid: obliquesGrid() },
      ],
      'xlsx',
    )

    const { sheets } = readWorkbook(bytes)

    expect(sheets.map((sheet) => sheet.kind)).toEqual(['verticals', 'obliques'])
  })
})
