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

import { metresToFeet, squareMetresToSquareMiles } from '../domain/units'
import type { Footprint, LngLat, PlottedPoint, Provenance } from '../domain/types'

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

/** A vertical frame: its ground extent and the numbers it was derived from. */
export function footprintSummary(footprint: Footprint): PhotoSummary {
  const { record, groundWidthM, groundHeightM, flyingHeightM, centre, uncertaintyM } = footprint
  const { provenance, ref, film, scaleDenominator } = record

  const lines: SummaryLine[] = [
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
    notes: footprint.notes,
  }
}

/** An oblique: a point, and an explicit statement of why there is no shape around it. */
export function pointSummary(point: PlottedPoint): PhotoSummary {
  const { record, position, uncertaintyM } = point
  const { provenance, ref, filmType } = record

  const lines: SummaryLine[] = [
    { label: 'Map reference', value: `${ref.text} (±${formatNumber(uncertaintyM)} m)` },
    { label: 'Position', value: formatPosition(position) },
  ]

  if (filmType !== undefined) lines.push({ label: 'Film', value: filmType })

  return {
    title: record.id,
    subtitle: `Oblique photograph${provenance.date === undefined ? '' : `, ${provenance.date}`}`,
    lines,
    provenance: provenanceLines(provenance),
    notes: point.notes,
  }
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
  const squareKm = squareMetres / 1_000_000
  const squareMiles = squareMetresToSquareMiles(squareMetres)
  return `${formatDecimal(squareKm)} km², ${formatDecimal(squareMiles)} sq miles`
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
