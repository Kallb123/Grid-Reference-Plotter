/**
 * Plane geometry on the National Grid.
 *
 * Everything here is in metres east and north of the grid's false origin, so the numbers are
 * chosen to be checkable by hand: squares with round sides, distances that are subtractions.
 */

import { describe, expect, it } from 'vitest'
import {
  clipToConvex,
  distanceM,
  distanceToPolygonM,
  distanceToRingM,
  distanceToSegmentM,
  isPointInPolygon,
  polygonAreaM2,
  polygonCentroid,
  ringSeparationM,
} from '../geometry'
import type { Ring } from '../geometry'
import type { GridPoint } from '../types'

/** An axis-aligned square of side `side` centred on (`easting`, `northing`), anticlockwise. */
function square(easting: number, northing: number, side: number): GridPoint[] {
  const half = side / 2
  return [
    { easting: easting - half, northing: northing - half },
    { easting: easting + half, northing: northing - half },
    { easting: easting + half, northing: northing + half },
    { easting: easting - half, northing: northing + half },
  ]
}

const UNIT: Ring = square(0, 0, 100)

describe('distanceM', () => {
  it('is Pythagoras on the plane', () => {
    expect(distanceM({ easting: 0, northing: 0 }, { easting: 300, northing: 400 })).toBe(500)
    expect(distanceM({ easting: 442150, northing: 384950 }, { easting: 442150, northing: 384950 })).toBe(0)
  })
})

describe('polygonAreaM2', () => {
  it('measures a square', () => {
    expect(polygonAreaM2(UNIT)).toBe(10_000)
  })

  it('does not care which way round the ring is wound', () => {
    expect(polygonAreaM2([...UNIT].reverse())).toBe(10_000)
  })

  it('measures an L, so a concave outline is not treated as its bounding box', () => {
    // A 100 m square with a 50 m square bitten out of the north-east corner: 7500 m², not 10 000.
    const l: Ring = [
      { easting: 0, northing: 0 },
      { easting: 100, northing: 0 },
      { easting: 100, northing: 50 },
      { easting: 50, northing: 50 },
      { easting: 50, northing: 100 },
      { easting: 0, northing: 100 },
    ]
    expect(polygonAreaM2(l)).toBe(7_500)
  })

  it('encloses nothing with fewer than three vertices, or with three in a line', () => {
    expect(polygonAreaM2([])).toBe(0)
    expect(polygonAreaM2([{ easting: 0, northing: 0 }])).toBe(0)
    expect(
      polygonAreaM2([
        { easting: 0, northing: 0 },
        { easting: 50, northing: 0 },
        { easting: 100, northing: 0 },
      ]),
    ).toBe(0)
  })
})

describe('polygonCentroid', () => {
  it('is the centre of a square', () => {
    expect(polygonCentroid(square(442_150, 384_950, 400))).toEqual({
      easting: 442_150,
      northing: 384_950,
    })
  })

  it('is the centre of area, not the mean of the vertices', () => {
    // A triangle's centroid is a third of the way up from its base; the vertex mean happens to
    // agree for a triangle, so use a shape where they differ: a square with a doubled corner.
    const weighted: Ring = [
      { easting: 0, northing: 0 },
      { easting: 100, northing: 0 },
      { easting: 100, northing: 100 },
      { easting: 50, northing: 100 },
      { easting: 0, northing: 100 },
    ]
    expect(polygonCentroid(weighted).easting).toBeCloseTo(50, 9)
    expect(polygonCentroid(weighted).northing).toBeCloseTo(50, 9)
  })

  it('falls back to the mean of the vertices where nothing is enclosed', () => {
    // Two clicks, or three in a line, still name somewhere.
    expect(
      polygonCentroid([
        { easting: 0, northing: 0 },
        { easting: 100, northing: 0 },
      ]),
    ).toEqual({ easting: 50, northing: 0 })
  })
})

describe('isPointInPolygon', () => {
  it('separates inside from outside', () => {
    expect(isPointInPolygon({ easting: 0, northing: 0 }, UNIT)).toBe(true)
    expect(isPointInPolygon({ easting: 49, northing: 49 }, UNIT)).toBe(true)
    expect(isPointInPolygon({ easting: 51, northing: 0 }, UNIT)).toBe(false)
    expect(isPointInPolygon({ easting: 0, northing: 5_000 }, UNIT)).toBe(false)
  })

  it('handles a concave outline’s notch', () => {
    const c: Ring = [
      { easting: 0, northing: 0 },
      { easting: 100, northing: 0 },
      { easting: 100, northing: 30 },
      { easting: 30, northing: 30 },
      { easting: 30, northing: 70 },
      { easting: 100, northing: 70 },
      { easting: 100, northing: 100 },
      { easting: 0, northing: 100 },
    ]
    expect(isPointInPolygon({ easting: 10, northing: 50 }, c)).toBe(true)
    // Inside the bounding box, inside the notch, outside the shape.
    expect(isPointInPolygon({ easting: 70, northing: 50 }, c)).toBe(false)
  })

  it('is false for anything that is not a polygon', () => {
    expect(isPointInPolygon({ easting: 0, northing: 0 }, [])).toBe(false)
    expect(
      isPointInPolygon({ easting: 0, northing: 0 }, [
        { easting: -1, northing: 0 },
        { easting: 1, northing: 0 },
      ]),
    ).toBe(false)
  })
})

describe('distanceToSegmentM', () => {
  it('measures to the nearest point on the segment, not to its line', () => {
    const a: GridPoint = { easting: 0, northing: 0 }
    const b: GridPoint = { easting: 100, northing: 0 }

    expect(distanceToSegmentM({ easting: 50, northing: 30 }, a, b)).toBe(30)
    // Beyond the end, the nearest point is the end itself — not the foot of the perpendicular.
    expect(distanceToSegmentM({ easting: 140, northing: 30 }, a, b)).toBe(50)
  })

  it('degrades to a point distance for a zero-length segment', () => {
    const a: GridPoint = { easting: 0, northing: 0 }
    expect(distanceToSegmentM({ easting: 3, northing: 4 }, a, a)).toBe(5)
  })
})

describe('distanceToRingM', () => {
  it('measures to the nearest edge from inside as well as outside', () => {
    expect(distanceToRingM({ easting: 0, northing: 0 }, UNIT)).toBe(50)
    expect(distanceToRingM({ easting: 30, northing: 0 }, UNIT)).toBe(20)
    expect(distanceToRingM({ easting: 150, northing: 0 }, UNIT)).toBe(100)
  })
})

describe('distanceToPolygonM', () => {
  it('is zero inside the outline and the edge distance outside it', () => {
    expect(distanceToPolygonM({ easting: 0, northing: 0 }, UNIT)).toBe(0)
    expect(distanceToPolygonM({ easting: 150, northing: 0 }, UNIT)).toBe(100)
  })
})

describe('ringSeparationM', () => {
  it('is the gap between two rings that do not touch', () => {
    expect(ringSeparationM(UNIT, square(300, 0, 100))).toBe(200)
  })

  it('finds a gap that is a corner against the middle of a side', () => {
    // Rotating one square 45° puts its nearest feature — a corner — opposite the other's edge,
    // which only one of the two directions of the search would find.
    const diamond: Ring = [
      { easting: 200, northing: 0 },
      { easting: 300, northing: 100 },
      { easting: 400, northing: 0 },
      { easting: 300, northing: -100 },
    ]
    expect(ringSeparationM(UNIT, diamond)).toBe(150)
  })
})

describe('clipToConvex', () => {
  it('keeps a subject that is entirely inside', () => {
    expect(polygonAreaM2(clipToConvex(square(0, 0, 40), UNIT))).toBeCloseTo(1_600, 6)
  })

  it('takes the overlap when the subject straddles an edge', () => {
    // A 40 m square centred on the ring's eastern edge: exactly half of it survives.
    expect(polygonAreaM2(clipToConvex(square(50, 0, 40), UNIT))).toBeCloseTo(800, 6)
  })

  it('returns nothing for a subject that misses entirely', () => {
    expect(clipToConvex(square(500, 0, 40), UNIT)).toEqual([])
  })

  it('does not care which way round either ring is wound', () => {
    const clockwise = [...UNIT].reverse()
    expect(polygonAreaM2(clipToConvex(square(50, 0, 40), clockwise))).toBeCloseTo(800, 6)
    expect(polygonAreaM2(clipToConvex([...square(50, 0, 40)].reverse(), UNIT))).toBeCloseTo(800, 6)
  })

  it('measures a concave subject cut into two separate pieces', () => {
    // A U on its side, opening west: the whole 100 × 80 m block from easting 0, with a
    // 60 × 40 m notch bitten out of its western side. Clipped at easting 50 the two arms fall
    // inside the ring and the spine that joins them falls outside, so the overlap is two
    // separate 50 × 20 m rectangles. Sutherland–Hodgman returns them as one contour with a
    // zero-width seam between them — not a shape worth drawing, but its area is the two arms'.
    const u: Ring = [
      { easting: 0, northing: -40 },
      { easting: 100, northing: -40 },
      { easting: 100, northing: 40 },
      { easting: 0, northing: 40 },
      { easting: 0, northing: 20 },
      { easting: 60, northing: 20 },
      { easting: 60, northing: -20 },
      { easting: 0, northing: -20 },
    ]
    expect(polygonAreaM2(u)).toBeCloseTo(5_600, 6)
    expect(polygonAreaM2(clipToConvex(u, UNIT))).toBeCloseTo(2_000, 6)
  })

  it('returns nothing when either ring is not a polygon', () => {
    expect(clipToConvex([{ easting: 0, northing: 0 }], UNIT)).toEqual([])
    expect(clipToConvex(UNIT, [{ easting: 0, northing: 0 }])).toEqual([])
  })
})
