/**
 * Turning a formatted supplier report into columns: header text → field mapping, and the
 * composite strings the catalogue packs into a single cell.
 *
 * Nothing here trusts a column position. The sample workbook has blank spacer columns, merged
 * header cells and a second header row carrying only `(in inches)` — see INPUT-FORMAT.md §3 —
 * and a different report template will move all of it. Columns are found by their header text.
 */

import type { Film } from '../domain/types'
import { inchesToMm, parseMeasurement } from '../domain/units'

/** A cell straight from the sheet. `null` is an empty cell. */
export type CellValue = string | number | boolean | null

/** A length unit a catalogue might be quoting in. Historic England quotes inches. */
export type LengthUnit = 'in' | 'mm'

/**
 * Display text for a cell: whitespace collapsed and trimmed, empty for a blank cell.
 *
 * Deliberately not a measurement reader — use `parseMeasurement` for anything numeric, so a
 * `6` never becomes the string `"6"` on the way to arithmetic.
 */
export function cellText(value: CellValue | undefined): string {
  if (value === null || value === undefined) return ''
  return String(value).replace(/\s+/g, ' ').trim()
}

/** True when every cell in the row is empty. */
export function isBlankRow(cells: readonly (CellValue | undefined)[]): boolean {
  return cells.every((cell) => cellText(cell) === '')
}

/**
 * Reduce a header cell to a comparable key.
 *
 * Case, runs of whitespace, parenthesised qualifiers and trailing punctuation all vary between
 * report templates and none of them carries meaning: `"Library  number"` has a double space in
 * the sample, `"Focal length "` a trailing one, and `"Scale 1:"` a colon. `"Film details (in
 * inches)"` and `"Film details"` are the same column — the unit is read separately by
 * `unitFromHeader`.
 */
export function headerKey(value: CellValue | undefined): string {
  const withoutQualifiers = cellText(value).toLowerCase().replace(/\([^)]*\)/g, ' ')
  return withoutQualifiers
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[:.,]+$/, '')
    .trim()
}

/** One column a sheet may carry. */
export interface ColumnSpec<Field extends string> {
  field: Field
  /** Header keys, as `headerKey` renders them. The first is the canonical one for messages. */
  aliases: readonly [string, ...string[]]
  /** A row cannot become a record without this column. */
  required?: boolean
}

/** Which column each field was found in, for one sheet. */
export interface ColumnMapping<Field extends string> {
  /** 0-based column index per field. Absent when the sheet has no such column. */
  indexByField: Partial<Record<Field, number>>
  /** Header text as found, including any continuation row — `"Focal length (in inches)"`. */
  headerByField: Partial<Record<Field, string>>
  /** Required fields with no column. The sheet cannot yield records without them. */
  missingRequired: Field[]
  /** Headers that matched nothing, kept so an unfamiliar template can be diagnosed. */
  unmapped: string[]
}

/**
 * Match a header key against a column spec.
 *
 * Exact first, then an unambiguous prefix so `"Centre point of frame"` still finds the centre
 * point column. A prefix that fits two specs is left unmatched rather than guessed at.
 */
export function matchField<Field extends string>(
  key: string,
  specs: readonly ColumnSpec<Field>[],
): Field | undefined {
  if (key === '') return undefined

  const exact = specs.find((spec) => spec.aliases.includes(key))
  if (exact) return exact.field

  const prefixed = specs.filter((spec) => spec.aliases.some((alias) => key.startsWith(alias)))
  return prefixed.length === 1 ? prefixed[0]?.field : undefined
}

/** Map a header row onto fields. First column wins where two headers claim the same field. */
export function mapColumns<Field extends string>(
  headers: readonly (CellValue | undefined)[],
  specs: readonly ColumnSpec<Field>[],
): ColumnMapping<Field> {
  const indexByField: Partial<Record<Field, number>> = {}
  const headerByField: Partial<Record<Field, string>> = {}
  const unmapped: string[] = []

  headers.forEach((header, index) => {
    const key = headerKey(header)
    if (key === '') return

    const field = matchField(key, specs)
    if (field === undefined || indexByField[field] !== undefined) {
      unmapped.push(cellText(header))
      return
    }

    indexByField[field] = index
    headerByField[field] = cellText(header)
  })

  const missingRequired = specs
    .filter((spec) => spec.required === true && indexByField[spec.field] === undefined)
    .map((spec) => spec.field)

  return { indexByField, headerByField, missingRequired, unmapped }
}

/** How many distinct fields a row's cells look like headers for. Used to find the header row. */
export function countMatchedFields<Field extends string>(
  cells: readonly (CellValue | undefined)[],
  specs: readonly ColumnSpec<Field>[],
): number {
  const found = new Set<Field>()
  for (const cell of cells) {
    const field = matchField(headerKey(cell), specs)
    if (field !== undefined) found.add(field)
  }
  return found.size
}

/** The raw cell for a field, or `null` when the sheet has no such column. */
export function fieldCell<Field extends string>(
  cells: readonly (CellValue | undefined)[],
  mapping: ColumnMapping<Field>,
  field: Field,
): CellValue {
  const index = mapping.indexByField[field]
  if (index === undefined) return null
  const value = cells[index]
  return value === undefined ? null : value
}

/** A field's display text, empty when absent. */
export function fieldText<Field extends string>(
  cells: readonly (CellValue | undefined)[],
  mapping: ColumnMapping<Field>,
  field: Field,
): string {
  return cellText(fieldCell(cells, mapping, field))
}

/**
 * The unit a column's header states it is quoting in, e.g. `"Focal length (in inches)"`.
 *
 * The catalogue's own convention is inches (INPUT-FORMAT.md §3), which is the fallback — but a
 * header that says millimetres is believed rather than silently converted as if it were inches.
 */
export function unitFromHeader(header: string | undefined, fallback: LengthUnit = 'in'): LengthUnit {
  if (header === undefined) return fallback
  if (/\bmm\b|millimet/i.test(header)) return 'mm'
  if (/inch|\bins?\b|["”″]/i.test(header)) return 'in'
  return fallback
}

// Longest alternatives first, so `inches` is not matched as `in` followed by stray text.
const UNIT_PATTERN = String.raw`millimetres|millimeters|inches|millimetre|millimeter|inch|ins|mm|in|["”″]`
const DIMENSION_PAIR = new RegExp(
  String.raw`(\d+(?:\.\d+)?)\s*(${UNIT_PATTERN})?\s*(?:x|×|by)\s*(\d+(?:\.\d+)?)\s*(${UNIT_PATTERN})?`,
  'i',
)
const SINGLE_DIMENSION = new RegExp(String.raw`(\d+(?:\.\d+)?)\s*(${UNIT_PATTERN})`, 'i')

/**
 * Read a frame size out of the catalogue's free-text film description.
 *
 * One cell carries both the emulsion and the format: `"Black and White 9 x 9"` is a 9-inch
 * square frame, `"Digital Colour 35mm"` a 35 mm one (INPUT-FORMAT.md §5). Three forms are
 * handled — a `W x H` pair, a single dimension taken as square, and either with an explicit
 * unit, which wins over `defaultUnit`.
 *
 * The first dimension is taken as across-track. For every frame seen so far the format is
 * square, so the choice has no effect on real data; it matters the day a `9 x 18` turns up.
 *
 * Returns `null` when no size can be read, so the caller can raise a `ParseIssue` rather than
 * guess at a frame size — a wrong frame size scales the whole footprint.
 */
export function parseFilmDetails(value: CellValue, defaultUnit: LengthUnit = 'in'): Film | null {
  const description = cellText(value)
  if (description === '') return null

  const pair = DIMENSION_PAIR.exec(description)
  if (pair) {
    const [, widthText, widthUnit, heightText, heightUnit] = pair
    const unit = resolveUnit(heightUnit ?? widthUnit, defaultUnit)
    const widthMm = toMm(parseMeasurement(widthText), unit)
    const heightMm = toMm(parseMeasurement(heightText), unit)
    if (widthMm === null || heightMm === null) return null
    return { widthMm, heightMm, description }
  }

  // A lone dimension is only believed with an explicit unit — a bare number in a description
  // could be anything, and `35mm` is the form the guide's oblique examples use.
  const single = SINGLE_DIMENSION.exec(description)
  if (single) {
    const [, sizeText, unitText] = single
    const sideMm = toMm(parseMeasurement(sizeText), resolveUnit(unitText, defaultUnit))
    if (sideMm !== null) return { widthMm: sideMm, heightMm: sideMm, description }
  }

  return null
}

function resolveUnit(unitText: string | undefined, fallback: LengthUnit): LengthUnit {
  if (unitText === undefined) return fallback
  return /^m/i.test(unitText) ? 'mm' : 'in'
}

function toMm(value: number | null, unit: LengthUnit): number | null {
  if (value === null || value <= 0) return null
  return unit === 'mm' ? value : inchesToMm(value)
}
