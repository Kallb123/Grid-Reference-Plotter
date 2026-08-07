import { describe, expect, it } from 'vitest'
import {
  buildFootprint,
  buildObliquePoint,
  cornersInGrid,
  crossCheckScale,
  flyingHeightM,
  groundSizeFromHeight,
  groundSizeFromScale,
  scaleFromHeight,
} from '../footprint'
import { parseGridRef } from '../osgb'
import type { ObliqueRecord, VerticalRecord } from '../types'
import { metresToFeet, squareMetresToSquareMiles } from '../units'
import { distanceM } from './distance'

const NINE_INCH_MM = 228.6
const SIX_INCH_MM = 152.4
const TWELVE_INCH_MM = 304.8

/** First row of the real Historic England sample; see INPUT-FORMAT.md §4. */
function sampleVertical(overrides: Partial<VerticalRecord> = {}): VerticalRecord {
  return {
    kind: 'vertical',
    id: 'MAL/67055-23',
    ref: parseGridRef('SK 421 849'),
    film: {
      widthMm: NINE_INCH_MM,
      heightMm: NINE_INCH_MM,
      description: 'Black and White 9 x 9',
    },
    scaleDenominator: 10500,
    focalLengthMm: SIX_INCH_MM,
    provenance: {
      sortieNumber: 'MAL/67055',
      libraryNumber: '4777',
      cameraPosition: 'V',
      frameNumber: '23',
      run: '1',
      date: '13 JUN 1967',
      sortieQuality: 'A',
      held: 'P',
      filmHeldBy: 'NMR',
    },
    ...overrides,
  }
}

describe('groundSizeFromScale', () => {
  it('is film size × scale denominator', () => {
    expect(groundSizeFromScale(NINE_INCH_MM, 10000)).toBeCloseTo(2286, 9)
    expect(groundSizeFromScale(NINE_INCH_MM, 10500)).toBeCloseTo(2400.3, 9)
  })

  it('agrees with the supplier guide’s own scale-to-area table', () => {
    // archive/MATHS.md §4 — these three come from Historic England, not from this derivation.
    const cases = [
      { scale: 2500, side: 571.5, squareMiles: 0.13 },
      { scale: 10000, side: 2286, squareMiles: 2 },
      { scale: 15000, side: 3429, squareMiles: 4.5 },
    ]
    for (const { scale, side, squareMiles } of cases) {
      const ground = groundSizeFromScale(NINE_INCH_MM, scale)
      expect(ground).toBeCloseTo(side, 6)
      expect(squareMetresToSquareMiles(ground ** 2)).toBeCloseTo(squareMiles, 1)
    }
  })

  it('rejects nonsense inputs rather than returning a plausible number', () => {
    expect(() => groundSizeFromScale(0, 10000)).toThrow(RangeError)
    expect(() => groundSizeFromScale(NINE_INCH_MM, -1)).toThrow(RangeError)
    expect(() => groundSizeFromScale(NINE_INCH_MM, NaN)).toThrow(RangeError)
  })
})

describe('groundSizeFromHeight', () => {
  it('matches the worked examples', () => {
    // archive/MATHS.md §4: 9″ film, 6″ lens, 3000 m AGL → 4500 m.
    expect(groundSizeFromHeight(NINE_INCH_MM, SIX_INCH_MM, 3000)).toBeCloseTo(4500, 9)
    // 9″ film, 12″ lens, 1500 m AGL → 1125 m.
    expect(groundSizeFromHeight(NINE_INCH_MM, TWELVE_INCH_MM, 1500)).toBeCloseTo(1125, 9)
  })

  it('is the film-to-focal ratio times the height', () => {
    const ratio = NINE_INCH_MM / SIX_INCH_MM
    expect(groundSizeFromHeight(NINE_INCH_MM, SIX_INCH_MM, 3000)).toBeCloseTo(ratio * 3000, 9)
  })
})

describe('scaleFromHeight', () => {
  it('matches the worked examples', () => {
    expect(scaleFromHeight(SIX_INCH_MM, 3000)).toBeCloseTo(19685, 0)
    expect(scaleFromHeight(TWELVE_INCH_MM, 1500)).toBeCloseTo(4921, 0)
  })
})

describe('flyingHeightM', () => {
  it('lands on the round foot heights the surveys were planned at', () => {
    // archive/MATHS.md §4 — the check that the catalogue scales are genuine target scales.
    expect(metresToFeet(flyingHeightM(SIX_INCH_MM, 10500))).toBeCloseTo(5250, 6)
    expect(metresToFeet(flyingHeightM(TWELVE_INCH_MM, 7000))).toBeCloseTo(7000, 6)
    expect(metresToFeet(flyingHeightM(SIX_INCH_MM, 2500))).toBeCloseTo(1250, 6)
  })

  it('is 1600.2 m for the sample’s first row', () => {
    expect(flyingHeightM(SIX_INCH_MM, 10500)).toBeCloseTo(1600.2, 9)
  })
})

describe('crossCheckScale', () => {
  it('reports agreement rather than silently preferring one input', () => {
    const check = crossCheckScale(19685, SIX_INCH_MM, 3000)
    expect(check.impliedScaleDenominator).toBeCloseTo(19685, 0)
    expect(Math.abs(check.differencePercent)).toBeLessThan(0.01)
  })

  it('reports a disagreement with its size and direction', () => {
    const check = crossCheckScale(10000, SIX_INCH_MM, 1600.2)
    expect(check.impliedScaleDenominator).toBeCloseTo(10500, 6)
    expect(check.differencePercent).toBeCloseTo(5, 6)
  })
})

describe('cornersInGrid', () => {
  const centre = { easting: 442150, northing: 384950 }

  it('is an axis-aligned box at heading 0', () => {
    const [topLeft, topRight, bottomRight, bottomLeft] = cornersInGrid(centre, 2000, 1000, 0)
    expect(topLeft).toEqual({ easting: 441150, northing: 385450 })
    expect(topRight).toEqual({ easting: 443150, northing: 385450 })
    expect(bottomRight).toEqual({ easting: 443150, northing: 384450 })
    expect(bottomLeft).toEqual({ easting: 441150, northing: 384450 })
  })

  it('swaps the ground dimensions at heading 90', () => {
    const corners = cornersInGrid(centre, 2000, 1000, 90)
    const eastings = corners.map((c) => c.easting)
    const northings = corners.map((c) => c.northing)
    // Across-track 2000 m now runs north–south, along-track 1000 m runs east–west.
    expect(Math.max(...eastings) - Math.min(...eastings)).toBeCloseTo(1000, 6)
    expect(Math.max(...northings) - Math.min(...northings)).toBeCloseTo(2000, 6)
  })

  it('round-trips at 360 degrees', () => {
    const at0 = cornersInGrid(centre, 2000, 1000, 0)
    const at360 = cornersInGrid(centre, 2000, 1000, 360)
    at360.forEach((corner, i) => {
      expect(corner.easting).toBeCloseTo(at0[i]!.easting, 6)
      expect(corner.northing).toBeCloseTo(at0[i]!.northing, 6)
    })
  })

  it('preserves the side lengths at an arbitrary heading', () => {
    const [topLeft, topRight, bottomRight] = cornersInGrid(centre, 2000, 1000, 37)
    const width = Math.hypot(topRight.easting - topLeft.easting, topRight.northing - topLeft.northing)
    const height = Math.hypot(
      bottomRight.easting - topRight.easting,
      bottomRight.northing - topRight.northing,
    )
    expect(width).toBeCloseTo(2000, 6)
    expect(height).toBeCloseTo(1000, 6)
  })

  it('keeps a non-square frame rectangular — not the 45° diagonal the old app assumed', () => {
    // archive/MATHS.md §7.2: hard-coding corner bearings to 45° only works for a square frame.
    const [topLeft, topRight, bottomRight] = cornersInGrid(centre, 4000, 1000, 0)
    expect(
      Math.hypot(topRight.easting - topLeft.easting, topRight.northing - topLeft.northing),
    ).toBeCloseTo(4000, 6)
    expect(
      Math.hypot(bottomRight.easting - topRight.easting, bottomRight.northing - topRight.northing),
    ).toBeCloseTo(1000, 6)
  })

  it('rejects a frame with no size', () => {
    expect(() => cornersInGrid(centre, 0, 1000)).toThrow(RangeError)
    expect(() => cornersInGrid(centre, 2000, -5)).toThrow(RangeError)
  })
})

describe('buildFootprint', () => {
  it('sizes the sample row as the documented worked example', () => {
    const footprint = buildFootprint(sampleVertical())
    expect(footprint.groundWidthM).toBeCloseTo(2400.3, 6)
    expect(footprint.groundHeightM).toBeCloseTo(2400.3, 6)
    expect(footprint.flyingHeightM).toBeCloseTo(1600.2, 6)
  })

  it('places the centre on WGS84, not OSGB36', () => {
    const footprint = buildFootprint(sampleVertical())
    expect(distanceM(footprint.centre, [-1.368131, 53.359754])).toBeLessThanOrEqual(5)
    // The OSGB36 position for this row is 107 m away; landing there would be the old bug.
    expect(distanceM(footprint.centre, [-1.366593, 53.359478])).toBeGreaterThan(100)
  })

  it('converts each corner individually, giving a polygon the right size on the ground', () => {
    const footprint = buildFootprint(sampleVertical())
    const [topLeft, topRight, bottomRight] = footprint.corners
    // Ground distance differs from grid distance by the local scale factor — at most 0.04%,
    // about 1 m on this frame. See archive/MATHS.md §6.
    expect(Math.abs(distanceM(topLeft, topRight) - 2400.3)).toBeLessThan(2)
    expect(Math.abs(distanceM(topRight, bottomRight) - 2400.3)).toBeLessThan(2)
  })

  it('carries the grid square’s uncertainty', () => {
    expect(buildFootprint(sampleVertical()).uncertaintyM).toBe(50)
    const coarse = sampleVertical({ ref: parseGridRef('SK 42 84') })
    expect(buildFootprint(coarse).uncertaintyM).toBe(500)
  })

  it('states that the scale is nominal and the extent indicative', () => {
    const notes = buildFootprint(sampleVertical()).notes.join(' ')
    expect(notes).toMatch(/nominal/i)
    expect(notes).toMatch(/indicative/i)
    expect(notes).toMatch(/±50 m/)
  })

  it('defaults to grid north and says so', () => {
    const footprint = buildFootprint(sampleVertical())
    expect(footprint.headingDeg).toBe(0)
    expect(footprint.notes.join(' ')).toMatch(/aligned to grid north/i)
  })

  it('uses a grid bearing as given', () => {
    const footprint = buildFootprint(sampleVertical(), {
      heading: { degrees: 90, convention: 'grid' },
    })
    expect(footprint.headingDeg).toBeCloseTo(90, 9)
    expect(footprint.notes.join(' ')).toMatch(/grid bearing and used as given/i)
  })

  it('removes grid convergence from a true bearing, and records that it did', () => {
    const footprint = buildFootprint(sampleVertical(), {
      heading: { degrees: 90, convention: 'true' },
    })
    // SK 421 849 is east of the 2°W central meridian, so convergence is positive and the
    // grid bearing comes out slightly smaller than the true one.
    expect(footprint.headingDeg).toBeLessThan(90)
    expect(footprint.headingDeg).toBeGreaterThan(89)
    expect(footprint.notes.join(' ')).toMatch(/true bearing/i)
  })

  it('omits the flying height when no focal length was supplied', () => {
    const footprint = buildFootprint(sampleVertical({ focalLengthMm: undefined }))
    expect(footprint.flyingHeightM).toBeUndefined()
    expect(footprint.groundWidthM).toBeCloseTo(2400.3, 6)
  })

  it('produces a rotated polygon, not an axis-aligned bounding box', () => {
    const footprint = buildFootprint(sampleVertical(), {
      heading: { degrees: 30, convention: 'grid' },
    })
    const lngs = footprint.corners.map(([lng]) => lng)
    const lats = footprint.corners.map(([, lat]) => lat)
    // In an axis-aligned box each extreme is shared by two corners; in a rotated one it isn't.
    expect(new Set(lngs.map((v) => v.toFixed(6))).size).toBe(4)
    expect(new Set(lats.map((v) => v.toFixed(6))).size).toBe(4)
  })
})

describe('buildObliquePoint', () => {
  const oblique: ObliqueRecord = {
    kind: 'oblique',
    id: 'EPW012345',
    ref: parseGridRef('SK 421 849'),
    filmType: 'Black and White 35mm',
    provenance: { frameNumber: 'EPW012345' },
  }

  it('plots a point on WGS84 with the grid square’s uncertainty', () => {
    const point = buildObliquePoint(oblique)
    expect(distanceM(point.position, [-1.368131, 53.359754])).toBeLessThanOrEqual(5)
    expect(point.uncertaintyM).toBe(50)
  })

  it('offers no footprint, and explains why', () => {
    const point = buildObliquePoint(oblique)
    expect(point).not.toHaveProperty('corners')
    expect(point).not.toHaveProperty('groundWidthM')
    expect(point.notes.join(' ')).toMatch(/no ground extent can be derived/i)
  })
})
