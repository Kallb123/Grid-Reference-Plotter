/**
 * Scale bands.
 *
 * There is no arithmetic to check here, which makes the structural properties the whole test:
 * the bands have to tile the scales with no gap and no overlap, they have to run in one
 * direction, and a survey flown at a boundary scale has to land in a band a customer would
 * expect. Get any of those wrong and the slider quietly hides frames the user asked for.
 */

import { describe, expect, it } from 'vitest'
import {
  DETAIL_BANDS,
  FINEST_DETAIL_INDEX,
  detailBand,
  detailBandIndex,
  detailBandRange,
  detailBandScaleText,
  detailThresholdText,
  formatScale,
} from '../detail'

describe('DETAIL_BANDS', () => {
  it('runs coarsest first, with strictly finer boundaries', () => {
    const boundaries = DETAIL_BANDS.map((band) => band.coarsestDenominator)
    expect(boundaries[0]).toBe(Infinity)
    for (let index = 1; index < boundaries.length; index += 1) {
      expect(boundaries[index]).toBeLessThan(Number(boundaries[index - 1]))
    }
  })

  it('tiles the scales with no gap between one band and the next', () => {
    for (let index = 0; index < FINEST_DETAIL_INDEX; index += 1) {
      // The fine end of a band is exactly the coarse end of the next one, and that boundary
      // scale belongs to the finer band — so nothing can fall between two bands.
      expect(detailBandRange(index).finest).toBe(detailBandRange(index + 1).coarsest)
    }
    expect(detailBandRange(FINEST_DETAIL_INDEX).finest).toBe(0)
  })

  it('describes every band, at both ends of the trade', () => {
    for (const band of DETAIL_BANDS) {
      expect(band.label.length).toBeGreaterThan(0)
      // Both halves, on every band: a slider whose descriptions only improved as it moved right
      // would read as a quality setting rather than as the trade it is.
      expect(band.visible.length).toBeGreaterThan(0)
      expect(band.cost.length).toBeGreaterThan(0)
    }
    expect(new Set(DETAIL_BANDS.map((band) => band.key)).size).toBe(DETAIL_BANDS.length)
  })
})

describe('detailBandIndex', () => {
  it('puts a survey at a boundary scale in the finer band', () => {
    // A 1:2500 survey is a 1:2500 survey; reading it as the band that *ends* at 1:2500 would
    // drop the sample's finest frames out of a request for exactly that scale.
    expect(detailBand(2500).key).toBe('plot')
    expect(detailBand(2501).key).toBe('street')
    expect(detailBand(5000).key).toBe('street')
    expect(detailBand(10_000).key).toBe('neighbourhood')
    expect(detailBand(20_000).key).toBe('district')
    expect(detailBand(40_000).key).toBe('town')
  })

  it('places the scales the Historic England sample actually contains', () => {
    // INPUT-FORMAT.md §4: the sample runs 1:2500 to 1:12 000.
    expect(detailBand(2500).key).toBe('plot')
    expect(detailBand(7000).key).toBe('neighbourhood')
    expect(detailBand(10_500).key).toBe('district')
    expect(detailBand(12_000).key).toBe('district')
  })

  it('has a band for anything coarser or finer than the boundaries', () => {
    expect(detailBandIndex(63_360)).toBe(0)
    expect(detailBandIndex(1_000_000)).toBe(0)
    expect(detailBandIndex(1250)).toBe(FINEST_DETAIL_INDEX)
    expect(detailBandIndex(1)).toBe(FINEST_DETAIL_INDEX)
  })

  it('refuses a scale that is not a positive number', () => {
    // The parser rejects these rows outright, so reaching here with one means something upstream
    // stopped validating — and a silent band would hide that.
    expect(() => detailBandIndex(0)).toThrow(RangeError)
    expect(() => detailBandIndex(-2500)).toThrow(RangeError)
    expect(() => detailBandIndex(Number.NaN)).toThrow(RangeError)
  })
})

describe('the wording', () => {
  it('leaves the outer bands open-ended rather than inventing a limit', () => {
    expect(detailBandScaleText(0)).toBe('1:40,000 and coarser')
    expect(detailBandScaleText(FINEST_DETAIL_INDEX)).toBe('1:2,500 and finer')
  })

  it('states an inner band as the span it covers', () => {
    expect(detailBandScaleText(2)).toBe('1:20,000 to 1:10,000')
  })

  it('reads the slider as a floor, and its first position as no filter at all', () => {
    expect(detailThresholdText(0)).toBe('Any scale')
    expect(detailThresholdText(3)).toBe('1:10,000 or finer')
    expect(detailThresholdText(FINEST_DETAIL_INDEX)).toBe('1:2,500 or finer')
  })

  it('formats a denominator the way the catalogue reads', () => {
    expect(formatScale(2500)).toBe('1:2,500')
    expect(formatScale(10_500)).toBe('1:10,500')
  })
})
