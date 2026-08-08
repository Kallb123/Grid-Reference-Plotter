/**
 * The bookkeeping around the wizard's answers.
 *
 * Which frames pass is tested in `src/domain/__tests__/filter.spec.ts`; what matters here is
 * what the views are told about it — that the hidden set and the counts agree with each other,
 * that the wizard is only offered questions this listing can answer, and that a frame kept
 * because nothing could judge it is reported rather than counted as a pass.
 */

import { describe, expect, it } from 'vitest'
import { nextTick, shallowRef } from 'vue'
import { coverageOf } from '../../domain/coverage'
import { buildFootprint, buildObliquePoint } from '../../domain/footprint'
import { gridToWgs84, parseGridRef } from '../../domain/osgb'
import type { SiteCoverage } from '../../domain/coverage'
import type {
  Footprint,
  ObliqueRecord,
  PlottedPoint,
  Provenance,
  VerticalRecord,
} from '../../domain/types'
import { useFrameFilter } from '../useFrameFilter'

/** The worked example of INPUT-FORMAT.md §4: a 2400.3 m square centred on E 442150, N 384950. */
function vertical(
  id: string,
  scaleDenominator = 10_500,
  provenance: Partial<Provenance> = {},
): VerticalRecord {
  return {
    kind: 'vertical',
    id,
    ref: parseGridRef('SK 421 849'),
    film: { widthMm: 228.6, heightMm: 228.6, description: 'Black and White 9 x 9' },
    scaleDenominator,
    focalLengthMm: 152.4,
    provenance: {
      sortieNumber: 'MAL/67055',
      libraryNumber: '4777',
      cameraPosition: 'V',
      frameNumber: '23',
      date: '13 JUN 1967',
      held: 'P',
      ...provenance,
    },
  }
}

function oblique(id: string, date = '02 MAY 1988'): ObliqueRecord {
  return { kind: 'oblique', id, ref: parseGridRef('SK 421 849'), provenance: { date } }
}

function state(
  footprints: readonly Footprint[] = [],
  points: readonly PlottedPoint[] = [],
  coverage: SiteCoverage | null = null,
) {
  return useFrameFilter(shallowRef(footprints), shallowRef(points), shallowRef(coverage))
}

describe('useFrameFilter', () => {
  it('starts asking nothing, and so hides nothing', () => {
    const filter = state([buildFootprint(vertical('a'))], [buildObliquePoint(oblique('b'))])

    expect(filter.isActive.value).toBe(false)
    expect(filter.hiddenIds.value.size).toBe(0)
    expect(filter.matched.value).toBe(2)
    expect(filter.total.value).toBe(2)
    expect(filter.keep('a')).toBe(true)
    expect(filter.keep('b')).toBe(true)
  })

  it('hides the frames that fail, and counts the ones that remain', () => {
    const filter = state([
      buildFootprint(vertical('fine', 2500)),
      buildFootprint(vertical('coarse', 25_000)),
    ])

    // Band 3 is 1:10 000 to 1:5000, so only the 1:2500 frame is at least that detailed.
    filter.set({ minDetail: 3 })

    expect(filter.isActive.value).toBe(true)
    expect([...filter.hiddenIds.value]).toEqual(['coarse'])
    expect(filter.matched.value).toBe(1)
    expect(filter.keep('fine')).toBe(true)
    expect(filter.keep('coarse')).toBe(false)
  })

  it('changes one criterion without disturbing the others', () => {
    const filter = state([buildFootprint(vertical('a'))])

    filter.set({ minDetail: 2 })
    filter.set({ printHeldOnly: true })

    expect(filter.filter.value.minDetail).toBe(2)
    expect(filter.filter.value.printHeldOnly).toBe(true)

    filter.clear()
    expect(filter.isActive.value).toBe(false)
    expect(filter.filter.value.minDetail).toBe(0)
  })

  it('reports the frames it kept without being able to judge them', () => {
    const filter = state([buildFootprint(vertical('a', 2500))], [buildObliquePoint(oblique('b'))])

    filter.set({ minDetail: 4 })

    // The oblique carries no scale, so the request says nothing about it: it stays, and the
    // count says one frame on screen was never tested.
    expect(filter.keep('b')).toBe(true)
    expect(filter.unjudged.value).toEqual(['detail'])
    expect(filter.unjudgedCount.value).toBe(1)
  })

  it('reports nothing unjudged when nothing was asked that a frame cannot answer', () => {
    const filter = state([buildFootprint(vertical('a'))], [buildObliquePoint(oblique('b'))])

    filter.set({ fromYear: 1960 })

    expect(filter.unjudged.value).toEqual([])
    expect(filter.unjudgedCount.value).toBe(0)
  })

  describe('what the listing can be asked', () => {
    it('offers detail only where there is a scale, and dates only where there are dates', () => {
      const undated = state([], [buildObliquePoint(oblique('b', ''))])

      expect(undated.available.value.detail).toBe(false)
      expect(undated.available.value.date).toBe(false)

      const listing = state([buildFootprint(vertical('a'))])
      expect(listing.available.value.detail).toBe(true)
      expect(listing.available.value.date).toBe(true)
    })

    it('offers coverage only once a site has been marked', () => {
      const footprints = [buildFootprint(vertical('a'))]
      expect(state(footprints).available.value.coverage).toBe(false)

      const site = coverageOf(footprints, [], {
        kind: 'point',
        position: gridToWgs84({ easting: 442_150, northing: 384_950 }),
      })
      expect(state(footprints, [], site).available.value.coverage).toBe(true)
    })

    it('offers prints only where a row carries a code it recognises', () => {
      const printOf = (held: string | undefined): boolean =>
        state([buildFootprint(vertical('a', 10_500, { held }))]).available.value.print

      expect(printOf('P')).toBe(true)
      expect(printOf('N')).toBe(true)
      // A code this app has not seen is not an answer either way, so the control is not offered.
      expect(printOf('X')).toBe(false)
      expect(printOf(undefined)).toBe(false)
    })
  })

  it('reads the years off the listing, in order and without repeats', () => {
    const filter = state(
      [
        buildFootprint(vertical('a', 10_500, { date: '13 JUN 1967' })),
        buildFootprint(vertical('b', 10_500, { date: '02 SEP 1971' })),
        buildFootprint(vertical('c', 10_500, { date: '14 JUN 1967' })),
      ],
      [buildObliquePoint(oblique('d', '02 MAY 1988'))],
    )

    expect(filter.years.value).toEqual([1967, 1971, 1988])
  })

  it('counts frames at each detail band or finer, so the slider can report as it moves', () => {
    const filter = state([
      buildFootprint(vertical('landscape', 50_000)),
      buildFootprint(vertical('district', 10_500)),
      buildFootprint(vertical('plot', 2500)),
    ])

    // Cumulative from the coarse end: everything is at least as detailed as band 0.
    expect(filter.framesAtLeastDetail.value).toEqual([3, 2, 2, 1, 1, 1])
    expect(filter.scaleSpan.value).toEqual({ coarsest: 50_000, finest: 2500 })
  })

  it('has no scale span for a listing that carries no scales', () => {
    expect(state([], [buildObliquePoint(oblique('b'))]).scaleSpan.value).toBeNull()
  })

  it('starts a new listing unfiltered', async () => {
    // The answers were given about the previous file — its years, its scales. Carried over they
    // would hide a listing for a reason that is no longer true.
    const footprints = shallowRef<readonly Footprint[]>([buildFootprint(vertical('a', 2500))])
    const filter = useFrameFilter(footprints, shallowRef([]), shallowRef(null))

    filter.set({ minDetail: 5, fromYear: 1967 })
    expect(filter.isActive.value).toBe(true)

    footprints.value = [buildFootprint(vertical('b', 25_000, { date: '02 SEP 1971' }))]
    await nextTick()

    expect(filter.isActive.value).toBe(false)
    expect(filter.keep('b')).toBe(true)
  })
})
