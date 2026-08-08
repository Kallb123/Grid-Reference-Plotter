/**
 * Marking a site, and the bookkeeping the two views share around it.
 *
 * The coverage arithmetic is tested in `src/domain/__tests__/coverage.spec.ts`; what matters here
 * is that it is asked for at the right moments — when the site changes and when the listing does —
 * and that the filter which hides frames only ever hides frames that were actually measured.
 */

import { describe, expect, it } from 'vitest'
import { shallowRef } from 'vue'
import { buildFootprint, buildObliquePoint } from '../../domain/footprint'
import { gridToWgs84, parseGridRef } from '../../domain/osgb'
import type { Footprint, LngLat, ObliqueRecord, PlottedPoint, VerticalRecord } from '../../domain/types'
import { MINIMUM_OUTLINE_VERTICES, useAreaOfInterest } from '../useAreaOfInterest'

/** The worked example of INPUT-FORMAT.md §4: a 2400.3 m square centred on E 442150, N 384950. */
function vertical(id: string, centrePoint = 'SK 421 849'): VerticalRecord {
  return {
    kind: 'vertical',
    id,
    ref: parseGridRef(centrePoint),
    film: { widthMm: 228.6, heightMm: 228.6, description: 'Black and White 9 x 9' },
    scaleDenominator: 10_500,
    focalLengthMm: 152.4,
    provenance: {
      sortieNumber: 'MAL/67055',
      libraryNumber: '4777',
      cameraPosition: 'V',
      frameNumber: '23',
    },
  }
}

function oblique(id: string, mapReference = 'SK 421 849'): ObliqueRecord {
  return { kind: 'oblique', id, ref: parseGridRef(mapReference), provenance: {} }
}

/** A WGS84 position for a National Grid easting and northing. */
function at(easting: number, northing: number): LngLat {
  return gridToWgs84({ easting, northing })
}

const FRAME_CENTRE = at(442_150, 384_950)

function state(
  footprints: readonly Footprint[] = [buildFootprint(vertical('covers'))],
  points: readonly PlottedPoint[] = [],
) {
  return useAreaOfInterest(shallowRef(footprints), shallowRef(points))
}

describe('useAreaOfInterest', () => {
  it('starts with no site and nothing to say about the frames', () => {
    const site = state()

    expect(site.area.value).toBeNull()
    expect(site.hasArea.value).toBe(false)
    expect(site.coverage.value).toBeNull()
    expect(site.coverageFor('covers')).toBeNull()
    // With no site to miss, nothing misses — and nothing is hidden.
    expect(site.misses('covers')).toBe(false)
    expect(site.keep('covers')).toBe(true)
  })

  it('measures every frame as soon as a pin is dropped', () => {
    const site = state([
      buildFootprint(vertical('covers')),
      buildFootprint(vertical('misses', 'SK 471 849')),
    ])

    site.setPin(FRAME_CENTRE)

    expect(site.hasArea.value).toBe(true)
    expect(site.coverageFor('covers')?.verdict).toBe('full')
    expect(site.coverageFor('misses')?.verdict).toBe('none')
    expect(site.coverage.value?.tally).toEqual({ full: 1, partial: 0, none: 1 })
  })

  it('re-measures when a different listing is loaded under the same site', () => {
    const footprints = shallowRef<readonly Footprint[]>([buildFootprint(vertical('first'))])
    const site = useAreaOfInterest(footprints, shallowRef([]))
    site.setPin(FRAME_CENTRE)

    expect(site.coverageFor('first')?.verdict).toBe('full')

    footprints.value = [buildFootprint(vertical('second', 'SK 471 849'))]

    expect(site.coverageFor('first')).toBeNull()
    expect(site.coverageFor('second')?.verdict).toBe('none')
  })

  it('takes a drawn outline and keeps its corners', () => {
    const site = state()
    const ring: LngLat[] = [
      at(442_000, 384_800),
      at(442_300, 384_800),
      at(442_300, 385_100),
      at(442_000, 385_100),
    ]

    site.setOutline(ring)

    expect(site.area.value).toEqual({ kind: 'polygon', ring })
    expect(site.coverageFor('covers')?.verdict).toBe('full')
  })

  it('refuses an outline that does not enclose anything', () => {
    const site = state()

    expect(() => site.setOutline([FRAME_CENTRE, at(442_300, 384_800)])).toThrow(RangeError)
    expect(site.area.value).toBeNull()
  })

  it('refuses a site off the National Grid, and says so rather than breaking', () => {
    const site = state()
    site.setPin(FRAME_CENTRE)
    site.begin('point')

    // Paris. Nothing stops a user panning there and clicking, and the projection has no easting
    // to offer for it — but the panel must not go down with it.
    site.setPin([2.35, 48.85])

    expect(site.areaError.value).toContain('outside the National Grid')
    expect(site.areaError.value).toContain('Great Britain only')
    // The site that was already marked is untouched, and drawing has stopped.
    expect(site.area.value).toEqual({ kind: 'point', position: FRAME_CENTRE })
    expect(site.coverageFor('covers')?.verdict).toBe('full')
    expect(site.drawMode.value).toBe('none')
  })

  it('drops the refusal once a usable site is marked', () => {
    const site = state()
    site.setPin([2.35, 48.85])
    expect(site.areaError.value).not.toBeNull()

    site.setPin(FRAME_CENTRE)
    expect(site.areaError.value).toBeNull()
  })

  it('tracks drawing so the map knows what a click means', () => {
    const site = state()

    expect(site.isDrawing.value).toBe(false)

    site.begin('polygon')
    expect(site.drawMode.value).toBe('polygon')
    expect(site.isDrawing.value).toBe(true)
    expect(site.placedVertices.value).toBe(0)
    expect(site.canFinish.value).toBe(false)

    site.placedVertices.value = MINIMUM_OUTLINE_VERTICES
    expect(site.canFinish.value).toBe(true)

    site.cancelDrawing()
    expect(site.drawMode.value).toBe('none')
    expect(site.placedVertices.value).toBe(0)
    // Cancelling drawing is not clearing the site; there was none here, but nor is one lost.
    expect(site.area.value).toBeNull()
  })

  it('leaves drawing mode when the shape is finished', () => {
    const site = state()
    site.begin('point')
    site.setPin(FRAME_CENTRE)

    expect(site.drawMode.value).toBe('none')
    expect(site.isDrawing.value).toBe(false)
  })

  it('starts a second outline from no corners, not from the first one’s', () => {
    const site = state()
    site.begin('polygon')
    site.placedVertices.value = 5

    site.begin('polygon')
    expect(site.placedVertices.value).toBe(0)
  })

  it('hides only the frames it measured and found wanting', () => {
    const site = state(
      [buildFootprint(vertical('covers')), buildFootprint(vertical('misses', 'SK 471 849'))],
      [buildObliquePoint(oblique('an oblique', 'SK 471 849'))],
    )
    site.setPin(FRAME_CENTRE)

    expect(site.keep('covers')).toBe(true)
    expect(site.keep('misses')).toBe(true)

    site.hideMisses.value = true

    expect(site.keep('covers')).toBe(true)
    expect(site.keep('misses')).toBe(false)
    // The oblique sits in the same place as the frame that was dropped, and stays. Nothing was
    // derivable about what it covers, so "misses the site" is not something the data supports.
    expect(site.misses('an oblique')).toBe(false)
    expect(site.keep('an oblique')).toBe(true)
  })

  it('measures obliques as a distance, never as a verdict', () => {
    const site = state([], [buildObliquePoint(oblique('EPW012345', 'SK 430 855'))])
    site.setPin(FRAME_CENTRE)

    // SK 430 855 is 900 m east and 600 m north of the pin.
    expect(site.proximityFor('EPW012345')?.distanceM).toBeCloseTo(Math.hypot(900, 600), 0)
    expect(site.coverageFor('EPW012345')).toBeNull()
    expect(site.coverage.value?.tally).toEqual({ full: 0, partial: 0, none: 0 })
  })

  it('clears the site, the filter and any drawing at once', () => {
    const site = state()
    site.setPin(FRAME_CENTRE)
    site.hideMisses.value = true
    site.begin('polygon')

    site.clear()

    expect(site.area.value).toBeNull()
    expect(site.hasArea.value).toBe(false)
    expect(site.coverage.value).toBeNull()
    expect(site.hideMisses.value).toBe(false)
    expect(site.drawMode.value).toBe('none')
    expect(site.areaError.value).toBeNull()
  })
})
