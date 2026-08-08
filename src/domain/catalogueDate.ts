/**
 * The catalogue's dates, read as dates.
 *
 * The archive stores `13 JUN 1967` as text, not as an Excel date (INPUT-FORMAT.md §5), so
 * anything that wants to order or compare by date has to parse it. That is two things now — the
 * table's date column and the listing filter — which is why this sits in the domain rather than
 * beside either of them.
 *
 * What is displayed is always the text as supplied; this is only ever the comparable value
 * behind it.
 */

/**
 * `"13 JUN 1967"` → a UTC timestamp, or `null` if it is not a date in that form.
 *
 * Deliberately narrow: this parses the `dd MMM yyyy` the archive documents and nothing else,
 * rather than handing an arbitrary string to `Date` and getting a plausible wrong answer out of
 * whatever the host happens to accept. An unrecognised date still displays as supplied; it just
 * has no value to sort or filter by.
 */
export function parseCatalogueDate(text: string): number | null {
  const match = /^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/.exec(text.trim())
  if (match === null) return null

  const [, day = '', monthName = '', year = ''] = match
  const month = MONTHS.indexOf(monthName.slice(0, 3).toUpperCase())
  if (month < 0) return null

  const dayOfMonth = Number(day)
  const timestamp = Date.UTC(Number(year), month, dayOfMonth)
  // `Date.UTC` rolls 31 FEB forward into March rather than rejecting it.
  return new Date(timestamp).getUTCDate() === dayOfMonth ? timestamp : null
}

/**
 * The year a frame was flown, or `null` where the listing does not say.
 *
 * The year rather than the date, because it is what a customer filters by — "anything from the
 * sixties", not "anything after the 13th of June" — and because a listing that gives a date in
 * a form this parser does not recognise should not be silently treated as undated when the year
 * is plainly there.
 */
export function catalogueYear(date: string | undefined): number | null {
  if (date === undefined) return null

  const timestamp = parseCatalogueDate(date)
  if (timestamp !== null) return new Date(timestamp).getUTCFullYear()

  // A four-digit year in a date this parser cannot otherwise read: `"JUN 1967"`, `"1967"`. The
  // range is the span of aerial photography, so a frame number or a library number that happens
  // to have four digits cannot be mistaken for one.
  const match = /(?:^|\D)(1[89]\d{2}|20\d{2})(?:\D|$)/.exec(date)
  return match?.[1] === undefined ? null : Number(match[1])
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
