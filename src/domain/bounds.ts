/**
 * Bounding boxes over what has been plotted, so the map can frame a whole result set.
 *
 * Pure arithmetic on WGS84 degrees, kept out of the map composable for the usual reason: it is
 * the sort of thing that is wrong by a factor of two and still looks plausible on screen.
 *
 * Two deliberate simplifications, both safe for a Great Britain tool and both wrong elsewhere:
 * the box is a plain min/max in degrees, so it does not wrap the antimeridian, and the
 * metre-to-degree padding uses a spherical earth. Padding a *view* by a few percent is the only
 * thing that approximation is used for — the footprint geometry itself is exact plane arithmetic
 * in National Grid metres, done in `footprint.ts`.
 */

import type { Footprint, LngLat, PlottedPoint } from './types'

/** A WGS84 bounding box in degrees. `west`/`east` are longitudes, `south`/`north` latitudes. */
export interface LngLatBounds {
  west: number
  south: number
  east: number
  north: number
}

/** Metres per degree of latitude on a sphere of the earth's mean radius. */
const M_PER_DEGREE_LATITUDE = 111_320

/**
 * The smallest box containing every position, or `null` for none.
 *
 * A single position gives a zero-sized box. That is the honest answer — callers that are about
 * to hand it to a map should pad it, or they will zoom to the tile server's limit on one frame.
 */
export function boundsOfPositions(positions: Iterable<LngLat>): LngLatBounds | null {
  let west = Infinity
  let south = Infinity
  let east = -Infinity
  let north = -Infinity

  for (const [lng, lat] of positions) {
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue
    if (lng < west) west = lng
    if (lng > east) east = lng
    if (lat < south) south = lat
    if (lat > north) north = lat
  }

  if (west === Infinity) return null
  return { west, south, east, north }
}

/**
 * Grow a box by a distance on the ground, clamped to the limits of the coordinate system.
 *
 * The longitude padding is computed at whichever edge is furthest from the equator, so the box
 * grows by *at least* the requested distance on both sides rather than exactly it on one.
 */
export function padBoundsM(bounds: LngLatBounds, metres: number): LngLatBounds {
  if (!Number.isFinite(metres) || metres <= 0) return bounds

  const latitudePad = metres / M_PER_DEGREE_LATITUDE
  const worstLatitude = Math.max(Math.abs(bounds.south), Math.abs(bounds.north))
  const cosLatitude = Math.cos((worstLatitude * Math.PI) / 180)
  // Guard the poles, where a metre of easting is an unbounded number of degrees.
  const longitudePad = cosLatitude < 1e-6 ? 180 : latitudePad / cosLatitude

  return {
    west: Math.max(-180, bounds.west - longitudePad),
    south: Math.max(-90, bounds.south - latitudePad),
    east: Math.min(180, bounds.east + longitudePad),
    north: Math.min(90, bounds.north + latitudePad),
  }
}

/**
 * The box containing every footprint and every plotted point, or `null` when nothing is plotted.
 *
 * Points are padded by their grid square's uncertainty: an oblique is a ±50 m statement about
 * where the camera was, not a pinpoint, and a set consisting of one oblique should frame as a
 * 100 m square rather than a dimensionless dot.
 */
export function plotBounds(
  footprints: readonly Footprint[],
  points: readonly PlottedPoint[] = [],
): LngLatBounds | null {
  const positions: LngLat[] = []
  for (const footprint of footprints) positions.push(...footprint.corners)
  for (const point of points) positions.push(point.position)

  const bounds = boundsOfPositions(positions)
  if (bounds === null) return null

  const widestUncertaintyM = points.reduce((widest, point) => Math.max(widest, point.uncertaintyM), 0)
  return padBoundsM(bounds, widestUncertaintyM)
}

/** The centre of a box, as `[longitude, latitude]`. */
export function boundsCentre(bounds: LngLatBounds): LngLat {
  return [(bounds.west + bounds.east) / 2, (bounds.south + bounds.north) / 2]
}
