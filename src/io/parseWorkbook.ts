/**
 * The whole of the read: bytes in, records and issues out.
 *
 * One supplier workbook can hold a verticals listing and up to two oblique ones on separate tabs
 * (INPUT-FORMAT.md §1), so this composes `readWorkbook` with the two row parsers and adds the one
 * check that spans a whole sheet: the listing's own `Total Frames` trailer against the number of
 * rows actually read. That trailer is free validation — if the two disagree, something about the
 * layout is not what the parser assumed, and the user should be told before they trust the map.
 */

import type { ObliqueRecord, ParseIssue, VerticalRecord } from '../domain/types'
import { parseObliques } from './parseObliques'
import type { SheetParse } from './parseVerticals'
import { parseVerticals } from './parseVerticals'
import type { SheetKind, SheetTable } from './readWorkbook'
import { readWorkbook } from './readWorkbook'

/** What one sheet contributed, for the UI to report on the load. */
export interface SheetSummary {
  sheetName: string
  kind: SheetKind
  /** 1-based row number the header was found on. */
  headerLine: number
  /** Data rows found beneath the header. */
  rowsRead: number
  /** Rows that became records. */
  recordsParsed: number
  /** The sheet's own `Total Frames` figure, where it has one. */
  totalFramesStated?: number
}

export interface WorkbookParse {
  verticals: VerticalRecord[]
  obliques: ObliqueRecord[]
  /** Every failure and caveat, in sheet then row order. Never empty when rows were dropped. */
  issues: ParseIssue[]
  sheets: SheetSummary[]
}

/** Parse a supplier workbook's bytes into records. Runs entirely in the browser. */
export function parseWorkbook(data: ArrayBuffer | ArrayBufferView): WorkbookParse {
  const { sheets, issues: readIssues } = readWorkbook(data)

  const verticals: VerticalRecord[] = []
  const obliques: ObliqueRecord[] = []
  const issues: ParseIssue[] = [...readIssues]
  const summaries: SheetSummary[] = []

  for (const table of sheets) {
    const parsed: SheetParse<VerticalRecord | ObliqueRecord> =
      table.kind === 'verticals' ? parseVerticals(table) : parseObliques(table)

    // `kind` is the discriminant the whole app sorts on: verticals get a footprint, obliques a
    // point. Splitting on it here rather than on the sheet keeps that decision in one place.
    for (const record of parsed.records) {
      if (record.kind === 'vertical') verticals.push(record)
      else obliques.push(record)
    }

    issues.push(...parsed.issues)

    const totalCheck = checkFrameTotal(table)
    if (totalCheck !== null) issues.push(totalCheck)

    const summary: SheetSummary = {
      sheetName: table.sheetName,
      kind: table.kind,
      headerLine: table.headerLine,
      rowsRead: parsed.rowsRead,
      recordsParsed: parsed.records.length,
    }
    if (table.trailer.totalFrames !== undefined) {
      summary.totalFramesStated = table.trailer.totalFrames
    }
    summaries.push(summary)
  }

  if (sheets.length === 0 && issues.length === 0) {
    issues.push({
      line: 1,
      reason: 'No aerial photography listing was found in this file.',
    })
  }

  return { verticals, obliques, issues, sheets: summaries }
}

/** `parseWorkbook` for a dropped or picked file. */
export async function parseWorkbookFile(file: File): Promise<WorkbookParse> {
  return parseWorkbook(await file.arrayBuffer())
}

/**
 * Compare the sheet's stated frame count against the rows read.
 *
 * The comparison is against rows *read*, not records *built* — a row that failed to parse is
 * still a frame the sheet listed, and it is already reported on its own line. A mismatch here
 * means rows were never seen at all, which is the failure worth shouting about.
 */
function checkFrameTotal(table: SheetTable): ParseIssue | null {
  const stated = table.trailer.totalFrames
  if (stated === undefined || stated === table.rows.length) return null

  return {
    line: table.trailer.line ?? table.headerLine,
    sheet: table.sheetName,
    reason:
      `The sheet’s “Total Frames” says ${stated}, but ${table.rows.length} row` +
      `${table.rows.length === 1 ? '' : 's'} of frames were found. Some frames may be missing ` +
      `from the map.`,
    value: { totalFrames: stated, rowsRead: table.rows.length },
  }
}
