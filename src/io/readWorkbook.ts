/**
 * Workbook → tables. Finds the header row in a formatted report, classifies the sheet, collects
 * the data rows and reads the `Total …` trailer.
 *
 * A supplier sheet is a *report*, not a data table: banner rows above the header, a second
 * header row carrying only unit qualifiers, blank spacer columns, merged cells, and a totals
 * trailer at the bottom (INPUT-FORMAT.md §2). None of those positions are safe to hard-code, so
 * everything here is located by content.
 *
 * The reader does not know what a grid reference is. It hands `SheetTable`s to
 * `parseVerticals` / `parseObliques`, which turn rows into records.
 */

import * as XLSX from 'xlsx'
import type { ParseIssue } from '../domain/types'
import { parseMeasurement } from '../domain/units'
import type { CellValue, ColumnSpec } from './columns'
import { cellText, countMatchedFields, headerKey, isBlankRow, matchField } from './columns'
import { OBLIQUE_COLUMNS } from './parseObliques'
import { VERTICAL_COLUMNS } from './parseVerticals'

/** Which listing a sheet holds. `'unknown'` sheets are reported, never guessed at. */
export type SheetKind = 'verticals' | 'obliques'

/** One data row, with the source row number an issue can point a user at. */
export interface SheetRow {
  /** 1-based row number in the source sheet. */
  line: number
  cells: readonly CellValue[]
}

/** The sheet's own count of what it contains — a free check on the parse. */
export interface Trailer {
  totalFrames?: number
  totalSorties?: number
  /** 1-based row number the first `Total …` label was found on. */
  line?: number
}

/** A located listing: where its header was, what it is, and the rows beneath it. */
export interface SheetTable {
  sheetName: string
  kind: SheetKind
  /** 1-based row number of the header row. */
  headerLine: number
  /** Header text per 0-based column, with any continuation row appended. `''` for spacers. */
  headers: string[]
  rows: SheetRow[]
  trailer: Trailer
}

export interface WorkbookRead {
  sheets: SheetTable[]
  issues: ParseIssue[]
}

/**
 * Enough recognised headers on one row to call it the header row. Three is comfortably above
 * anything a banner or data row scores, and below the thirteen the sample's header carries.
 */
const MIN_HEADER_MATCHES = 3

/**
 * Every column any known listing can have, for finding and classifying a header row. The two
 * specs are kept disjoint so a match is never ambiguous between listing types.
 */
const ALL_COLUMNS: readonly ColumnSpec<string>[] = [...VERTICAL_COLUMNS, ...OBLIQUE_COLUMNS]

const TRAILER_LABEL = /^total\s+(sorties|frames)\b/i

/**
 * Read an `.xls`, `.xlsx` or CSV byte stream into located tables.
 *
 * Everything runs in the browser: the bytes come from a `File` the user dropped and go no
 * further. There is no upload.
 */
export function readWorkbook(data: ArrayBuffer | ArrayBufferView): WorkbookRead {
  const workbook = XLSX.read(toBytes(data), { type: 'array', cellDates: false })

  const sheets: SheetTable[] = []
  const issues: ParseIssue[] = []

  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName]
    if (worksheet === undefined) continue

    const read = readSheetGrid(sheetName, toGrid(worksheet))
    if (read.table !== null) sheets.push(read.table)
    issues.push(...read.issues)
  }

  if (workbook.SheetNames.length === 0) {
    issues.push({ line: 1, reason: 'The file contains no sheets.' })
  }

  return { sheets, issues }
}

/** `readWorkbook` for a dropped or picked file. */
export async function readWorkbookFile(file: File): Promise<WorkbookRead> {
  return readWorkbook(await file.arrayBuffer())
}

/**
 * Locate the listing within one sheet, given its cells as a grid.
 *
 * Split out from `readWorkbook` so the whole of the locating logic — banner rows, continuation
 * headers, spacer columns, the trailer — is testable from a literal array, without a workbook.
 */
export function readSheetGrid(
  sheetName: string,
  grid: readonly (readonly CellValue[])[],
): { table: SheetTable | null; issues: ParseIssue[] } {
  const issues: ParseIssue[] = []

  const headerIndex = findHeaderRow(grid)
  if (headerIndex === null) {
    return {
      table: null,
      issues: [
        {
          line: 1,
          sheet: sheetName,
          severity: 'warning',
          reason:
            'No header row was found, so the sheet was skipped. A verticals listing has ' +
            '“Centre point” and “Scale 1:” headers; an oblique listing has a “Map Reference” header.',
        },
      ],
    }
  }

  const headers = (grid[headerIndex] ?? []).map((cell) => cellText(cell))

  // A header can span two rows: the sample's second row carries only `(in inches)`, under
  // `Focal length`. Fold those qualifiers into the header above so the unit is not lost.
  let dataStart = headerIndex + 1
  while (dataStart < grid.length && isHeaderContinuation(grid[dataStart] ?? [])) {
    appendContinuation(headers, grid[dataStart] ?? [])
    dataStart += 1
  }

  const kind = classifySheet(headers)
  if (kind === null) {
    return {
      table: null,
      issues: [
        {
          line: headerIndex + 1,
          sheet: sheetName,
          severity: 'warning',
          reason:
            `The header row was found but the listing type could not be told from it, so the ` +
            `sheet was skipped. Headers read: ${headers.filter((h) => h !== '').join(', ')}.`,
        },
      ],
    }
  }

  const rows: SheetRow[] = []
  const trailer: Trailer = {}
  let listingEnded = false

  for (let index = dataStart; index < grid.length; index += 1) {
    const cells = grid[index] ?? []
    const line = index + 1

    const total = readTrailerRow(cells)
    if (total !== null) {
      // The trailer ends the listing. Keep scanning: sorties and frames are on separate rows.
      listingEnded = true
      if (trailer.line === undefined) trailer.line = line
      if (total.value !== undefined) trailer[total.field] = total.value
      continue
    }

    if (isBlankRow(cells)) continue

    // A long report may repeat its header block; that is not a row of data and not an error.
    if (countMatchedFields(cells, ALL_COLUMNS) >= MIN_HEADER_MATCHES) continue

    if (listingEnded) {
      issues.push({
        line,
        sheet: sheetName,
        severity: 'warning',
        reason: 'This row sits below the “Total …” trailer, so it was not read as a frame.',
        value: cells,
      })
      continue
    }

    rows.push({ line, cells })
  }

  return { table: { sheetName, kind, headerLine: headerIndex + 1, headers, rows, trailer }, issues }
}

/** The first row carrying enough recognisable headers to be the header row. */
function findHeaderRow(grid: readonly (readonly CellValue[])[]): number | null {
  for (let index = 0; index < grid.length; index += 1) {
    if (countMatchedFields(grid[index] ?? [], ALL_COLUMNS) >= MIN_HEADER_MATCHES) return index
  }
  return null
}

/**
 * Which listing this is, from its headers.
 *
 * By header content, never by tab name: the sample's tab is called
 * `R2.4a - Full single listing wit` — an internal report code truncated to 31 characters
 * (INPUT-FORMAT.md §2).
 *
 * The grid reference column is what separates the two listings — `Centre point` for verticals,
 * `Map Reference` for obliques. Classification deliberately asks no more than that: whether a
 * listing is *usable* is a different question, and one the row parsers answer with a message that
 * names the column at fault. Insisting on `Scale 1:` here would turn a renamed scale column into
 * a whole discarded sheet and one vague warning, instead of twenty-nine frames and a fixable one.
 */
function classifySheet(headers: readonly string[]): SheetKind | null {
  const keys = headers.map((header) => headerKey(header))
  const hasMapReference = keys.some((key) => matchField(key, OBLIQUE_COLUMNS) === 'mapReference')
  const hasCentrePoint = keys.some((key) => matchField(key, VERTICAL_COLUMNS) === 'centrePoint')

  if (hasCentrePoint && !hasMapReference) return 'verticals'
  if (hasMapReference) return 'obliques'
  return null
}

/**
 * True for a row that continues the header rather than starting the data — one whose every
 * populated cell is a bracketed or bare unit qualifier, like the sample's `(in inches)`.
 *
 * Anything else is treated as data. A row of junk then lands in `ParseIssue[]` with its line
 * number, which is the loud failure we want; quietly skipping rows that look unfamiliar is how
 * frames go missing.
 */
function isHeaderContinuation(cells: readonly CellValue[]): boolean {
  const populated = cells.filter((cell) => cellText(cell) !== '')
  if (populated.length === 0) return false

  return populated.every((cell) => {
    if (typeof cell !== 'string') return false
    const text = cellText(cell)
    if (/^\(.*\)$/.test(text)) return true
    return /^(?:in\s+)?(?:inches|inch|ins|mm|millimetres|millimeters|metres|meters|feet|ft)$/i.test(
      text,
    )
  })
}

/** Fold a continuation row's qualifiers into the header text above them. */
function appendContinuation(headers: string[], cells: readonly CellValue[]): void {
  cells.forEach((cell, index) => {
    const text = cellText(cell)
    if (text === '') return
    const existing = headers[index] ?? ''
    headers[index] = existing === '' ? text : `${existing} ${text}`
  })
}

/**
 * Read a `Total Sorties` / `Total Frames` trailer row.
 *
 * The value is the first number to the right of the label, not a fixed offset: in the sample
 * the label is merged across two columns, which puts its value two columns along.
 */
function readTrailerRow(
  cells: readonly CellValue[],
): { field: 'totalFrames' | 'totalSorties'; value?: number } | null {
  for (let column = 0; column < cells.length; column += 1) {
    const match = TRAILER_LABEL.exec(cellText(cells[column]))
    if (match === null) continue

    const field = match[1]?.toLowerCase() === 'frames' ? 'totalFrames' : 'totalSorties'
    for (let next = column + 1; next < cells.length; next += 1) {
      const value = parseMeasurement(cells[next])
      if (value !== null) return { field, value }
    }
    return { field }
  }
  return null
}

/** One worksheet's cells as a rectangular grid of raw values, blank rows included. */
function toGrid(worksheet: XLSX.WorkSheet): CellValue[][] {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
    header: 1,
    raw: true,
    blankrows: true,
    defval: null,
  })
  return rows.map((row) => (Array.isArray(row) ? row.map(normaliseCell) : []))
}

/**
 * Narrow a raw SheetJS cell to a `CellValue`.
 *
 * Numbers stay numbers — the numeric path must never receive a pre-stringified measurement, and
 * a frame number arrives as the float `23`.
 */
function normaliseCell(value: unknown): CellValue {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') return value === '' ? null : value
  if (value instanceof Date) return value.toISOString()
  return String(value)
}

function toBytes(data: ArrayBuffer | ArrayBufferView): Uint8Array {
  return data instanceof ArrayBuffer
    ? new Uint8Array(data)
    : new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
}
