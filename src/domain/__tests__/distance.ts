import LatLon from 'geodesy/latlon-ellipsoidal-vincenty.js'
import type { LngLat } from '../types'

/**
 * Distance in metres between two WGS84 `[lng, lat]` positions, on the ellipsoid.
 *
 * Vincenty rather than a spherical approximation: a mean-radius sphere is 0.3% out east–west
 * at British latitudes, which is larger than several of the tolerances asserted here.
 */
export function distanceM(a: LngLat, b: LngLat): number {
  return new LatLon(a[1], a[0]).distanceTo(new LatLon(b[1], b[0]))
}
