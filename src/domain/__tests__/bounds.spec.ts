import { describe, expect, it } from 'vitest'
import { boundsCentre, boundsOfPositions, padBoundsM, plotBounds } from '../bounds'
import { buildFootprint, buildObliquePoint } from '../footprint'
import { parseGridRef } from '../osgb'
import type { LngLat, ObliqueRecord, VerticalRecord } from '../types'
import { distanceM } from './distance'

/** The worked example of INPUT-FORMAT.md §4: a 9″ frame at 1:10500, so a 2400.3 m square. */
function verticalRecord(centrePoint = 'SK 421 849'): VerticalRecord {
  return {
    kind: 'vertical',
    id: `MAL/67055 frame 23 ${centrePoint}`,
    ref: parseGridRef(centrePoint),
    film: { widthMm: 228.6, heightMm: 228.6, description: 'Black and White 9 x 9' },
    scaleDenominator: 10500,
    focalLengthMm: 152.4,
    provenance: {
      sortieNumber: 'MAL/67055',
      libraryNumber: '4777',
      cameraPosition: 'V',
      frameNumber: '23',
    },
  }
}

function obliqueRecord(mapReference = 'SK 421 849'): ObliqueRecord {
  return {
    kind: 'oblique',
    id: `EPW012345 ${mapReference}`,
    ref: parseGridRef(mapReference),
    provenance: { photoReference: 'SK 4218/49' },
  }
}

describe('boundsOfPositions', () => {
  it('returns null for nothing', () => {
    expect(boundsOfPositions([])).toBeNull()
  })

  it('takes the extremes of the positions given', () => {
    const positions: LngLat[] = [
      [-1.4, 53.3],
      [-1.2, 53.5],
      [-1.3, 53.4],
    ]
    expect(boundsOfPositions(positions)).toEqual({
      west: -1.4,
      south: 53.3,
      east: -1.2,
      north: 53.5,
    })
  })

  it('gives one position a zero-sized box rather than inventing an extent', () => {
    expect(boundsOfPositions([[-1.368, 53.36]])).toEqual({
      west: -1.368,
      south: 53.36,
      east: -1.368,
      north: 53.36,
    })
  })

  it('ignores positions that are not finite', () => {
    const positions: LngLat[] = [
      [-1.4, 53.3],
      [Number.NaN, 53.9],
      [-1.2, Infinity],
    ]
    expect(boundsOfPositions(positions)).toEqual({ west: -1.4, south: 53.3, east: -1.4, north: 53.3 })
  })
})

describe('padBoundsM', () => {
  it('grows the box by the requested distance on the ground', () => {
    const bounds = { west: -1.368, south: 53.36, east: -1.368, north: 53.36 }
    const padded = padBoundsM(bounds, 500)

    const southwest: LngLat = [padded.west, padded.south]
    const northwest: LngLat = [padded.west, padded.north]
    const northeast: LngLat = [padded.east, padded.north]

    // 500 m each way, to the fraction of a percent a spherical earth is good for. This is view
    // padding, not geometry — the footprint corners themselves are exact plane arithmetic.
    expect(distanceM(southwest, northwest)).toBeCloseTo(1000, -1)
    expect(distanceM(northwest, northeast)).toBeCloseTo(1000, -1)
  })

  it('leaves the box alone for a zero or nonsense distance', () => {
    const bounds = { west: -1.4, south: 53.3, east: -1.2, north: 53.5 }
    expect(padBoundsM(bounds, 0)).toEqual(bounds)
    expect(padBoundsM(bounds, -50)).toEqual(bounds)
    expect(padBoundsM(bounds, Number.NaN)).toEqual(bounds)
  })

  it('clamps to the limits of the coordinate system', () => {
    const padded = padBoundsM({ west: -179.9, south: -89.9, east: 179.9, north: 89.9 }, 100_000)
    expect(padded).toEqual({ west: -180, south: -90, east: 180, north: 90 })
  })
})

describe('plotBounds', () => {
  it('returns null when nothing is plotted', () => {
    expect(plotBounds([], [])).toBeNull()
  })

  it('spans a footprint’s corners', () => {
    const footprint = buildFootprint(verticalRecord())
    const bounds = plotBounds([footprint], [])
    expect(bounds).not.toBeNull()

    // The frame is a 2400.3 m square aligned to *grid* north, and grid north is about 0.5° off
    // true north at SK 42 (archive/MATHS.md §6). A north-aligned box round a slightly rotated
    // square is a little wider than the square — the excess is the rotation, not an error.
    const west: LngLat = [bounds!.west, bounds!.south]
    const east: LngLat = [bounds!.east, bounds!.south]
    expect(distanceM(west, east)).toBeGreaterThanOrEqual(2400.3)
    expect(distanceM(west, east)).toBeLessThan(2400.3 * 1.02)
  })

  it('covers every footprint in the set', () => {
    const near = buildFootprint(verticalRecord('SK 421 849'))
    const far = buildFootprint(verticalRecord('SK 430 856'))
    const bounds = plotBounds([near, far], [])!

    for (const footprint of [near, far]) {
      for (const [lng, lat] of footprint.corners) {
        expect(lng).toBeGreaterThanOrEqual(bounds.west)
        expect(lng).toBeLessThanOrEqual(bounds.east)
        expect(lat).toBeGreaterThanOrEqual(bounds.south)
        expect(lat).toBeLessThanOrEqual(bounds.north)
      }
    }
  })

  it('gives a lone oblique its grid square rather than a dimensionless dot', () => {
    const point = buildObliquePoint(obliqueRecord())
    const bounds = plotBounds([], [point])!

    // A six-figure reference is ±50 m, so the box is about 100 m across, not zero.
    const southwest: LngLat = [bounds.west, bounds.south]
    const northwest: LngLat = [bounds.west, bounds.north]
    expect(distanceM(southwest, northwest)).toBeGreaterThan(99)
    expect(distanceM(southwest, northwest)).toBeLessThan(105)
  })

  it('spans footprints and points together', () => {
    const footprint = buildFootprint(verticalRecord('SK 421 849'))
    const point = buildObliquePoint(obliqueRecord('SK 470 900'))
    const bounds = plotBounds([footprint], [point])!

    expect(point.position[0]).toBeLessThanOrEqual(bounds.east)
    expect(point.position[1]).toBeLessThanOrEqual(bounds.north)
    expect(bounds.west).toBeLessThanOrEqual(Math.min(...footprint.corners.map(([lng]) => lng)))
  })
})

describe('boundsCentre', () => {
  it('is the midpoint of the box', () => {
    expect(boundsCentre({ west: -2, south: 53, east: -1, north: 55 })).toEqual([-1.5, 54])
  })
})
