import { describe, expect, it } from 'vitest'
import {
  formatGridRef,
  gridConvergenceDeg,
  gridToOsgb36,
  gridToWgs84,
  InvalidGridRefError,
  parseGridRef,
  trueBearingToGridBearing,
} from '../osgb'
import { distanceM } from './distance'

/** First row of the real Historic England sample; see INPUT-FORMAT.md §4. */
const SAMPLE = {
  ref: 'SK 421 849',
  easting: 442150,
  northing: 384950,
  wgs84: [-1.368131, 53.359754] as [number, number],
  osgb36: [-1.366593, 53.359478] as [number, number],
}

describe('parseGridRef precision', () => {
  it.each([
    // ref, easting, northing, precisionM
    ['SK', 450000, 350000, 100000],
    ['SK 3 7', 435000, 375000, 10000],
    ['SK 34 78', 434500, 378500, 1000],
    ['SK 421 849', 442150, 384950, 100],
    ['SK 3456 7890', 434565, 378905, 10],
    ['SK 34567 89012', 434567.5, 389012.5, 1],
  ])('%s is the centre of a %d m square', (text, easting, northing, precisionM) => {
    const ref = parseGridRef(text as string)
    expect(ref.easting).toBeCloseTo(easting as number, 6)
    expect(ref.northing).toBeCloseTo(northing as number, 6)
    expect(ref.precisionM).toBe(precisionM)
  })

  it('keeps the reference as supplied', () => {
    expect(parseGridRef('  SK 421 849 ').text).toBe('SK 421 849')
  })
})

describe('parseGridRef formatting tolerance', () => {
  const expected = parseGridRef('SK 421 849')

  it.each(['SK421849', 'sk 421 849', 'sk421849', 'SK  421   849', ' SK 421 849 ', 'Sk421 849'])(
    'reads %s the same way',
    (text) => {
      const ref = parseGridRef(text)
      expect(ref.easting).toBe(expected.easting)
      expect(ref.northing).toBe(expected.northing)
      expect(ref.precisionM).toBe(expected.precisionM)
    },
  )
})

describe('parseGridRef letter squares', () => {
  it.each([
    // The letter I is skipped in both positions, so SJ is west of SK, not east of it.
    ['SV', 0, 0],
    ['SJ', 300000, 300000],
    ['SK', 400000, 300000],
    ['TA', 500000, 400000],
    ['HP', 400000, 1200000],
    ['NN', 200000, 700000],
  ])('%s starts at E %d, N %d', (letters, easting, northing) => {
    const ref = parseGridRef(letters as string)
    // parseGridRef returns the centre of the 100 km square.
    expect(ref.easting - 50000).toBe(easting)
    expect(ref.northing - 50000).toBe(northing)
  })

  it('rejects the letter I in either position', () => {
    expect(() => parseGridRef('SI 421 849')).toThrow(InvalidGridRefError)
    expect(() => parseGridRef('IK 421 849')).toThrow(InvalidGridRefError)
    expect(() => parseGridRef('SI 421 849')).toThrow(/letter I/)
  })
})

describe('parseGridRef rejection', () => {
  it.each([
    ['', /empty/],
    ['   ', /empty/],
    ['not a grid reference', /two letters/],
    ['53.3597, -1.3681', /two letters/],
    ['SK 12345', /odd number/],
    ['SK 12 345', /easting has 2 digits and the northing 3/],
    ['SK 123 456 789', /one or two groups/],
    ['SK 123456 654321', /finer than 1 m/],
    ['SK 123456789012', /finer than 1 m/],
    ['AA 12 34', /not a National Grid square/],
    ['ZZ 12 34', /not a National Grid square/],
  ])('rejects %j', (text, reason) => {
    expect(() => parseGridRef(text)).toThrow(InvalidGridRefError)
    expect(() => parseGridRef(text)).toThrow(reason)
  })

  it('names the offending value so a ParseIssue can quote it', () => {
    expect(() => parseGridRef('SK 12345')).toThrow(/"SK 12345"/)
  })
})

describe('formatGridRef', () => {
  it('round-trips a six-figure reference', () => {
    expect(formatGridRef(parseGridRef(SAMPLE.ref), 6)).toBe('SK 421 849')
  })

  it.each([0, 2, 4, 6, 8, 10])('round-trips through %d figures', (digits) => {
    const original = formatGridRef({ easting: 442156.4, northing: 384952.8 }, digits)
    const reparsed = parseGridRef(original)
    // Re-formatting the parsed centre must land on the same square.
    expect(formatGridRef(reparsed, digits)).toBe(original)
  })

  it('matches the reference implementation’s worked example', () => {
    expect(formatGridRef({ easting: 651409, northing: 313177 }, 8)).toBe('TG 5140 1317')
    expect(formatGridRef({ easting: 651409, northing: 313177 }, 0)).toBe('TG')
  })

  it('pads leading zeros', () => {
    expect(formatGridRef({ easting: 400050, northing: 300050 }, 6)).toBe('SK 000 000')
  })

  it('rejects odd or out-of-range digit counts', () => {
    expect(() => formatGridRef({ easting: 442150, northing: 384950 }, 5)).toThrow(RangeError)
    expect(() => formatGridRef({ easting: 442150, northing: 384950 }, 12)).toThrow(RangeError)
  })

  it('rejects positions outside the National Grid', () => {
    expect(() => formatGridRef({ easting: -1, northing: 384950 })).toThrow(RangeError)
    expect(() => formatGridRef({ easting: 442150, northing: 1_400_000 })).toThrow(RangeError)
  })
})

describe('datum conversion', () => {
  it('converts the documented sample row to WGS84 within 5 m', () => {
    const got = gridToWgs84({ easting: SAMPLE.easting, northing: SAMPLE.northing })
    expect(distanceM(got, SAMPLE.wgs84)).toBeLessThanOrEqual(5)
  })

  it('converts an OS test point to WGS84 within 5 m', () => {
    // Caister Water Tower, an Ordnance Survey coordinate-transformation test point.
    const got = gridToWgs84({ easting: 651409.903, northing: 313177.27 })
    expect(distanceM(got, [1.716052, 52.657979])).toBeLessThanOrEqual(5)
  })

  it('still exposes the historic OSGB36 latitude/longitude', () => {
    const got = gridToOsgb36({ easting: SAMPLE.easting, northing: SAMPLE.northing })
    expect(distanceM(got, SAMPLE.osgb36)).toBeLessThanOrEqual(5)
  })

  it('applies the transform — the headline bug in the retired implementation', () => {
    // archive/MATHS.md §3: plotting OSGB36 straight onto a WGS84 basemap put this row 107 m out.
    const wgs84 = gridToWgs84({ easting: SAMPLE.easting, northing: SAMPLE.northing })
    const osgb36 = gridToOsgb36({ easting: SAMPLE.easting, northing: SAMPLE.northing })
    expect(distanceM(wgs84, osgb36)).toBeGreaterThan(100)
    expect(distanceM(wgs84, osgb36)).toBeLessThan(115)
  })

  it('shifts every part of Great Britain by 70–120 m', () => {
    const points = [
      { easting: 90000, northing: 12000 }, // Isles of Scilly
      { easting: 442150, northing: 384950 }, // Derbyshire
      { easting: 250000, northing: 650000 }, // Ayrshire
      { easting: 450000, northing: 1200000 }, // Shetland
    ]
    for (const point of points) {
      const shift = distanceM(gridToWgs84(point), gridToOsgb36(point))
      expect(shift).toBeGreaterThan(70)
      expect(shift).toBeLessThan(140)
    }
  })
})

describe('grid convergence', () => {
  it('is zero on the central meridian', () => {
    // E 400000 is 2°W, the National Grid's central meridian.
    expect(gridConvergenceDeg({ easting: 400000, northing: 500000 })).toBeCloseTo(0, 6)
  })

  it('is negative west of the central meridian and positive east of it', () => {
    expect(gridConvergenceDeg({ easting: 250000, northing: 650000 })).toBeLessThan(0)
    expect(gridConvergenceDeg({ easting: 651409, northing: 313177 })).toBeGreaterThan(0)
  })

  it('reaches a couple of degrees towards the edges of the grid', () => {
    // archive/MATHS.md §6 quotes −1.64° at 4°W, 55°N and ~4° at the extremities.
    const gamma = gridConvergenceDeg({ easting: 250000, northing: 650000 })
    expect(Math.abs(gamma)).toBeGreaterThan(1.5)
    expect(Math.abs(gamma)).toBeLessThan(4)
  })

  it('turns a true bearing into a grid bearing', () => {
    const point = { easting: 250000, northing: 650000 }
    const gamma = gridConvergenceDeg(point)
    expect(trueBearingToGridBearing(45, point)).toBeCloseTo(45 - gamma, 9)
    // Grid north and true north coincide on the central meridian.
    const onMeridian = { easting: 400000, northing: 500000 }
    expect(trueBearingToGridBearing(45, onMeridian)).toBeCloseTo(45, 4)
  })

  it('wraps into 0–360', () => {
    const point = { easting: 651409, northing: 313177 }
    expect(trueBearingToGridBearing(0, point)).toBeGreaterThanOrEqual(0)
    expect(trueBearingToGridBearing(0, point)).toBeLessThan(360)
  })
})
