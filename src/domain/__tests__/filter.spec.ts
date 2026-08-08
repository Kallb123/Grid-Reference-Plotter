/**
 * The listing filter.
 *
 * The interesting cases are all the same case: a frame the filter has no way of judging. An
 * oblique has no scale and no extent, a listing may give no date, and `"held"` carries codes
 * this app has not seen. None of those is evidence against the frame, so none of them may drop
 * it — and each has to be reported back, or the user reads a filtered listing as though every
 * frame on it passed every test.
 */

import { describe, expect, it } from 'vitest'
import { parseGridRef } from '../osgb'
import { ANY_FRAME, frameMatches, isFiltering } from '../filter'
import type { FrameFilter } from '../filter'
import type { ObliqueRecord, VerticalRecord } from '../types'

function vertical(overrides: Partial<VerticalRecord> = {}): VerticalRecord {
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
      date: '13 JUN 1967',
      held: 'P',
    },
    ...overrides,
  }
}

function oblique(overrides: Partial<ObliqueRecord> = {}): ObliqueRecord {
  return {
    kind: 'oblique',
    id: 'NMR 12345/06',
    ref: parseGridRef('SK 421 849'),
    provenance: { photoReference: 'NMR 12345/06', date: '02 MAY 1988', held: 'P' },
    ...overrides,
  }
}

function filter(overrides: Partial<FrameFilter> = {}): FrameFilter {
  return { ...ANY_FRAME, ...overrides }
}

describe('isFiltering', () => {
  it('is false for the filter that asks nothing', () => {
    expect(isFiltering(ANY_FRAME)).toBe(false)
  })

  it('is true as soon as any one criterion is set', () => {
    expect(isFiltering(filter({ minDetail: 1 }))).toBe(true)
    expect(isFiltering(filter({ fromYear: 1960 }))).toBe(true)
    expect(isFiltering(filter({ toYear: 1999 }))).toBe(true)
    expect(isFiltering(filter({ coverage: 'partial' }))).toBe(true)
    expect(isFiltering(filter({ printHeldOnly: true }))).toBe(true)
  })
})

describe('frameMatches', () => {
  it('keeps everything when nothing is asked', () => {
    expect(frameMatches(vertical(), null, ANY_FRAME)).toEqual({ keep: true, unjudged: [] })
    expect(frameMatches(oblique(), null, ANY_FRAME)).toEqual({ keep: true, unjudged: [] })
  })

  describe('detail', () => {
    it('keeps a frame at least as fine as the band asked for', () => {
      // Band 2 is 1:20 000 to 1:10 000, so a 1:10 500 frame is in it and a 1:2500 frame is finer.
      expect(frameMatches(vertical({ scaleDenominator: 10_500 }), null, filter({ minDetail: 2 })).keep).toBe(true)
      expect(frameMatches(vertical({ scaleDenominator: 2500 }), null, filter({ minDetail: 2 })).keep).toBe(true)
    })

    it('drops a frame coarser than the band asked for', () => {
      expect(frameMatches(vertical({ scaleDenominator: 25_000 }), null, filter({ minDetail: 2 })).keep).toBe(false)
      expect(frameMatches(vertical({ scaleDenominator: 10_500 }), null, filter({ minDetail: 4 })).keep).toBe(false)
    })

    it('keeps an oblique, which has no scale to judge, and says so', () => {
      // The same stance as hiding misses: no evidence of coarseness is not evidence of it, and
      // inventing a scale for an oblique is the offence this codebase refuses everywhere else.
      expect(frameMatches(oblique(), null, filter({ minDetail: 4 }))).toEqual({
        keep: true,
        unjudged: ['detail'],
      })
    })
  })

  describe('date', () => {
    it('is inclusive at both ends', () => {
      const sixties = filter({ fromYear: 1960, toYear: 1969 })
      expect(frameMatches(vertical({ provenance: { ...vertical().provenance, date: '01 JAN 1960' } }), null, sixties).keep).toBe(true)
      expect(frameMatches(vertical({ provenance: { ...vertical().provenance, date: '31 DEC 1969' } }), null, sixties).keep).toBe(true)
      expect(frameMatches(vertical({ provenance: { ...vertical().provenance, date: '01 JAN 1970' } }), null, sixties).keep).toBe(false)
      expect(frameMatches(vertical({ provenance: { ...vertical().provenance, date: '31 DEC 1959' } }), null, sixties).keep).toBe(false)
    })

    it('takes one bound on its own', () => {
      expect(frameMatches(vertical(), null, filter({ fromYear: 1970 })).keep).toBe(false)
      expect(frameMatches(vertical(), null, filter({ toYear: 1970 })).keep).toBe(true)
    })

    it('keeps an undated frame, and says it was not judged', () => {
      const undated = vertical({ provenance: { ...vertical().provenance, date: undefined } })
      expect(frameMatches(undated, null, filter({ fromYear: 1970 }))).toEqual({
        keep: true,
        unjudged: ['date'],
      })
    })
  })

  describe('coverage', () => {
    it('takes “part of it” to mean anything that reaches the site', () => {
      const some = filter({ coverage: 'partial' })
      expect(frameMatches(vertical(), 'full', some).keep).toBe(true)
      expect(frameMatches(vertical(), 'partial', some).keep).toBe(true)
      expect(frameMatches(vertical(), 'none', some).keep).toBe(false)
    })

    it('takes “all of it” literally', () => {
      const all = filter({ coverage: 'full' })
      expect(frameMatches(vertical(), 'full', all).keep).toBe(true)
      expect(frameMatches(vertical(), 'partial', all).keep).toBe(false)
      expect(frameMatches(vertical(), 'none', all).keep).toBe(false)
    })

    it('keeps a frame with no verdict — an oblique, or no site marked — and says so', () => {
      expect(frameMatches(oblique(), null, filter({ coverage: 'full' }))).toEqual({
        keep: true,
        unjudged: ['coverage'],
      })
      expect(frameMatches(vertical(), null, filter({ coverage: 'full' })).keep).toBe(true)
    })
  })

  describe('prints held', () => {
    it('reads the archive’s own codes', () => {
      const held = filter({ printHeldOnly: true })
      expect(frameMatches(vertical({ provenance: { ...vertical().provenance, held: 'P' } }), null, held).keep).toBe(true)
      expect(frameMatches(vertical({ provenance: { ...vertical().provenance, held: 'n' } }), null, held).keep).toBe(false)
    })

    it('keeps a frame whose code it does not recognise', () => {
      // Guessing which way an unseen code points would drop frames a customer could have ordered.
      const unknown = vertical({ provenance: { ...vertical().provenance, held: 'X' } })
      expect(frameMatches(unknown, null, filter({ printHeldOnly: true }))).toEqual({
        keep: true,
        unjudged: ['print'],
      })
      const missing = vertical({ provenance: { ...vertical().provenance, held: undefined } })
      expect(frameMatches(missing, null, filter({ printHeldOnly: true })).unjudged).toEqual(['print'])
    })
  })

  it('reports only the criteria that were actually asked for', () => {
    // An oblique has neither a scale nor a verdict, but a filter that asks about neither has
    // nothing left unanswered by it.
    expect(frameMatches(oblique(), null, filter({ fromYear: 1980 }))).toEqual({
      keep: true,
      unjudged: [],
    })
  })

  it('applies every criterion, not just the first one to bite', () => {
    const strict = filter({ minDetail: 2, fromYear: 1960, toYear: 1969, printHeldOnly: true })
    expect(frameMatches(vertical(), 'full', strict).keep).toBe(true)
    expect(
      frameMatches(vertical({ provenance: { ...vertical().provenance, held: 'N' } }), 'full', strict)
        .keep,
    ).toBe(false)
  })
})
