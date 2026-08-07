/**
 * Camera metadata → the ground a frame covers. See archive/MATHS.md §4 and §5.
 *
 * The whole of the sizing is similar triangles:
 *
 *     scale denominator m = H / f
 *     ground dimension    = film dimension × m = film dimension × H / f
 *
 * `H` is the height above *the ground being photographed*, not altitude above sea level.
 *
 * The placing is plane arithmetic in eastings and northings, with each corner converted to
 * WGS84 individually. The National Grid is a plane; treating it as one is both simpler and
 * more accurate than projecting geodesic bearings out from the centre.
 */

import { gridToWgs84, normaliseDegrees, trueBearingToGridBearing } from './osgb'
import type {
  Corner,
  Footprint,
  GridPoint,
  Heading,
  ObliqueRecord,
  PlottedPoint,
  VerticalRecord,
} from './types'

/** Ground dimension in metres for one side of the film at a given nominal scale. */
export function groundSizeFromScale(filmMm: number, scaleDenominator: number): number {
  requirePositive(filmMm, 'filmMm')
  requirePositive(scaleDenominator, 'scaleDenominator')
  return (filmMm / 1000) * scaleDenominator
}

/** Ground dimension in metres from film size, focal length and height above ground. */
export function groundSizeFromHeight(
  filmMm: number,
  focalLengthMm: number,
  heightAboveGroundM: number,
): number {
  requirePositive(focalLengthMm, 'focalLengthMm')
  requirePositive(heightAboveGroundM, 'heightAboveGroundM')
  return groundSizeFromScale(filmMm, scaleFromHeight(focalLengthMm, heightAboveGroundM))
}

/** Scale denominator implied by a focal length and a height above ground. */
export function scaleFromHeight(focalLengthMm: number, heightAboveGroundM: number): number {
  requirePositive(focalLengthMm, 'focalLengthMm')
  requirePositive(heightAboveGroundM, 'heightAboveGroundM')
  return heightAboveGroundM / (focalLengthMm / 1000)
}

/**
 * Height above ground implied by a focal length and a nominal scale.
 *
 * Worth displaying even though the footprint does not need it — the sample's values land on
 * round foot heights, which is what shows these are genuine planned survey scales.
 */
export function flyingHeightM(focalLengthMm: number, scaleDenominator: number): number {
  requirePositive(focalLengthMm, 'focalLengthMm')
  requirePositive(scaleDenominator, 'scaleDenominator')
  return (focalLengthMm / 1000) * scaleDenominator
}

export interface ScaleCrossCheck {
  /** Scale denominator the catalogue stated. */
  suppliedScaleDenominator: number
  /** Scale denominator implied by the focal length and height above ground. */
  impliedScaleDenominator: number
  /** Signed difference of the implied value against the supplied one, as a percentage. */
  differencePercent: number
}

/**
 * Compare a stated scale against one derived from focal length and height.
 *
 * Where a source gives both, report the discrepancy rather than silently preferring one.
 */
export function crossCheckScale(
  suppliedScaleDenominator: number,
  focalLengthMm: number,
  heightAboveGroundM: number,
): ScaleCrossCheck {
  requirePositive(suppliedScaleDenominator, 'suppliedScaleDenominator')
  const implied = scaleFromHeight(focalLengthMm, heightAboveGroundM)
  return {
    suppliedScaleDenominator,
    impliedScaleDenominator: implied,
    differencePercent: ((implied - suppliedScaleDenominator) / suppliedScaleDenominator) * 100,
  }
}

/**
 * The four corners of a frame, in National Grid metres, clockwise from the top-left of the
 * un-rotated frame.
 *
 * `headingDeg` is clockwise from **grid** north. At 0° this is the axis-aligned box
 * `(E ± w/2, N ± h/2)`; at 90° the two ground dimensions swap.
 */
export function cornersInGrid(
  centre: GridPoint,
  groundWidthM: number,
  groundHeightM: number,
  headingDeg = 0,
): [GridPoint, GridPoint, GridPoint, GridPoint] {
  requirePositive(groundWidthM, 'groundWidthM')
  requirePositive(groundHeightM, 'groundHeightM')

  const theta = (headingDeg * Math.PI) / 180
  const sin = Math.sin(theta)
  const cos = Math.cos(theta)
  const halfAlong = groundHeightM / 2
  const halfAcross = groundWidthM / 2

  // a is along-track (+1 forward), b is across-track (+1 right). archive/MATHS.md §5.
  const corner = (a: number, b: number): GridPoint => ({
    easting: centre.easting + a * halfAlong * sin + b * halfAcross * cos,
    northing: centre.northing + a * halfAlong * cos - b * halfAcross * sin,
  })

  return [corner(1, -1), corner(1, 1), corner(-1, 1), corner(-1, -1)]
}

export interface FootprintOptions {
  /**
   * Flight heading, if a source ever supplies one. A `'true'` bearing has grid convergence
   * removed before use; a `'grid'` bearing is used as given. Absent, the frame is drawn
   * aligned to grid north and says so in `notes`.
   */
  heading?: Heading
}

/**
 * Build the indicative ground extent of a vertical frame.
 *
 * The result is an *indicative* extent, not a surveyed boundary: the catalogue's scale is the
 * survey's target and real frames vary with aircraft altitude and terrain. The caveats are
 * carried in `notes` so the UI cannot quietly drop them.
 */
export function buildFootprint(record: VerticalRecord, options: FootprintOptions = {}): Footprint {
  const { ref, film, scaleDenominator, focalLengthMm } = record
  const centreGrid: GridPoint = { easting: ref.easting, northing: ref.northing }

  const groundWidthM = groundSizeFromScale(film.widthMm, scaleDenominator)
  const groundHeightM = groundSizeFromScale(film.heightMm, scaleDenominator)

  const notes: string[] = [
    'Scale is the survey’s nominal target; individual frames vary with aircraft altitude and terrain.',
    `Centre point is a ${ref.precisionM} m grid square, so ±${ref.precisionM / 2} m.`,
    'Extent is indicative, not a surveyed boundary.',
  ]

  const headingDeg = resolveHeading(options.heading, centreGrid, notes)

  const cornerPoints = cornersInGrid(centreGrid, groundWidthM, groundHeightM, headingDeg)
  const corners = cornerPoints.map(gridToWgs84) as [Corner, Corner, Corner, Corner]

  const footprint: Footprint = {
    record,
    groundWidthM,
    groundHeightM,
    centre: gridToWgs84(centreGrid),
    corners,
    uncertaintyM: ref.precisionM / 2,
    headingDeg,
    notes,
  }

  if (focalLengthMm !== undefined) {
    footprint.flyingHeightM = flyingHeightM(focalLengthMm, scaleDenominator)
  }

  return footprint
}

/**
 * Plot an oblique frame.
 *
 * There is deliberately no footprint here. An oblique listing carries no scale, focal length,
 * camera height or bearing, so the trapezoid it covers is not derivable — a point is the only
 * honest output. See INPUT-FORMAT.md §6.
 */
export function buildObliquePoint(record: ObliqueRecord): PlottedPoint {
  const { ref } = record
  return {
    record,
    position: gridToWgs84({ easting: ref.easting, northing: ref.northing }),
    uncertaintyM: ref.precisionM / 2,
    notes: [
      `Centre point is a ${ref.precisionM} m grid square, so ±${ref.precisionM / 2} m.`,
      'Obliques carry no scale, focal length, height or bearing, so no ground extent can be derived.',
    ],
  }
}

/** Resolve a supplied heading to a grid bearing, recording which convention was assumed. */
function resolveHeading(
  heading: Heading | undefined,
  centre: GridPoint,
  notes: string[],
): number {
  if (heading === undefined) {
    notes.push('No heading supplied; the frame is drawn aligned to grid north.')
    return 0
  }

  if (heading.convention === 'true') {
    const gridBearing = trueBearingToGridBearing(heading.degrees, centre)
    notes.push(
      `Heading ${heading.degrees}° was supplied as a true bearing; grid convergence was ` +
        `removed to give a grid bearing of ${gridBearing.toFixed(2)}°.`,
    )
    return gridBearing
  }

  const gridBearing = normaliseDegrees(heading.degrees)
  notes.push(`Heading ${heading.degrees}° was supplied as a grid bearing and used as given.`)
  return gridBearing
}

function requirePositive(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive number, got ${value}`)
  }
}
