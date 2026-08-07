/**
 * Unit normalisation. Catalogues quote inches and feet; the domain works in millimetres and
 * metres.
 *
 * The rule that matters here: never `parseInt` a measurement. A 6″ lens is 152.4 mm and
 * truncating it to 152 mm is a real error that everything downstream inherits.
 */

export const MM_PER_INCH = 25.4
export const M_PER_FOOT = 0.3048
export const M_PER_MILE = 1609.344

export function inchesToMm(inches: number): number {
  return inches * MM_PER_INCH
}

export function mmToInches(mm: number): number {
  return mm / MM_PER_INCH
}

export function feetToMetres(feet: number): number {
  return feet * M_PER_FOOT
}

export function metresToFeet(metres: number): number {
  return metres / M_PER_FOOT
}

export function squareMetresToSquareMiles(squareMetres: number): number {
  return squareMetres / (M_PER_MILE * M_PER_MILE)
}

/**
 * Read a measurement from a spreadsheet cell without truncating it.
 *
 * Accepts numbers and numeric strings, tolerating surrounding whitespace and thousands
 * separators. Returns `null` for anything that is not wholly a number — including `""`,
 * `null`, `undefined`, `NaN` and part-numeric text like `"6 inches"` — so the caller can
 * raise a `ParseIssue` rather than proceed with a plausible-looking wrong value.
 */
export function parseMeasurement(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string') return null

  const text = value.trim().replace(/,/g, '')
  if (text === '') return null

  const parsed = Number(text)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * Render a catalogue identifier for display.
 *
 * Excel hands over frame numbers as floats — `23.0` must show as `23`. Values that are not
 * wholly numeric are kept verbatim, because `"5356A"` is a real library number and
 * `"MAL/74049(Z)"` is a real sortie number.
 */
export function formatCatalogueNumber(value: unknown): string {
  const parsed = parseMeasurement(value)
  if (parsed !== null) return String(parsed)
  if (typeof value === 'string') return value.trim()
  return value == null ? '' : String(value)
}
