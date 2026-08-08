/**
 * Coverage of an area of interest.
 *
 * The frame under test throughout is the worked example of INPUT-FORMAT.md §4: a 9″ frame at
 * 1:10500 centred on `SK 421 849`, which is a 2400.3 m square centred on E 442150, N 384950. Its
 * edges are therefore 1200.15 m from its centre, and every expected clearance below is a
 * subtraction from that number.
 *
 * Areas of interest are built by converting known grid positions *to* WGS84 and handing those in,
 * because that is the direction the map works in: the user drops a pin in WGS84 and the domain
 * has to bring it back to the grid. Doing it this way puts the round trip under test as well as
 * the geometry — if the datum transform were skipped in either direction, these numbers would be
 * out by the 70–120 m the transform is worth.
 */

import { describe, expect, it } from 'vitest'
import { coverFrame, coverageOf, proximityOfPoint, siteGeometry } from '../coverage'
import { buildFootprint, buildObliquePoint } from '../footprint'
import { gridToWgs84, parseGridRef } from '../osgb'
import type { AreaOfInterest, LngLat, ObliqueRecord, VerticalRecord } from '../types'

const FRAME_CENTRE = { easting: 442_150, northing: 384_950 }
/** Half of the 2400.3 m square: the distance from the centre to any edge. */
const HALF_FRAME = 1_200.15

function verticalRecord(overrides: Partial<VerticalRecord> = {}): VerticalRecord {
  return {
    kind: 'vertical',
    id: 'MAL/67055 frame 23',
    ref: parseGridRef('SK 421 849'),
    film: { widthMm: 228.6, heightMm: 228.6, description: 'Black and White 9 x 9' },
    scaleDenominator: 10_500,
    focalLengthMm: 152.4,
    provenance: {
      sortieNumber: 'MAL/67055',
      libraryNumber: '4777',
      cameraPosition: 'V',
      frameNumber: '23',
    },
    ...overrides,
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

const frame = buildFootprint(verticalRecord())

/** A WGS84 position for a grid offset from the frame's centre, in metres. */
function at(east: number, north: number): LngLat {
  return gridToWgs84({ easting: FRAME_CENTRE.easting + east, northing: FRAME_CENTRE.northing + north })
}

function pin(east: number, north: number): AreaOfInterest {
  return { kind: 'point', position: at(east, north) }
}

/** A square site of side `side` metres, centred `east`/`north` metres from the frame's centre. */
function siteSquare(east: number, north: number, side: number): AreaOfInterest {
  const half = side / 2
  return {
    kind: 'polygon',
    ring: [
      at(east - half, north - half),
      at(east + half, north - half),
      at(east + half, north + half),
      at(east - half, north + half),
    ],
  }
}

describe('siteGeometry', () => {
  it('brings a pin back to the National Grid', () => {
    const site = siteGeometry(pin(0, 0))

    // Round-tripped through the Helmert transform, so millimetres rather than metres.
    expect(site.centre.easting).toBeCloseTo(FRAME_CENTRE.easting, 1)
    expect(site.centre.northing).toBeCloseTo(FRAME_CENTRE.northing, 1)
    // A pin is a position, not an extent. Nothing here invents a radius for it.
    expect(site.areaM2).toBe(0)
    expect(site.vertices).toHaveLength(1)
  })

  it('measures a drawn outline in ground metres', () => {
    const site = siteGeometry(siteSquare(0, 0, 400))

    expect(site.areaM2).toBeCloseTo(160_000, 0)
    expect(site.centre.easting).toBeCloseTo(FRAME_CENTRE.easting, 1)
    expect(site.vertices).toHaveLength(4)
  })

  it('carries a degenerate outline through as a position rather than failing', () => {
    const site = siteGeometry({ kind: 'polygon', ring: [at(-100, 0), at(100, 0)] })

    expect(site.areaM2).toBe(0)
    expect(site.centre.easting).toBeCloseTo(FRAME_CENTRE.easting, 1)
  })

  it('refuses an outline with no vertices at all', () => {
    expect(() => siteGeometry({ kind: 'polygon', ring: [] })).toThrow(RangeError)
  })
})

describe('coverFrame, for a dropped pin', () => {
  it('covers a pin inside the frame, and says how much room is left', () => {
    const coverage = coverFrame(frame, siteGeometry(pin(850, 0)))

    expect(coverage.id).toBe('MAL/67055 frame 23')
    expect(coverage.verdict).toBe('full')
    expect(coverage.coveredFraction).toBe(1)
    // 1200.15 m to the eastern edge, 850 m of it used up.
    expect(coverage.edgeClearanceM).toBeCloseTo(HALF_FRAME - 850, 1)
    expect(coverage.offCentreM).toBeCloseTo(850, 1)
    expect(coverage.marginal).toBe(false)
  })

  it('misses a pin outside the frame, and says by how far', () => {
    const coverage = coverFrame(frame, siteGeometry(pin(1_850, 0)))

    expect(coverage.verdict).toBe('none')
    expect(coverage.coveredFraction).toBe(0)
    // Negative: the clearance is the size of the miss.
    expect(coverage.edgeClearanceM).toBeCloseTo(-(1_850 - HALF_FRAME), 1)
  })

  it('never reports a pin as partly covered — it has no area to split', () => {
    for (const east of [0, 1_200, 1_201, 5_000]) {
      expect(coverFrame(frame, siteGeometry(pin(east, 0))).verdict).not.toBe('partial')
    }
  })

  it('flags a pin nearer the edge than the centre point’s own uncertainty', () => {
    // 20 m inside the frame, on a centre point that is only known to ±50 m. The verdict is
    // "inside", but the data cannot tell that from "outside", and the note has to say so.
    const coverage = coverFrame(frame, siteGeometry(pin(HALF_FRAME - 20, 0)))

    expect(coverage.verdict).toBe('full')
    expect(coverage.marginal).toBe(true)
    expect(coverage.notes.join(' ')).toContain('on the edge')
  })
})

describe('coverFrame, for a drawn outline', () => {
  it('covers an outline that fits well inside', () => {
    const coverage = coverFrame(frame, siteGeometry(siteSquare(0, 0, 400)))

    expect(coverage.verdict).toBe('full')
    expect(coverage.coveredFraction).toBeCloseTo(1, 6)
    expect(coverage.coveredAreaM2).toBeCloseTo(160_000, 0)
    // From the site's edge, not its centre: 1200.15 m less the site's own 200 m half-width.
    expect(coverage.edgeClearanceM).toBeCloseTo(HALF_FRAME - 200, 1)
    expect(coverage.offCentreM).toBeCloseTo(0, 1)
  })

  it('reports the fraction covered when the site straddles an edge', () => {
    // A 400 m square centred exactly on the frame's eastern edge: half in, half out.
    const coverage = coverFrame(frame, siteGeometry(siteSquare(HALF_FRAME, 0, 400)))

    expect(coverage.verdict).toBe('partial')
    expect(coverage.coveredFraction).toBeCloseTo(0.5, 3)
    expect(coverage.coveredAreaM2).toBeCloseTo(80_000, -1)
    // Straddling the edge is zero clearance — this is the case the archive's guide warns about.
    expect(coverage.edgeClearanceM).toBe(0)
    expect(coverage.marginal).toBe(true)
  })

  it('counts only the overlap when a corner of the site clips a corner of the frame', () => {
    // The site's south-west quarter overlaps the frame's north-east corner: a quarter of it.
    const coverage = coverFrame(frame, siteGeometry(siteSquare(HALF_FRAME, HALF_FRAME, 400)))

    expect(coverage.verdict).toBe('partial')
    expect(coverage.coveredFraction).toBeCloseTo(0.25, 3)
  })

  it('misses an outline outside the frame, and says by how far', () => {
    const coverage = coverFrame(frame, siteGeometry(siteSquare(2_850, 0, 400)))

    expect(coverage.verdict).toBe('none')
    expect(coverage.coveredFraction).toBe(0)
    expect(coverage.coveredAreaM2).toBe(0)
    // Gap between the two shapes: the site's western side is at 2650, the frame's edge at 1200.15.
    expect(coverage.edgeClearanceM).toBeCloseTo(-(2_650 - HALF_FRAME), 1)
  })

  it('measures a concave outline by its own area, not its bounding box', () => {
    // An L covering the frame's north-eastern quadrant and reaching out past its eastern edge.
    // Its bounding box would straddle differently from the shape itself.
    const l: AreaOfInterest = {
      kind: 'polygon',
      ring: [at(1_000, 0), at(1_400, 0), at(1_400, 200), at(1_200, 200), at(1_200, 400), at(1_000, 400)],
    }
    const coverage = coverFrame(frame, siteGeometry(l))
    const site = siteGeometry(l)

    // The L is 400 × 400 less a 200 × 200 bite: 120 000 m². Everything west of 1200.15 is inside,
    // which is the 200 × 400 lower-left block plus the 200 × 400 upper-left one, less the bite.
    expect(site.areaM2).toBeCloseTo(120_000, -1)
    expect(coverage.verdict).toBe('partial')
    expect(coverage.coveredAreaM2).toBeGreaterThan(80_000)
    expect(coverage.coveredAreaM2).toBeLessThan(site.areaM2)
  })

  it('carries the caveat that a frame’s extent is indicative', () => {
    expect(coverFrame(frame, siteGeometry(pin(0, 0))).notes.join(' ')).toContain('indicative')
  })
})

describe('proximityOfPoint', () => {
  it('measures from the site to the point the oblique is catalogued under', () => {
    const oblique = buildObliquePoint(obliqueRecord('SK 430 855'))
    // SK 430 855 is E 443050, N 385550: 900 m east and 600 m north of the frame's centre.
    const proximity = proximityOfPoint(oblique, siteGeometry(pin(0, 0)))

    expect(proximity.id).toBe('EPW012345 SK 430 855')
    expect(proximity.distanceM).toBeCloseTo(Math.hypot(900, 600), 0)
  })

  it('is zero when the oblique’s reference falls inside a drawn outline', () => {
    const oblique = buildObliquePoint(obliqueRecord('SK 421 849'))
    expect(proximityOfPoint(oblique, siteGeometry(siteSquare(0, 0, 400))).distanceM).toBe(0)
  })

  it('says that a distance is not coverage', () => {
    const oblique = buildObliquePoint(obliqueRecord())
    expect(proximityOfPoint(oblique, siteGeometry(pin(0, 0))).notes.join(' ')).toContain(
      'not to what it shows',
    )
  })
})

describe('coverageOf', () => {
  it('measures every frame and tallies the verdicts', () => {
    const frames = [
      // Centred on the site, so it contains it.
      buildFootprint(verticalRecord({ id: 'covers' })),
      // A 1:2500 frame is 571.5 m square, so a 400 m site centred on its edge only half fits.
      buildFootprint(
        verticalRecord({ id: 'clips', scaleDenominator: 2_500, ref: parseGridRef('SK 424 849') }),
      ),
      // Five kilometres away.
      buildFootprint(verticalRecord({ id: 'misses', ref: parseGridRef('SK 471 849') })),
    ]
    const obliques = [buildObliquePoint(obliqueRecord('SK 430 855'))]

    const coverage = coverageOf(frames, obliques, siteSquare(0, 0, 400))

    expect(coverage.frames.get('covers')?.verdict).toBe('full')
    expect(coverage.frames.get('clips')?.verdict).toBe('partial')
    expect(coverage.frames.get('misses')?.verdict).toBe('none')
    expect(coverage.tally).toEqual({ full: 1, partial: 1, none: 1 })

    // Obliques are measured, but as a distance — they are never given a verdict.
    expect(coverage.obliques.get('EPW012345 SK 430 855')?.distanceM).toBeGreaterThan(0)
    expect(coverage.frames.has('EPW012345 SK 430 855')).toBe(false)
  })

  it('handles a listing with nothing in it', () => {
    const coverage = coverageOf([], [], pin(0, 0))

    expect(coverage.frames.size).toBe(0)
    expect(coverage.obliques.size).toBe(0)
    expect(coverage.tally).toEqual({ full: 0, partial: 0, none: 0 })
  })
})
