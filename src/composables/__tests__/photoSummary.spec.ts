import { describe, expect, it } from 'vitest'
import { coverageOf } from '../../domain/coverage'
import { buildFootprint, buildObliquePoint } from '../../domain/footprint'
import { gridToWgs84, parseGridRef } from '../../domain/osgb'
import type { AreaOfInterest, ObliqueRecord, VerticalRecord } from '../../domain/types'
import { ANY_FRAME } from '../../domain/filter'
import type { FrameFilter } from '../../domain/filter'
import {
  areaOfInterestSummary,
  describeFilter,
  describeTally,
  describeUnjudged,
  footprintSummary,
  formatArea,
  formatPosition,
  pointSummary,
} from '../photoSummary'

/** The worked example of INPUT-FORMAT.md §4. */
const verticalRecord: VerticalRecord = {
  kind: 'vertical',
  id: 'MAL/67055 frame 23',
  ref: parseGridRef('SK 421 849'),
  film: { widthMm: 228.6, heightMm: 228.6, description: 'Black and White 9 x 9' },
  scaleDenominator: 10500,
  focalLengthMm: 152.4,
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
}

const obliqueRecord: ObliqueRecord = {
  kind: 'oblique',
  id: 'EPW012345',
  ref: parseGridRef('SK 421 849'),
  filmType: 'Black and White 35mm',
  provenance: { photoReference: 'SK 4218/49', date: '21 MAY 1926' },
}

function valueOf(lines: readonly { label: string; value: string }[], label: string): string {
  return lines.find((line) => line.label === label)?.value ?? ''
}

describe('footprintSummary', () => {
  const summary = footprintSummary(buildFootprint(verticalRecord))

  it('leads with the frame’s identity and date', () => {
    expect(summary.title).toBe('MAL/67055 frame 23')
    expect(summary.subtitle).toBe('Vertical frame, 13 JUN 1967')
  })

  it('states the grid square’s uncertainty, not a bare position', () => {
    expect(valueOf(summary.lines, 'Centre point')).toBe('SK 421 849 (±50 m)')
  })

  it('gives the ground extent the supplier’s own guide would recognise', () => {
    // 0.2286 m × 10500 = 2400.3 m square.
    expect(valueOf(summary.lines, 'Ground extent')).toContain('2,400 × 2,400 m')
    expect(valueOf(summary.lines, 'Ground extent')).toContain('sq miles')
  })

  it('calls the scale nominal, because that is what it is', () => {
    expect(valueOf(summary.lines, 'Scale')).toBe('1:10,500 (nominal)')
  })

  it('reports the flying height above ground, in feet as well as metres', () => {
    // 0.1524 m × 10500 = 1600.2 m, the 5250 ft of INPUT-FORMAT.md §4.
    expect(valueOf(summary.lines, 'Flying height')).toBe('1,600 m above ground (5,250 ft)')
  })

  it('omits the flying height when no focal length was supplied', () => {
    const withoutFocalLength: VerticalRecord = { ...verticalRecord }
    delete withoutFocalLength.focalLengthMm
    const lines = footprintSummary(buildFootprint(withoutFocalLength)).lines
    expect(lines.some((line) => line.label === 'Flying height')).toBe(false)
  })

  it('keeps the ordering columns apart from the derived numbers', () => {
    expect(summary.lines.some((line) => line.label === 'Sortie')).toBe(false)
    expect(valueOf(summary.provenance, 'Sortie')).toBe('MAL/67055')
    expect(valueOf(summary.provenance, 'Library number')).toBe('4777')
    expect(valueOf(summary.provenance, 'Held')).toBe('P — print held')
  })

  it('carries the domain’s caveats through untouched', () => {
    expect(summary.notes).toEqual(buildFootprint(verticalRecord).notes)
    expect(summary.notes.join(' ')).toContain('nominal target')
  })
})

describe('pointSummary', () => {
  const summary = pointSummary(buildObliquePoint(obliqueRecord))

  it('is a position and an uncertainty, with no extent anywhere in it', () => {
    expect(summary.subtitle).toBe('Oblique photograph, 21 MAY 1926')
    expect(valueOf(summary.lines, 'Map reference')).toBe('SK 421 849 (±50 m)')
    expect(summary.lines.some((line) => line.label === 'Ground extent')).toBe(false)
    expect(summary.lines.some((line) => line.label === 'Scale')).toBe(false)
    expect(summary.notes.join(' ')).toContain('no ground extent can be derived')
  })

  it('leaves out fields an oblique listing does not carry', () => {
    expect(summary.provenance.some((line) => line.label === 'Sortie')).toBe(false)
    expect(valueOf(summary.provenance, 'Photo reference')).toBe('SK 4218/49')
  })
})

describe('summaries against a site', () => {
  const footprint = buildFootprint(verticalRecord)
  const point = buildObliquePoint(obliqueRecord)

  /** A pin `east` metres east of the frame's centre, which is E 442150, N 384950. */
  function pin(east: number): AreaOfInterest {
    return { kind: 'point', position: gridToWgs84({ easting: 442_150 + east, northing: 384_950 }) }
  }

  function summaryFor(east: number) {
    const coverage = coverageOf([footprint], [point], pin(east))
    return {
      frame: footprintSummary(footprint, coverage.frames.get(footprint.record.id) ?? null),
      oblique: pointSummary(point, coverage.obliques.get(point.record.id) ?? null),
    }
  }

  it('leads a frame with what it does about the site', () => {
    const { frame } = summaryFor(850)

    // Coverage is the first thing asked of a frame once a site exists, so it is the first thing
    // the summary says — ahead of the extent and the scale, which are how you choose between the
    // frames that have it.
    expect(frame.lines[0]?.label).toBe('Your site')
    expect(valueOf(frame.lines, 'Your site')).toBe('all of it is inside this frame')
    expect(valueOf(frame.lines, 'Edge margin')).toBe('350 m inside the nearest edge')
    expect(valueOf(frame.lines, 'Off centre')).toBe('850 m from the frame’s centre')
  })

  it('says plainly when a frame does not reach the site', () => {
    const { frame } = summaryFor(1_850)

    expect(valueOf(frame.lines, 'Your site')).toBe('none of it is inside this frame')
    expect(valueOf(frame.lines, 'Edge margin')).toBe('650 m outside the nearest edge')
  })

  it('warns when the verdict is inside the centre point’s own uncertainty', () => {
    // 20 m inside a frame positioned to ±50 m: the verdict is "covered", and it is not
    // something the data can actually tell from "not covered".
    const { frame } = summaryFor(1_180)

    expect(valueOf(frame.lines, 'Your site')).toBe('all of it is inside this frame')
    expect(frame.notes.join(' ')).toContain('on the edge')
    // The footprint's own caveats are still all there; the coverage's are added to them.
    expect(frame.notes.slice(0, buildFootprint(verticalRecord).notes.length)).toEqual(
      buildFootprint(verticalRecord).notes,
    )
  })

  it('gives an oblique a distance and refuses to call it coverage', () => {
    const { oblique } = summaryFor(500)

    expect(valueOf(oblique.lines, 'Your site')).toBe('500 m away — but see the note below')
    expect(oblique.notes.join(' ')).toContain('not to what it shows')
    expect(oblique.lines.some((line) => line.label === 'Edge margin')).toBe(false)
  })

  it('says nothing about a site when none has been marked', () => {
    expect(footprintSummary(footprint).lines.some((line) => line.label === 'Your site')).toBe(false)
    expect(pointSummary(point).lines.some((line) => line.label === 'Your site')).toBe(false)
  })
})

describe('areaOfInterestSummary', () => {
  it('describes a pin in the terms the rest of the app is in', () => {
    const summary = areaOfInterestSummary({
      kind: 'point',
      position: gridToWgs84({ easting: 442_150, northing: 384_950 }),
    })

    expect(summary.title).toBe('Dropped pin')
    // Eight figures, not six: this is a position the user chose, and rounding it to the
    // catalogue's 100 m squares would throw away precision they actually have.
    expect(valueOf(summary.lines, 'Grid reference')).toBe('SK 4215 8495')
    expect(valueOf(summary.lines, 'Position')).toContain('53.359')
    expect(summary.lines.some((line) => line.label === 'Area')).toBe(false)
  })

  it('describes an outline by its corners and the ground it encloses', () => {
    const summary = areaOfInterestSummary({
      kind: 'polygon',
      ring: [
        gridToWgs84({ easting: 442_000, northing: 384_800 }),
        gridToWgs84({ easting: 442_400, northing: 384_800 }),
        gridToWgs84({ easting: 442_400, northing: 385_200 }),
        gridToWgs84({ easting: 442_000, northing: 385_200 }),
      ],
    })

    expect(summary.title).toBe('Drawn outline')
    expect(valueOf(summary.lines, 'Corners')).toBe('4')
    // 400 m square is 16 hectares — hectares, because `0.16 km²` is not how a site is measured.
    expect(valueOf(summary.lines, 'Area')).toBe('16.0 ha')
  })

  it('rounds to the nearest metre before naming the square', () => {
    // The position has been through the datum transform and back, which leaves a couple of
    // millimetres of error; a grid reference truncates, so without the rounding a pin dropped on
    // a 10 m boundary would read as the square below it.
    const boundary = areaOfInterestSummary({
      kind: 'point',
      position: gridToWgs84({ easting: 442_150, northing: 384_950 }),
    })
    expect(valueOf(boundary.lines, 'Grid reference')).toBe('SK 4215 8495')
  })
})

describe('describeTally', () => {
  it('counts the frames that cover the site, and names the population it counted', () => {
    expect(describeTally({ full: 18, partial: 5, none: 7 })).toBe(
      '18 of 30 vertical frames cover all of your site, 5 cover part of it, 7 miss it.',
    )
  })

  it('leaves out the clauses that would say zero', () => {
    expect(describeTally({ full: 3, partial: 0, none: 0 })).toBe(
      '3 of 3 vertical frames cover all of your site.',
    )
  })

  it('says so when there is nothing with an extent to compare', () => {
    // An obliques-only listing. Nothing in it can be measured, and a tally of zeroes would read
    // as though every frame had been checked and failed.
    expect(describeTally({ full: 0, partial: 0, none: 0 })).toContain('No frame in this listing')
  })
})

describe('describeFilter', () => {
  const filter = (overrides: Partial<FrameFilter> = {}): FrameFilter => ({
    ...ANY_FRAME,
    ...overrides,
  })

  it('says nothing about a filter that asks nothing', () => {
    expect(describeFilter(ANY_FRAME)).toEqual([])
  })

  it('states the detail threshold as the floor it is', () => {
    expect(describeFilter(filter({ minDetail: 3 }))).toEqual(['1:10,000 or finer'])
  })

  it('writes a half-open year range as the half-open thing it is', () => {
    expect(describeFilter(filter({ fromYear: 1960 }))).toEqual(['1960 onwards'])
    expect(describeFilter(filter({ toYear: 1979 }))).toEqual(['up to 1979'])
    expect(describeFilter(filter({ fromYear: 1960, toYear: 1969 }))).toEqual(['1960 to 1969'])
    // One year asked for at both ends is one year, not a range from itself to itself.
    expect(describeFilter(filter({ fromYear: 1967, toYear: 1967 }))).toEqual(['1967'])
  })

  it('lists every criterion that is set', () => {
    expect(
      describeFilter(filter({ minDetail: 5, toYear: 1979, coverage: 'full', printHeldOnly: true })),
    ).toEqual(['1:2,500 or finer', 'up to 1979', 'covering all of your site', 'print held'])
  })
})

describe('describeUnjudged', () => {
  it('says nothing when every frame on screen was tested', () => {
    expect(describeUnjudged([], 0)).toBeNull()
    expect(describeUnjudged(['detail'], 0)).toBeNull()
  })

  it('names the reason a frame was kept without being tested', () => {
    // The alternative is a narrowed listing whose every row looks like it passed every filter.
    expect(describeUnjudged(['detail'], 1)).toBe(
      '1 frame is shown without being tested: an oblique carries no scale to judge detail by.',
    )
  })

  it('joins several reasons into one sentence', () => {
    expect(describeUnjudged(['detail', 'date', 'print'], 4)).toBe(
      '4 frames are shown without being tested: an oblique carries no scale to judge detail by, ' +
        'some rows give no date and some rows carry a “held” code this app does not recognise.',
    )
  })
})

describe('formatting', () => {
  it('writes a position with a hemisphere rather than a minus sign', () => {
    expect(formatPosition([-1.368131, 53.359754])).toBe('53.35975° N, 1.36813° W')
    expect(formatPosition([1.5, -0.5])).toBe('0.50000° S, 1.50000° E')
  })

  it('agrees with the archive’s own scale-to-area table', () => {
    // INPUT-FORMAT.md §4: 1:2500 ≈ 0.13 sq miles, 1:10 000 ≈ 2, 1:15 000 ≈ 4.5.
    expect(formatArea(571.5 * 571.5)).toContain('0.13 sq miles')
    expect(formatArea(2286 * 2286)).toContain('2.0 sq miles')
    expect(formatArea(3429 * 3429)).toContain('4.5 sq miles')
  })
})
