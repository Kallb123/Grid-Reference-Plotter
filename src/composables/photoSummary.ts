/**
 * What a frame says about itself, as labelled lines of text.
 *
 * This is presentation, not arithmetic — every number it shows has already been worked out in
 * `src/domain/`. It is a plain function rather than a component because the map popups are built
 * as DOM nodes by Leaflet, and a summary that is data rather than markup can be rendered into
 * either a popup or a Vue template, and tested without a browser.
 *
 * The caveats in `notes` are carried through verbatim. They are the difference between an
 * indicative extent and a claim about where a photograph's edges are, and the UI is not allowed
 * to quietly drop them (ARCHITECTURE.md §8.4).
 */

import { siteGeometry } from '../domain/coverage'
import { detailThresholdText } from '../domain/detail'
import { formatGridRef, gridToWgs84 } from '../domain/osgb'
import { metresToFeet, squareMetresToSquareMiles } from '../domain/units'
import type { CoverageVerdict, FrameCoverage, SiteProximity } from '../domain/coverage'
import type { FilterCriterion, FrameFilter } from '../domain/filter'
import type {
  AreaOfInterest,
  Footprint,
  GridPoint,
  LngLat,
  PlottedPoint,
  Provenance,
} from '../domain/types'

export interface SummaryLine {
  label: string
  value: string
}

/**
 * Two groups, because they answer different questions and are shown in different places.
 * `lines` is *where and how big* — what a map popup is for. `provenance` is *how to order it* —
 * catalogue columns that belong beside the map, not on top of it.
 */
export interface PhotoSummary {
  /** The frame's identifier, e.g. `"MAL/67055 frame 23"`. */
  title: string
  /** What kind of thing this is, in words a customer would use. */
  subtitle: string
  /** The derived geometry: position, extent, and the inputs it came from. */
  lines: SummaryLine[]
  /** The columns a customer quotes when placing an order (INPUT-FORMAT.md §7.5). */
  provenance: SummaryLine[]
  /** Caveats from the domain layer, shown as-is. */
  notes: string[]
}

/**
 * A vertical frame: its ground extent and the numbers it was derived from.
 *
 * Coverage, where a site has been marked, is put at the top rather than the bottom. Once there is
 * an area of interest it is the first thing anyone wants from a frame, and the extent and the
 * scale are how you choose between the frames that have it.
 */
export function footprintSummary(
  footprint: Footprint,
  coverage: FrameCoverage | null = null,
): PhotoSummary {
  const { record, groundWidthM, groundHeightM, flyingHeightM, centre, uncertaintyM } = footprint
  const { provenance, ref, film, scaleDenominator } = record

  const lines: SummaryLine[] = [
    ...coverageLines(coverage),
    { label: 'Centre point', value: `${ref.text} (±${formatNumber(uncertaintyM)} m)` },
    { label: 'Position', value: formatPosition(centre) },
    {
      label: 'Ground extent',
      value:
        `${formatNumber(groundWidthM)} × ${formatNumber(groundHeightM)} m ` +
        `(${formatArea(groundWidthM * groundHeightM)})`,
    },
    { label: 'Scale', value: `1:${formatNumber(scaleDenominator)} (nominal)` },
    { label: 'Film', value: film.description },
  ]

  if (flyingHeightM !== undefined) {
    lines.push({
      label: 'Flying height',
      value: `${formatNumber(flyingHeightM)} m above ground (${formatNumber(metresToFeet(flyingHeightM))} ft)`,
    })
  }

  return {
    title: record.id,
    subtitle: `Vertical frame${provenance.date === undefined ? '' : `, ${provenance.date}`}`,
    lines,
    provenance: provenanceLines(provenance),
    notes: [...footprint.notes, ...(coverage?.notes ?? [])],
  }
}

/** An oblique: a point, and an explicit statement of why there is no shape around it. */
export function pointSummary(
  point: PlottedPoint,
  proximity: SiteProximity | null = null,
): PhotoSummary {
  const { record, position, uncertaintyM } = point
  const { provenance, ref, filmType } = record

  const lines: SummaryLine[] = [
    { label: 'Map reference', value: `${ref.text} (±${formatNumber(uncertaintyM)} m)` },
    { label: 'Position', value: formatPosition(position) },
  ]

  if (proximity !== null) {
    lines.unshift({
      label: 'Your site',
      value:
        proximity.distanceM === 0
          ? 'inside your site — but see the note below'
          : `${formatNumber(proximity.distanceM)} m away — but see the note below`,
    })
  }

  if (filmType !== undefined) lines.push({ label: 'Film', value: filmType })

  return {
    title: record.id,
    subtitle: `Oblique photograph${provenance.date === undefined ? '' : `, ${provenance.date}`}`,
    lines,
    provenance: provenanceLines(provenance),
    notes: [...point.notes, ...(proximity?.notes ?? [])],
  }
}

/**
 * What the frame does about the site, in words.
 *
 * Two lines rather than one, because they are two different questions and a frame can answer
 * them differently: whether the site is in the picture, and whether it is in the picture
 * *comfortably*. The archive's guide warns that a site "may be on the edge of" a photograph, and
 * a summary that said only "covered" would be exactly the reassurance it is warning against.
 */
function coverageLines(coverage: FrameCoverage | null): SummaryLine[] {
  if (coverage === null) return []

  const percent = `${Math.round(coverage.coveredFraction * 100)}%`
  const covered =
    coverage.verdict === 'full'
      ? 'all of it is inside this frame'
      : coverage.verdict === 'none'
        ? 'none of it is inside this frame'
        : `${percent} of it is inside this frame`

  const metres = formatNumber(Math.abs(coverage.edgeClearanceM))
  const margin =
    coverage.edgeClearanceM > 0
      ? `${metres} m inside the nearest edge`
      : coverage.edgeClearanceM < 0
        ? `${metres} m outside the nearest edge`
        : 'straddling an edge of the frame'

  return [
    { label: 'Your site', value: covered },
    { label: 'Edge margin', value: margin },
    { label: 'Off centre', value: `${formatNumber(coverage.offCentreM)} m from the frame’s centre` },
  ]
}

/** What the user marked, described back to them so they can check it is where they meant. */
export interface AreaSummary {
  /** `"Dropped pin"` or `"Drawn outline"`. */
  title: string
  lines: SummaryLine[]
}

/**
 * The area of interest, in the terms the rest of the app is in.
 *
 * The grid reference is quoted to eight figures — a 10 m square — because unlike the catalogue's
 * six-figure centre points this is a position the user chose, and rounding it to 100 m would
 * throw away precision they actually have. It is also the number they would give a supplier when
 * asking what else covers the site, which is worth being able to copy off the screen.
 */
export function areaOfInterestSummary(area: AreaOfInterest): AreaSummary {
  const site = siteGeometry(area)
  const centre = gridToWgs84(site.centre)
  const gridReference = tryFormatGridRef(site.centre)

  const lines: SummaryLine[] = []
  if (gridReference !== null) lines.push({ label: 'Grid reference', value: gridReference })
  lines.push({ label: 'Position', value: formatPosition(centre) })

  if (area.kind === 'polygon') {
    lines.push(
      { label: 'Corners', value: String(area.ring.length) },
      { label: 'Area', value: formatSiteArea(site.areaM2) },
    )
  }

  return { title: area.kind === 'point' ? 'Dropped pin' : 'Drawn outline', lines }
}

/**
 * The headline the panel leads with: how the listing divides up against the site.
 *
 * Written as a sentence rather than three counts because the counts on their own invite the
 * reader to add them up and wonder why they do not equal the number of frames — obliques are in
 * the listing and cannot be in this tally, having no extent to measure. The sentence says which
 * population it is talking about.
 */
export function describeTally(tally: Record<CoverageVerdict, number>): string {
  const measured = tally.full + tally.partial + tally.none
  if (measured === 0) return 'No frame in this listing has an extent to compare with your site.'

  const parts = [`${tally.full} of ${measured} vertical frames cover all of your site`]
  if (tally.partial > 0) parts.push(`${tally.partial} cover part of it`)
  if (tally.none > 0) parts.push(`${tally.none} miss it`)

  return `${parts.join(', ')}.`
}

/**
 * What the listing filter is currently asking for, one phrase per criterion.
 *
 * Written out rather than left as a set of controls to re-read, because the filter is the reason
 * frames are missing from the map and the table. Somebody who set it three minutes ago and has
 * been panning ever since needs to be able to see, in a line, why they are looking at four
 * frames out of fifty.
 */
export function describeFilter(filter: FrameFilter): string[] {
  const parts: string[] = []

  if (filter.minDetail > 0) parts.push(detailThresholdText(filter.minDetail))
  const years = describeYearRange(filter.fromYear, filter.toYear)
  if (years !== null) parts.push(years)
  if (filter.coverage === 'partial') parts.push('reaching your site')
  if (filter.coverage === 'full') parts.push('covering all of your site')
  if (filter.printHeldOnly) parts.push('print held')

  return parts
}

function describeYearRange(from: number | null, to: number | null): string | null {
  if (from === null && to === null) return null
  if (from !== null && to !== null) return from === to ? String(from) : `${from} to ${to}`
  if (from !== null) return `${from} onwards`
  return `up to ${String(to)}`
}

/**
 * Why some frames are on screen without having been tested, in one sentence.
 *
 * A criterion a frame carries nothing to answer never rejects it (`domain/filter`), which is the
 * right call — no evidence is not evidence — but it leaves a narrowed listing containing frames
 * that did not pass. Saying so is the difference between a filter the user can trust and one
 * that quietly overstates what it did.
 */
export function describeUnjudged(criteria: readonly FilterCriterion[], count: number): string | null {
  if (criteria.length === 0 || count === 0) return null

  const reasons = criteria.map((criterion) => UNJUDGED_REASONS[criterion])
  return (
    `${count} frame${count === 1 ? ' is' : 's are'} shown without being tested: ` +
    `${joinPhrases(reasons)}.`
  )
}

const UNJUDGED_REASONS: Record<FilterCriterion, string> = {
  detail: 'an oblique carries no scale to judge detail by',
  date: 'some rows give no date',
  coverage: 'an oblique has no extent to compare with your site',
  print: 'some rows carry a “held” code this app does not recognise',
}

/** `["a", "b", "c"]` → `"a, b and c"`. */
function joinPhrases(phrases: readonly string[]): string {
  if (phrases.length <= 1) return phrases.join('')
  return `${phrases.slice(0, -1).join(', ')} and ${String(phrases[phrases.length - 1])}`
}

/**
 * A grid reference for the position, or `null` if it is not on the National Grid.
 *
 * Rounded to the nearest metre first. A grid reference names the square a position falls in, so
 * the digits are a truncation — and this position has been through the datum transform and back,
 * which leaves a couple of millimetres of error. Without the rounding a pin dropped exactly on a
 * 10 m boundary reads as the square below it, for a discrepancy four orders of magnitude smaller
 * than the square being named.
 */
function tryFormatGridRef(point: GridPoint): string | null {
  const whole: GridPoint = {
    easting: Math.round(point.easting),
    northing: Math.round(point.northing),
  }
  try {
    return formatGridRef(whole, 8)
  } catch {
    return null
  }
}

/**
 * A site's area in units a site is measured in.
 *
 * Hectares below a square kilometre: a field, a scheduled monument or a development site is
 * hectares, and `formatArea`'s square kilometres and square miles — right for a photograph
 * covering five of them — would render a two-hectare site as `0.02 km²`.
 */
export function formatSiteArea(squareMetres: number): string {
  if (squareMetres < 1_000_000) return `${formatDecimal(squareMetres / 10_000)} ha`
  return formatArea(squareMetres)
}

/**
 * Empty fields are left out rather than shown blank: a listing that carries no `Run` should not
 * grow a row saying so.
 */
function provenanceLines(provenance: Partial<Provenance>): SummaryLine[] {
  const candidates: [string, string | undefined][] = [
    ['Photo reference', provenance.photoReference],
    ['Sortie', provenance.sortieNumber],
    ['Library number', provenance.libraryNumber],
    ['Original number', provenance.originalNumber],
    ['Frame', provenance.frameNumber],
    ['Run', provenance.run],
    ['Date', provenance.date],
    ['Sortie quality', provenance.sortieQuality],
    ['Held', describeHeld(provenance.held)],
    ['Film held by', provenance.filmHeldBy],
  ]

  return candidates
    .filter((entry): entry is [string, string] => entry[1] !== undefined && entry[1] !== '')
    .map(([label, value]) => ({ label, value }))
}

/** `"P"` and `"N"` are the archive's codes for whether a print exists. Spell them out. */
function describeHeld(held: string | undefined): string | undefined {
  if (held === undefined) return undefined
  if (held.toUpperCase() === 'P') return 'P — print held'
  if (held.toUpperCase() === 'N') return 'N — no print held'
  return held
}

/** `[-1.368131, 53.359754]` → `"53.35975° N, 1.36813° W"`. Five decimals is about a metre. */
export function formatPosition([lng, lat]: LngLat): string {
  const latitude = `${Math.abs(lat).toFixed(5)}° ${lat < 0 ? 'S' : 'N'}`
  const longitude = `${Math.abs(lng).toFixed(5)}° ${lng < 0 ? 'W' : 'E'}`
  return `${latitude}, ${longitude}`
}

/**
 * A ground area in the units the supplier's own guide uses.
 *
 * Square miles because that is what the archive quotes — *"c. 2 sq miles"* for 1:10 000
 * (INPUT-FORMAT.md §4) — and square kilometres alongside because most people cannot picture
 * a square mile.
 */
export function formatArea(squareMetres: number): string {
  const squareMiles = squareMetresToSquareMiles(squareMetres)
  return `${formatSquareKm(squareMetres)}, ${formatDecimal(squareMiles)} sq miles`
}

/** The metric half of `formatArea` alone, for a table column too narrow to carry both units. */
export function formatSquareKm(squareMetres: number): string {
  return `${formatDecimal(squareMetres / 1_000_000)} km²`
}

/** Metres and other counts, to the nearest whole unit with thousands separators. */
export function formatNumber(value: number): string {
  return Math.round(value).toLocaleString('en-GB')
}

/** Small quantities where rounding to a whole number would show `0`. */
function formatDecimal(value: number): string {
  const digits = value < 1 ? 2 : 1
  return value.toLocaleString('en-GB', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}
