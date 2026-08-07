/**
 * Vertical listing rows → `VerticalRecord[]`, plus a `ParseIssue` for every row that could not
 * be read. Column layout is documented in INPUT-FORMAT.md §3.
 *
 * The rule this module exists to honour: **one malformed row must not discard the other
 * forty-nine.** Every failure is per-row, carries the source line number and a reason a
 * customer can act on, and leaves the rest of the listing intact.
 */

import { InvalidGridRefError, parseGridRef } from '../domain/osgb'
import type { GridRef, ParseIssue, Provenance, VerticalRecord } from '../domain/types'
import { formatCatalogueNumber, inchesToMm, parseMeasurement } from '../domain/units'
import type { CellValue, ColumnMapping, ColumnSpec } from './columns'
import { cellText, fieldCell, fieldText, mapColumns, parseFilmDetails, unitFromHeader } from './columns'
import type { SheetRow, SheetTable } from './readWorkbook'

export type VerticalField =
  | 'sortieNumber'
  | 'libraryNumber'
  | 'cameraPosition'
  | 'frameNumber'
  | 'held'
  | 'centrePoint'
  | 'run'
  | 'date'
  | 'sortieQuality'
  | 'scaleDenominator'
  | 'focalLength'
  | 'filmDetails'
  | 'filmHeldBy'

/**
 * The verticals listing's columns, as observed in a Historic England result set.
 *
 * Three are required, because without them there is no footprint: the centre point places the
 * frame, and the scale and film format size it. Everything else is provenance — valuable to a
 * customer placing an order, but its absence does not stop a frame being drawn.
 */
export const VERTICAL_COLUMNS: readonly ColumnSpec<VerticalField>[] = [
  { field: 'sortieNumber', aliases: ['sortie number'] },
  { field: 'libraryNumber', aliases: ['library number'] },
  { field: 'cameraPosition', aliases: ['camera position'] },
  { field: 'frameNumber', aliases: ['frame number'] },
  { field: 'held', aliases: ['held'] },
  { field: 'centrePoint', aliases: ['centre point', 'center point'], required: true },
  { field: 'run', aliases: ['run'] },
  { field: 'date', aliases: ['date'] },
  { field: 'sortieQuality', aliases: ['sortie quality'] },
  { field: 'scaleDenominator', aliases: ['scale 1', 'scale'], required: true },
  { field: 'focalLength', aliases: ['focal length'] },
  { field: 'filmDetails', aliases: ['film details'], required: true },
  { field: 'filmHeldBy', aliases: ['film held by'] },
]

/** What one sheet yielded. `rowsRead` counts data rows whether or not they became records. */
export interface SheetParse<Record_> {
  sheetName: string
  records: Record_[]
  issues: ParseIssue[]
  rowsRead: number
}

export function parseVerticals(table: SheetTable): SheetParse<VerticalRecord> {
  const mapping = mapColumns(table.headers, VERTICAL_COLUMNS)
  const records: VerticalRecord[] = []
  const issues: ParseIssue[] = []

  if (mapping.missingRequired.length > 0) {
    issues.push({
      line: table.headerLine,
      sheet: table.sheetName,
      reason:
        `The verticals listing has no ${describeFields(mapping.missingRequired)} column, so its ` +
        `${table.rows.length} row${table.rows.length === 1 ? '' : 's'} could not be read.`,
      value: table.headers.filter((header) => header !== ''),
    })
    return { sheetName: table.sheetName, records, issues, rowsRead: table.rows.length }
  }

  // The catalogue quotes inches, but believe a header that says otherwise rather than converting
  // millimetres as if they were inches.
  const filmUnit = unitFromHeader(mapping.headerByField.filmDetails)
  const focalUnit = unitFromHeader(mapping.headerByField.focalLength)
  const usedIds = new Set<string>()

  for (const row of table.rows) {
    const fail = (reason: string): void => {
      issues.push({ line: row.line, sheet: table.sheetName, reason, value: row.cells })
    }

    const ref = readGridRef(row, mapping, 'centrePoint', 'Centre point', fail)
    if (ref === null) continue

    const scaleCell = fieldCell(row.cells, mapping, 'scaleDenominator')
    const scaleDenominator = parseMeasurement(scaleCell)
    if (scaleDenominator === null || scaleDenominator <= 0) {
      fail(
        `Scale 1: is ${describeValue(scaleCell)}, which is not a positive number, so the ` +
          `footprint cannot be sized.`,
      )
      continue
    }

    const filmCell = fieldCell(row.cells, mapping, 'filmDetails')
    const film = parseFilmDetails(filmCell, filmUnit)
    if (film === null) {
      fail(
        `Film details is ${describeValue(filmCell)}; no frame size such as “9 x 9” or “35mm” ` +
          `could be read from it, so the footprint cannot be sized.`,
      )
      continue
    }

    const provenance = readProvenance(row, mapping)
    const record: VerticalRecord = {
      kind: 'vertical',
      id: uniqueId(`${provenance.sortieNumber} frame ${provenance.frameNumber}`.trim(), row.line, usedIds),
      ref,
      film,
      scaleDenominator,
      provenance,
    }

    // Focal length is redundant for the footprint — it only yields the flying height — so a bad
    // value costs a displayed number, not the frame. Keep the row and say what was dropped.
    const focalCell = fieldCell(row.cells, mapping, 'focalLength')
    if (cellText(focalCell) !== '') {
      const focalLength = parseMeasurement(focalCell)
      if (focalLength === null || focalLength <= 0) {
        issues.push({
          line: row.line,
          sheet: table.sheetName,
          severity: 'warning',
          reason:
            `Focal length is ${describeValue(focalCell)}, which is not a positive number. The ` +
            `frame was kept, without a flying height.`,
          value: focalCell,
        })
      } else {
        record.focalLengthMm = focalUnit === 'mm' ? focalLength : inchesToMm(focalLength)
      }
    }

    records.push(record)
  }

  return { sheetName: table.sheetName, records, issues, rowsRead: table.rows.length }
}

/**
 * Read a grid reference cell.
 *
 * Shared with the oblique parser: both listings identify a frame by a six-figure reference, and
 * both must turn a bad one into a readable issue rather than an exception that takes the file
 * down with it.
 */
export function readGridRef<Field extends string>(
  row: SheetRow,
  mapping: ColumnMapping<Field>,
  field: Field,
  label: string,
  fail: (reason: string) => void,
): GridRef | null {
  const text = fieldText(row.cells, mapping, field)
  if (text === '') {
    fail(`${label} is empty, so the frame cannot be placed on the map.`)
    return null
  }

  try {
    return parseGridRef(text)
  } catch (error) {
    if (error instanceof InvalidGridRefError) {
      fail(`${label}: ${error.message}`)
      return null
    }
    throw error
  }
}

/**
 * The provenance columns, carried through untouched — they are how a customer places an order.
 *
 * `formatCatalogueNumber` is doing real work here: Excel hands over `Frame number` as the float
 * `23`, which must display as `23`, while `Library  number` looks numeric but holds values like
 * `5356A` and has to stay text.
 */
function readProvenance(row: SheetRow, mapping: ColumnMapping<VerticalField>): Provenance {
  const optional = (field: VerticalField): string | undefined => {
    const text = fieldText(row.cells, mapping, field)
    return text === '' ? undefined : text
  }

  return {
    sortieNumber: formatCatalogueNumber(fieldCell(row.cells, mapping, 'sortieNumber')),
    libraryNumber: formatCatalogueNumber(fieldCell(row.cells, mapping, 'libraryNumber')),
    cameraPosition: fieldText(row.cells, mapping, 'cameraPosition'),
    frameNumber: formatCatalogueNumber(fieldCell(row.cells, mapping, 'frameNumber')),
    run: optionalCatalogueNumber(fieldCell(row.cells, mapping, 'run')),
    date: optional('date'),
    sortieQuality: optional('sortieQuality'),
    held: optional('held'),
    filmHeldBy: optional('filmHeldBy'),
  }
}

function optionalCatalogueNumber(value: CellValue): string | undefined {
  const text = formatCatalogueNumber(value)
  return text === '' ? undefined : text
}

/**
 * A stable, human-readable identifier — `"MAL/67055 frame 23"`.
 *
 * The map and the table key off this, so it has to be unique even when a listing repeats a
 * sortie and frame. The row number is the tie-breaker.
 */
export function uniqueId(preferred: string, line: number, used: Set<string>): string {
  const base = preferred === '' || preferred === 'frame' ? `row ${line}` : preferred
  const id = used.has(base) ? `${base} (row ${line})` : base
  used.add(id)
  return id
}

/** `["centrePoint", "scaleDenominator"]` → `"“Centre point” or “Scale 1:”"`. */
export function describeFields(fields: readonly string[]): string {
  const labels = fields.map((field) => `“${FIELD_LABELS[field] ?? field}”`)
  const last = labels[labels.length - 1]
  if (labels.length <= 1 || last === undefined) return labels.join('')
  return `${labels.slice(0, -1).join(', ')} or ${last}`
}

/** Render a cell inside an issue message, distinguishing empty from unreadable. */
export function describeValue(value: CellValue): string {
  const text = cellText(value)
  return text === '' ? 'empty' : `“${text}”`
}

const FIELD_LABELS: Readonly<Record<string, string>> = {
  centrePoint: 'Centre point',
  scaleDenominator: 'Scale 1:',
  filmDetails: 'Film details',
  mapReference: 'Map Reference',
}
