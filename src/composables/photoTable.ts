/**
 * The plotted frames as table rows: one row per frame, sortable by any column.
 *
 * This is the comparison half of the tool. The map answers *where*, and answers it for thirty
 * frames at once; the table answers *which one do I buy* — the frame with the finest scale, the
 * smallest extent over the site, the right decade, a print already held.
 *
 * Like `photoSummary` this is presentation rather than arithmetic: every number has already been
 * worked out in `src/domain/`, and every one arrives here as text plus something comparable to
 * sort it by. It is a plain module rather than a component so the ordering can be tested without
 * a browser.
 */

import { formatNumber, formatSquareKm } from './photoSummary'
import type { FrameCoverage, SiteCoverage } from '../domain/coverage'
import type { Footprint, PlottedPoint } from '../domain/types'

/** Shown where a value is not derivable — an oblique's scale, a listing with no date. */
const ABSENT = '—'

export type PhotoColumnKey =
  | 'frame'
  | 'kind'
  | 'covered'
  | 'margin'
  | 'date'
  | 'centre'
  | 'scale'
  | 'extent'
  | 'area'
  | 'held'

export interface PhotoColumn {
  key: PhotoColumnKey
  label: string
  /** Right-aligned and tabular; these are quantities being compared down the column. */
  numeric?: boolean
  /** Header tooltip, for a column whose values are catalogue codes or need a caveat. */
  description?: string
  /**
   * Shown only once an area of interest has been marked. There is nothing to put in these
   * columns before that, and an empty column invites the reader to wonder what they did wrong.
   */
  site?: boolean
  /**
   * Sort descending on the first click rather than ascending.
   *
   * For most columns ascending is the interesting end — the earliest date, the finest scale. For
   * the two coverage columns it is the other way round: the frame that covers the most of the
   * site, with the most room to spare, is the answer to the question the column exists to ask.
   */
  descendingFirst?: boolean
}

/**
 * The columns, in the order a customer reads them: what the frame is, what it does about their
 * site, when it was flown, and how much ground it covers. The ordering columns (library number,
 * run, film held by) stay in the detail panel — they are what you quote once you have chosen,
 * not what you choose by.
 *
 * The two site columns sit right after the frame's identity because, once a site has been
 * marked, they are the answer: everything to the right of them is how you choose between the
 * frames that cover it.
 */
export const PHOTO_COLUMNS: readonly PhotoColumn[] = [
  { key: 'frame', label: 'Frame' },
  { key: 'kind', label: 'Type' },
  {
    key: 'covered',
    label: 'Site covered',
    numeric: true,
    site: true,
    descendingFirst: true,
    description: 'How much of your site falls inside the frame’s indicative extent',
  },
  {
    key: 'margin',
    label: 'Edge margin',
    numeric: true,
    site: true,
    descendingFirst: true,
    description:
      'How far your site sits from the frame’s nearest edge — “in” is room to spare, ' +
      '“out” is the size of the miss',
  },
  { key: 'date', label: 'Date' },
  { key: 'centre', label: 'Centre point', description: 'Six-figure grid reference, so ±50 m' },
  { key: 'scale', label: 'Scale', numeric: true, description: 'The survey’s nominal target scale' },
  {
    key: 'extent',
    label: 'Ground extent',
    numeric: true,
    description: 'Indicative extent from the nominal scale, not a surveyed boundary',
  },
  { key: 'area', label: 'Area', numeric: true },
  { key: 'held', label: 'Held', description: 'P = print held; N = no print held' },
]

/** The columns to show: the site's two only once there is a site to measure against. */
export function photoColumns(hasArea: boolean): readonly PhotoColumn[] {
  return hasArea ? PHOTO_COLUMNS : PHOTO_COLUMNS.filter((column) => column.site !== true)
}

export interface PhotoCell {
  /** What the cell shows. Never empty — an absent value shows an em dash. */
  text: string
  /**
   * What the column sorts by. `null` where there is no value, and it sorts last whichever way
   * the column is pointing: a frame with no scale is not the finest-scale frame in the listing.
   */
  sort: number | string | null
  /** Tooltip for the cell, e.g. why an oblique has no extent. */
  note?: string
}

export interface PhotoRow {
  /** The record id, matching `selectedId` in `usePhotoSet` and the map's layers. */
  id: string
  kind: 'vertical' | 'oblique'
  cells: Record<PhotoColumnKey, PhotoCell>
}

export type SortDirection = 'ascending' | 'descending'

/**
 * Every plotted frame as a row, verticals first, each half in the order the listing supplied.
 *
 * Obliques share the table with verticals rather than sitting in one of their own: they are
 * candidates for the same purchase, and hiding them behind a tab would make it easy to miss that
 * the reason they have no extent is a property of the photograph, not of this app.
 */
export function buildRows(
  footprints: readonly Footprint[],
  points: readonly PlottedPoint[],
  coverage: SiteCoverage | null = null,
): PhotoRow[] {
  return [
    ...footprints.map((footprint) => footprintRow(footprint, coverage)),
    ...points.map((point) => pointRow(point, coverage)),
  ]
}

function footprintRow(footprint: Footprint, coverage: SiteCoverage | null): PhotoRow {
  const { record, groundWidthM, groundHeightM } = footprint
  const areaM2 = groundWidthM * groundHeightM

  return {
    id: record.id,
    kind: 'vertical',
    cells: {
      frame: { text: record.id, sort: record.id },
      kind: { text: 'Vertical', sort: 'Vertical' },
      ...siteCells(coverage?.frames.get(record.id) ?? null),
      ...dateCell(record.provenance.date),
      centre: { text: record.ref.text, sort: record.ref.text },
      // Sorted by the denominator, so 1:2500 — the finer scale, the bigger picture of less
      // ground — leads an ascending sort, which is the order a customer wants to read it in.
      scale: { text: `1:${formatNumber(record.scaleDenominator)}`, sort: record.scaleDenominator },
      extent: {
        text: `${formatNumber(groundWidthM)} × ${formatNumber(groundHeightM)} m`,
        sort: groundWidthM,
      },
      area: { text: formatSquareKm(areaM2), sort: areaM2 },
      ...heldCell(record.provenance.held),
    },
  }
}

function pointRow(point: PlottedPoint, coverage: SiteCoverage | null): PhotoRow {
  const { record } = point
  // Obliques carry no scale, focal length, height or bearing, so there is nothing to put in
  // these columns and nothing defensible to invent for them (INPUT-FORMAT.md §6).
  const noExtent = 'An oblique carries no scale, height or bearing, so no extent is derivable.'

  // Which follows through to the site columns: with no extent there is nothing to intersect a
  // site with. How far away the archive's reference for it lies is real and is worth knowing,
  // but it is a distance and not coverage, so it is shown in the detail panel — where there is
  // room to say which it is — rather than under a heading that would make it read as the other.
  const proximity = coverage?.obliques.get(record.id) ?? null
  const noCoverage =
    proximity === null
      ? noExtent
      : `${noExtent} Its map reference is ${formatNumber(proximity.distanceM)} m from your site; ` +
        'choose the row to see what that does and does not mean.'

  return {
    id: record.id,
    kind: 'oblique',
    cells: {
      frame: { text: record.id, sort: record.id },
      kind: { text: 'Oblique', sort: 'Oblique' },
      covered: { text: ABSENT, sort: null, note: noCoverage },
      margin: { text: ABSENT, sort: null, note: noCoverage },
      ...dateCell(record.provenance.date),
      centre: { text: record.ref.text, sort: record.ref.text },
      scale: { text: ABSENT, sort: null, note: noExtent },
      extent: { text: ABSENT, sort: null, note: noExtent },
      area: { text: ABSENT, sort: null, note: noExtent },
      ...heldCell(record.provenance.held),
    },
  }
}

/**
 * What a frame does about the site, as two comparable columns.
 *
 * `covered` is how much of the site is in the picture at all; `margin` is how comfortably. They
 * are separate because they disagree in the case that matters: two frames can both contain the
 * whole site while one holds it in the middle and the other clips it at the edge, and the
 * archive's guide warns that the second is the common one.
 *
 * Both sort on the underlying metres or fraction, and both sort `null` — never measured — last,
 * so no ordering can promote a frame that was never compared with the site.
 */
function siteCells(coverage: FrameCoverage | null): { covered: PhotoCell; margin: PhotoCell } {
  if (coverage === null) {
    return { covered: { text: ABSENT, sort: null }, margin: { text: ABSENT, sort: null } }
  }

  const note = coverage.notes.join(' ')

  const covered: PhotoCell = {
    text:
      coverage.verdict === 'full'
        ? 'All'
        : coverage.verdict === 'none'
          ? 'None'
          : `${Math.round(coverage.coveredFraction * 100)}%`,
    sort: coverage.coveredFraction,
    note,
  }

  const metres = formatNumber(Math.abs(coverage.edgeClearanceM))
  const margin: PhotoCell = {
    text:
      coverage.edgeClearanceM > 0
        ? `${metres} m in`
        : coverage.edgeClearanceM < 0
          ? `${metres} m out`
          : 'on the edge',
    sort: coverage.edgeClearanceM,
    note,
  }

  return { covered, margin }
}

/**
 * The date as supplied, sorted chronologically.
 *
 * The catalogue stores `13 JUN 1967` as text (INPUT-FORMAT.md §5), so sorting the string would
 * order the listing by day of the month. The text is still what is shown — it is what the
 * supplier will quote back — but the sort runs on the parsed date.
 */
function dateCell(date: string | undefined): { date: PhotoCell } {
  if (date === undefined || date.trim() === '') return { date: { text: ABSENT, sort: null } }
  return { date: { text: date, sort: parseCatalogueDate(date) } }
}

/** `Held` is a catalogue code; the detail panel spells it out, the column stays narrow. */
function heldCell(held: string | undefined): { held: PhotoCell } {
  if (held === undefined || held.trim() === '') return { held: { text: ABSENT, sort: null } }
  return { held: { text: held, sort: held } }
}

/**
 * `"13 JUN 1967"` → a UTC timestamp, or `null` if it is not a date in that form.
 *
 * Deliberately narrow: this parses the `dd MMM yyyy` the archive documents and nothing else,
 * rather than handing an arbitrary string to `Date` and getting a plausible wrong answer out of
 * whatever the host happens to accept. An unrecognised date still displays as supplied; it just
 * sorts last.
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

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

/**
 * Order rows by one column, leaving the listing's own order when no column is chosen.
 *
 * Two properties matter here. Rows with nothing in the column sort last in both directions, so
 * reversing an ascending sort never promotes a row that has no value to the top. And the sort is
 * stable, so frames that tie on the column stay in the order the supplier listed them — which is
 * sortie and frame order, and is what makes a re-sort readable rather than shuffled.
 */
export function sortRows(
  rows: readonly PhotoRow[],
  key: PhotoColumnKey | null,
  direction: SortDirection = 'ascending',
): PhotoRow[] {
  if (key === null) return [...rows]

  const sign = direction === 'descending' ? -1 : 1
  return [...rows].sort((left, right) => {
    const a = left.cells[key].sort
    const b = right.cells[key].sort
    if (a === null) return b === null ? 0 : 1
    if (b === null) return -1
    return sign * compare(a, b)
  })
}

/**
 * Numbers numerically, text naturally: `frame 9` before `frame 23`, and `SK 421 849` before
 * `SK 430 855`. A plain string comparison would put `frame 160` before `frame 23`.
 */
function compare(a: number | string, b: number | string): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b), 'en-GB', { numeric: true, sensitivity: 'base' })
}
