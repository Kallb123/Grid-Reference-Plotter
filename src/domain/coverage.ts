/**
 * How much of the user's site each frame covers — the question the whole app is for.
 *
 * The archive's own guide is blunt about why this is needed: *"your area will not necessarily be
 * in the centre of each photograph and may be on the edge of it"* (INPUT-FORMAT.md §1). A listing
 * of thirty frames whose centre points are all within a kilometre or two of a site tells the
 * customer almost nothing on its own. What they need is which frames actually contain the site,
 * and, of those, which hold it comfortably inside rather than clipping a corner of it.
 *
 * Three numbers answer that, and they are the three this module produces:
 *
 * - `coveredFraction` — how much of the site falls inside the frame at all.
 * - `edgeClearanceM` — how much room there is between the site and the frame's nearest edge.
 *   Positive is margin to spare, negative is the size of the miss, and zero means the site
 *   straddles the edge, which is the case the guide is warning about.
 * - `offCentreM` — how far the site sits from the middle of the photograph.
 *
 * All of it is plane arithmetic in National Grid metres (`geometry.ts`), on the frame's *grid*
 * corners rather than the WGS84 ones it is drawn with. That keeps the comparison exact and
 * independent of the datum transform: the same Helmert shift is applied to the site and to the
 * frame, so doing the geometry before it, in the coordinate system both actually live in, cannot
 * introduce a discrepancy between them.
 *
 * Everything measured here inherits the caveats the footprint already carries. The frame's extent
 * is indicative — derived from a nominal target scale, positioned by a centre point good to
 * ±50 m — so a coverage figure is a comparison between the site and an estimate, and the notes
 * say so rather than leaving a percentage looking like a measurement.
 */

import { cornersInGrid } from './footprint'
import {
  clipToConvex,
  distanceM,
  distanceToPolygonM,
  distanceToRingM,
  isPointInPolygon,
  polygonAreaM2,
  polygonCentroid,
  ringSeparationM,
} from './geometry'
import type { Ring } from './geometry'
import { wgs84ToGrid } from './osgb'
import type { AreaOfInterest, Footprint, GridPoint, PlottedPoint } from './types'

/**
 * How far a fraction may fall short of 1 and still count as complete coverage.
 *
 * This is a floating-point tolerance and nothing more. A site a metre outside a frame is a site
 * outside the frame; `edgeClearanceM` is where the "only just" cases are quantified.
 */
const COMPLETE = 1 - 1e-9

/** Whether a frame covers all of the site, some of it, or none. */
export type CoverageVerdict = 'full' | 'partial' | 'none'

/** The area of interest in National Grid metres, ready to measure frames against. */
export interface SiteGeometry {
  /** One vertex for a pin, the outline's vertices for a polygon. */
  vertices: GridPoint[]
  /** The pin itself, or the outline's centre of area. */
  centre: GridPoint
  /** Ground area in square metres. Zero for a pin: a pin is a position, not an extent. */
  areaM2: number
}

/** What one vertical frame does about the site. */
export interface FrameCoverage {
  /** Record id of the frame, matching `Footprint.record.id`. */
  id: string
  verdict: CoverageVerdict
  /** Fraction of the site inside the frame, 0 to 1. A pin is 0 or 1 — it has no area to split. */
  coveredFraction: number
  /** The site's ground area inside the frame, in square metres. Zero for a pin. */
  coveredAreaM2: number
  /**
   * Metres between the site and the frame's nearest edge: positive when the whole site is inside
   * with that much room to spare, negative by the size of the gap when the frame misses it
   * entirely, and zero when the site straddles an edge.
   */
  edgeClearanceM: number
  /** Metres from the site's centre to the frame's centre. */
  offCentreM: number
  /**
   * True when the clearance is no larger than the frame's own positional uncertainty.
   *
   * A six-figure centre point is a ±50 m statement, so a frame that covers the site by 20 m and
   * one that misses it by 20 m are the same frame as far as this data can tell. Both are worth
   * showing; neither is worth believing to the metre.
   */
  marginal: boolean
  /** Caveats to show with the numbers, in the same spirit as `Footprint.notes`. */
  notes: string[]
}

/** What one oblique — which has no extent at all — can honestly say about the site. */
export interface SiteProximity {
  /** Record id of the oblique, matching `PlottedPoint.record.id`. */
  id: string
  /**
   * Metres from the site to the position the oblique's map reference names, or zero when that
   * position falls inside the site.
   */
  distanceM: number
  notes: string[]
}

/** Every frame's answer about one site, plus the tally the UI leads with. */
export interface SiteCoverage {
  site: SiteGeometry
  /** Coverage by record id, one entry per vertical frame. */
  frames: Map<string, FrameCoverage>
  /** Distance by record id, one entry per oblique. */
  obliques: Map<string, SiteProximity>
  /** How many vertical frames fall into each verdict. */
  tally: Record<CoverageVerdict, number>
}

const INDICATIVE =
  'Coverage is measured against the frame’s indicative extent, not its surveyed edges.'

/**
 * Put the area of interest on the National Grid.
 *
 * A polygon whose vertices happen to enclose nothing — two clicks, or three in a straight line —
 * is not rejected. It is carried through with zero area and behaves as a pin at its centre,
 * because a user who drew it still meant to point at somewhere.
 */
export function siteGeometry(area: AreaOfInterest): SiteGeometry {
  if (area.kind === 'point') {
    const centre = wgs84ToGrid(area.position)
    return { vertices: [centre], centre, areaM2: 0 }
  }

  if (area.ring.length === 0) throw new RangeError('an area of interest needs at least one vertex')

  const vertices = area.ring.map(wgs84ToGrid)
  return { vertices, centre: polygonCentroid(vertices), areaM2: polygonAreaM2(vertices) }
}

/**
 * The frame's corners in National Grid metres.
 *
 * Recomputed from the record rather than converted back from `Footprint.corners`: those have been
 * through the Helmert transform, and a round trip back would introduce a few millimetres of
 * disagreement for no reason. The inputs are all on the footprint already.
 */
function frameRing(footprint: Footprint): GridPoint[] {
  const { record, groundWidthM, groundHeightM, headingDeg } = footprint
  const centre: GridPoint = { easting: record.ref.easting, northing: record.ref.northing }
  return cornersInGrid(centre, groundWidthM, groundHeightM, headingDeg)
}

/** What one frame does about one site. */
export function coverFrame(footprint: Footprint, site: SiteGeometry): FrameCoverage {
  const ring = frameRing(footprint)
  const measured = site.areaM2 > 0 ? coverArea(site, ring) : coverPoint(site.centre, ring)

  const verdict: CoverageVerdict =
    measured.coveredFraction >= COMPLETE ? 'full' : measured.coveredFraction > 0 ? 'partial' : 'none'

  const marginal = Math.abs(measured.edgeClearanceM) <= footprint.uncertaintyM
  const notes = [INDICATIVE]
  if (marginal) {
    notes.push(
      `The site is within ${formatMetres(footprint.uncertaintyM)} m of the frame’s edge, which is ` +
        'the same size as the uncertainty in the centre point — read this as “on the edge”, not ' +
        'as a measurement.',
    )
  }

  return {
    id: footprint.record.id,
    verdict,
    coveredFraction: measured.coveredFraction,
    coveredAreaM2: measured.coveredAreaM2,
    edgeClearanceM: measured.edgeClearanceM,
    offCentreM: distanceM(site.centre, gridCentreOf(footprint)),
    marginal,
    notes,
  }
}

function gridCentreOf(footprint: Footprint): GridPoint {
  return { easting: footprint.record.ref.easting, northing: footprint.record.ref.northing }
}

interface Measured {
  coveredFraction: number
  coveredAreaM2: number
  edgeClearanceM: number
}

/** A pin: either the frame contains it or it does not, and the clearance is its distance. */
function coverPoint(pin: GridPoint, ring: Ring): Measured {
  const inside = isPointInPolygon(pin, ring)
  const distance = distanceToRingM(pin, ring)
  return {
    coveredFraction: inside ? 1 : 0,
    coveredAreaM2: 0,
    edgeClearanceM: inside ? distance : -distance,
  }
}

/**
 * An outline: how much of its area survives being clipped to the frame.
 *
 * The clearance is signed by what the clipping found. Wholly inside, it is the smallest gap
 * between the outline and the frame's edge — and for a convex frame that gap is always at one of
 * the outline's vertices, since distance to a straight edge varies linearly along a straight side.
 * Wholly outside, it is minus the gap between the two shapes. Straddling, it is zero: the site is
 * on the edge, which is the honest answer and the one the archive's warning is about.
 */
function coverArea(site: SiteGeometry, ring: Ring): Measured {
  const coveredAreaM2 = polygonAreaM2(clipToConvex(site.vertices, ring))
  const coveredFraction = Math.min(1, coveredAreaM2 / site.areaM2)

  if (coveredFraction >= COMPLETE) {
    const clearance = site.vertices.reduce(
      (nearest, vertex) => Math.min(nearest, distanceToRingM(vertex, ring)),
      Infinity,
    )
    return { coveredFraction, coveredAreaM2, edgeClearanceM: clearance }
  }

  if (coveredFraction > 0) return { coveredFraction, coveredAreaM2, edgeClearanceM: 0 }

  return { coveredFraction, coveredAreaM2, edgeClearanceM: -ringSeparationM(site.vertices, ring) }
}

/**
 * How close an oblique's map reference is to the site.
 *
 * This is a distance and nothing more. An oblique carries no scale, height or bearing, so what
 * the photograph shows cannot be derived from the listing (INPUT-FORMAT.md §6) — the nearest
 * thing to an answer is that the reference the archive holds for it is this far from the site,
 * and the note says exactly that rather than letting a small number read as coverage.
 */
export function proximityOfPoint(point: PlottedPoint, site: SiteGeometry): SiteProximity {
  const { record } = point
  const position: GridPoint = { easting: record.ref.easting, northing: record.ref.northing }

  const distance =
    site.areaM2 > 0
      ? distanceToPolygonM(position, site.vertices)
      : distanceM(position, site.centre)

  return {
    id: record.id,
    distanceM: distance,
    notes: [
      'This is the distance to the point the oblique is catalogued under, not to what it shows. ' +
        'An oblique carries no scale, height or bearing, so whether it covers the site cannot be ' +
        'derived from the listing.',
    ],
  }
}

/** Every frame and every oblique measured against one site. */
export function coverageOf(
  footprints: readonly Footprint[],
  points: readonly PlottedPoint[],
  area: AreaOfInterest,
): SiteCoverage {
  const site = siteGeometry(area)
  const frames = new Map<string, FrameCoverage>()
  const obliques = new Map<string, SiteProximity>()
  const tally: Record<CoverageVerdict, number> = { full: 0, partial: 0, none: 0 }

  for (const footprint of footprints) {
    const coverage = coverFrame(footprint, site)
    frames.set(coverage.id, coverage)
    tally[coverage.verdict] += 1
  }

  for (const point of points) {
    const proximity = proximityOfPoint(point, site)
    obliques.set(proximity.id, proximity)
  }

  return { site, frames, obliques, tally }
}

function formatMetres(metres: number): string {
  return String(Math.round(metres))
}
