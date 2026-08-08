/**
 * Ordnance Survey National Grid: reference parsing, and the conversion to WGS84 that web maps
 * need. See archive/MATHS.md §1–§3 and §6.
 *
 * Two things here are load-bearing:
 *
 * 1. A grid reference is a *square*. We return its centre and carry the square's size, so the
 *    UI can be honest about a six-figure reference being a ±50 m statement.
 * 2. Grid references are OSGB36; map tiles are WGS84. The two disagree by 70–120 m across
 *    Great Britain. `gridToWgs84` applies the Helmert transform; `gridToOsgb36` exists so the
 *    difference can be asserted in a test, not so it can be plotted.
 */

import OsGridRef, { LatLon } from 'geodesy/osgridref.js'
import type { GridPoint, GridRef, LngLat } from './types'

/** Longitude of the National Grid's true origin, 2°W. */
const CENTRAL_MERIDIAN_DEG = -2

/** The letter sequence used by the National Grid. `I` is skipped in both positions. */
const GRID_LETTERS = 'ABCDEFGHJKLMNOPQRSTUVWXYZ'

/** Thrown when a string is not a usable National Grid reference. The message is user-facing. */
export class InvalidGridRefError extends Error {
  constructor(text: string, reason: string) {
    super(`"${text}" is not a valid grid reference: ${reason}`)
    this.name = 'InvalidGridRefError'
  }
}

/**
 * Parse an OS National Grid reference into the centre of the square it denotes.
 *
 * Accepts 0 to 10 digits (`SK` through `SK 34567 89012`), upper or lower case, with the
 * easting and northing separated by whitespace or run together. Throws
 * `InvalidGridRefError` with a readable reason for anything else — code parsing a file should
 * catch it and record a `ParseIssue` rather than abandon the row's neighbours.
 */
export function parseGridRef(text: string): GridRef {
  const original = String(text)
  const trimmed = original.trim()

  if (trimmed === '') throw new InvalidGridRefError(original, 'it is empty')

  const match = /^([A-Za-z])\s*([A-Za-z])\s*([\d\s]*)$/.exec(trimmed)
  if (!match) {
    throw new InvalidGridRefError(
      original,
      'expected two letters followed by an even number of digits',
    )
  }

  const [, rawLetter1 = '', rawLetter2 = '', digitPart = ''] = match
  const letters = `${rawLetter1}${rawLetter2}`.toUpperCase()

  const l1 = GRID_LETTERS.indexOf(letters.charAt(0))
  const l2 = GRID_LETTERS.indexOf(letters.charAt(1))
  if (l1 === -1 || l2 === -1) {
    throw new InvalidGridRefError(original, 'the letter I is not used in grid squares')
  }

  // Letter pair → 100 km square, counted from the false origin at the SW corner of SV.
  const e100km = ((l1 - 2) % 5) * 5 + (l2 % 5)
  const n100km = 19 - Math.floor(l1 / 5) * 5 - Math.floor(l2 / 5)
  if (e100km < 0 || e100km > 6 || n100km < 0 || n100km > 12) {
    throw new InvalidGridRefError(original, `${letters} is not a National Grid square`)
  }

  const { easting: eDigits, northing: nDigits } = splitDigits(original, digitPart)
  const figures = eDigits.length + nDigits.length
  const precisionM = 100_000 / 10 ** (figures / 2)

  // The digits address the square's SW corner; step to its centre.
  const easting = e100km * 100_000 + padDigits(eDigits) + precisionM / 2
  const northing = n100km * 100_000 + padDigits(nDigits) + precisionM / 2

  return { text: trimmed, easting, northing, precisionM }
}

/**
 * Format an easting/northing back to a standard grid reference.
 *
 * `digits` is the total figure count, so 6 gives `"SK 421 849"`. Truncates towards the SW
 * corner of the square, which is what a grid reference names.
 */
export function formatGridRef(point: GridPoint, digits = 6): string {
  const { easting, northing } = point

  if (digits % 2 !== 0 || digits < 0 || digits > 10) {
    throw new RangeError(`grid reference digits must be even and between 0 and 10, got ${digits}`)
  }

  const e100km = Math.floor(easting / 100_000)
  const n100km = Math.floor(northing / 100_000)
  if (e100km < 0 || e100km > 6 || n100km < 0 || n100km > 12) {
    throw new RangeError(`(${easting}, ${northing}) is outside the National Grid`)
  }

  // Inverse of the letter-pair mapping in parseGridRef. GRID_LETTERS already omits `I`, so
  // indexing it needs no further correction.
  const l1 = 19 - n100km - ((19 - n100km) % 5) + Math.floor((e100km + 10) / 5)
  const l2 = ((19 - n100km) * 5) % 25 + (e100km % 5)
  const letters = `${GRID_LETTERS.charAt(l1)}${GRID_LETTERS.charAt(l2)}`

  if (digits === 0) return letters

  const half = digits / 2
  const e = Math.floor((easting % 100_000) / 10 ** (5 - half))
  const n = Math.floor((northing % 100_000) / 10 ** (5 - half))

  return `${letters} ${String(e).padStart(half, '0')} ${String(n).padStart(half, '0')}`
}

/**
 * National Grid easting/northing → WGS84, the datum web map tiles use.
 *
 * This applies the OSGB36 → WGS84 Helmert transform. Omitting it — which the retired
 * implementation did — puts every plotted position 70–120 m out of place.
 */
export function gridToWgs84(point: GridPoint): LngLat {
  const latLon = new OsGridRef(point.easting, point.northing).toLatLon()
  return [latLon.lon, latLon.lat]
}

/**
 * WGS84 → National Grid easting/northing: the inverse of `gridToWgs84`.
 *
 * This is the way in for anything the *user* puts on the map rather than the catalogue — an area
 * of interest is dropped in WGS84, and every comparison against a frame has to happen in grid
 * metres, where the National Grid is the plane it is (ARCHITECTURE.md §2.3).
 *
 * **Throws `RangeError` for a position off the National Grid.** The projection is defined for
 * Great Britain and nowhere else, and there is no meaningful easting for a click in France.
 * Callers taking positions from a map have to expect this — nothing stops a user panning.
 */
export function wgs84ToGrid([lng, lat]: LngLat): GridPoint {
  try {
    const gridRef = new LatLon(lat, lng).toOsGrid()
    return { easting: gridRef.easting, northing: gridRef.northing }
  } catch {
    // geodesy's own message quotes the out-of-range easting, which is not a useful thing to
    // show someone who clicked on a map.
    throw new RangeError(
      `${Math.abs(lat).toFixed(4)}° ${lat < 0 ? 'S' : 'N'}, ` +
        `${Math.abs(lng).toFixed(4)}° ${lng < 0 ? 'W' : 'E'} is outside the National Grid`,
    )
  }
}

/**
 * National Grid easting/northing → OSGB36 latitude/longitude.
 *
 * This is the *historic* datum the grid is defined on. It exists to be compared against
 * `gridToWgs84`, not to be plotted: handing this to a web map is the bug the rebuild exists
 * to fix.
 */
export function gridToOsgb36(point: GridPoint): LngLat {
  const latLon = new OsGridRef(point.easting, point.northing).toLatLon(LatLon.datums.OSGB36)
  return [latLon.lon, latLon.lat]
}

/**
 * Grid convergence: the angle from grid north round to true north at a point, in degrees,
 * positive east of the central meridian. First-order approximation `γ ≈ (λ − λ₀)·sin φ`
 * (archive/MATHS.md §6).
 *
 * Nothing in today's data supplies a heading, so this is dormant. It matters the day a source
 * does: a true bearing needs convergence subtracted to become the grid bearing the footprint
 * geometry works in. At ~1.6° it moves each corner of a 4.5 km frame by about 90 m.
 */
export function gridConvergenceDeg(point: GridPoint): number {
  const [lon, lat] = gridToOsgb36(point)
  return (lon - CENTRAL_MERIDIAN_DEG) * Math.sin((lat * Math.PI) / 180)
}

/** Convert a heading measured from true north into one measured from grid north. */
export function trueBearingToGridBearing(bearingDeg: number, point: GridPoint): number {
  return normaliseDegrees(bearingDeg - gridConvergenceDeg(point))
}

/** Wrap an angle into [0, 360). */
export function normaliseDegrees(degrees: number): number {
  return ((degrees % 360) + 360) % 360
}

/** Split the digit run into equal easting and northing halves. */
function splitDigits(original: string, digitPart: string): { easting: string; northing: string } {
  const groups = digitPart
    .trim()
    .split(/\s+/)
    .filter((group) => group !== '')

  if (groups.length === 0) return { easting: '', northing: '' }

  if (groups.length === 1) {
    const [run = ''] = groups
    if (run.length % 2 !== 0) {
      throw new InvalidGridRefError(original, `${run.length} digits is an odd number`)
    }
    if (run.length > 10) {
      throw new InvalidGridRefError(original, `${run.length} digits is finer than 1 m`)
    }
    return { easting: run.slice(0, run.length / 2), northing: run.slice(run.length / 2) }
  }

  if (groups.length > 2) {
    throw new InvalidGridRefError(
      original,
      `expected one or two groups of digits, got ${groups.length}`,
    )
  }

  const [easting = '', northing = ''] = groups
  if (easting.length !== northing.length) {
    throw new InvalidGridRefError(
      original,
      `the easting has ${easting.length} digits and the northing ${northing.length}`,
    )
  }
  if (easting.length > 5) {
    throw new InvalidGridRefError(original, `${easting.length * 2} digits is finer than 1 m`)
  }

  return { easting, northing }
}

/** `"421"` → 42100: the digits are the leading figures of a five-digit metre value. */
function padDigits(digits: string): number {
  return digits === '' ? 0 : Number(digits.padEnd(5, '0'))
}
