/**
 * The site the user cares about, and what every loaded frame does about it.
 *
 * This is milestone 6 of ARCHITECTURE.md §9, and the point at which the app stops answering
 * "where are these photographs" and starts answering "which of them do I buy". Everything before
 * it draws the supplier's listing; this measures the listing against something the *user*
 * supplies, which is the only input in the whole app that does not come out of a spreadsheet.
 *
 * It holds three things and calculates none of them:
 *
 * 1. The area of interest itself — a dropped pin or a drawn outline, in WGS84.
 * 2. The state of drawing one, because the map has to know whether a click means "select that
 *    frame" or "put a corner here", and the panel has to know whether to say "drawing".
 * 3. `domain/coverage`'s answer for every frame, recomputed when either side changes.
 *
 * The arithmetic is all in `src/domain/coverage.ts`, where it is pure and tested. What is here
 * is the bookkeeping two views need in order to agree with each other — the same reason
 * selection and hover live in `usePhotoSet` rather than in the map or the table.
 */

import { computed, ref, shallowRef } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import { coverageOf, siteGeometry } from '../domain/coverage'
import type { FrameCoverage, SiteCoverage, SiteProximity } from '../domain/coverage'
import type { AreaOfInterest, Footprint, LngLat, PlottedPoint } from '../domain/types'

/** What the map should do with the next click. */
export type DrawMode = 'none' | 'point' | 'polygon'

/** An outline needs three corners before it encloses anything. */
export const MINIMUM_OUTLINE_VERTICES = 3

export interface AreaOfInterestState {
  /** The site, or `null` when none has been marked. */
  area: Ref<AreaOfInterest | null>
  hasArea: ComputedRef<boolean>
  /** Why the last attempt to mark a site was refused, for the panel to show. */
  areaError: Ref<string | null>

  /** What a click on the map means at the moment. */
  drawMode: Ref<DrawMode>
  isDrawing: ComputedRef<boolean>
  /** Corners placed so far in an outline being drawn, so the prompt can count them. */
  placedVertices: Ref<number>
  /** Whether what has been placed so far could be finished into an outline. */
  canFinish: ComputedRef<boolean>

  /** Every frame's verdict on the site, or `null` when there is no site to have one about. */
  coverage: ComputedRef<SiteCoverage | null>
  coverageFor: (id: string) => FrameCoverage | null
  proximityFor: (id: string) => SiteProximity | null
  /** True only when a frame has been measured and found not to reach the site at all. */
  misses: (id: string) => boolean

  /**
   * Whether the table should leave out frames that do not reach the site.
   *
   * Frames that were never measured — obliques, which carry nothing a footprint can be derived
   * from — are not "misses" and are never hidden by this. There is no evidence they miss.
   */
  hideMisses: Ref<boolean>
  /** The rows the table should show, given `hideMisses`. */
  keep: (id: string) => boolean

  begin: (mode: Exclude<DrawMode, 'none'>) => void
  cancelDrawing: () => void
  setArea: (area: AreaOfInterest) => void
  setPin: (position: LngLat) => void
  setOutline: (ring: readonly LngLat[]) => void
  clear: () => void
}

export function useAreaOfInterest(
  footprints: Ref<readonly Footprint[]>,
  points: Ref<readonly PlottedPoint[]>,
): AreaOfInterestState {
  // `shallowRef`: an area is replaced wholesale, never edited vertex by vertex, and deep
  // reactivity over its ring would be paid for on every coverage pass.
  const area = shallowRef<AreaOfInterest | null>(null)
  const areaError = ref<string | null>(null)
  const drawMode = ref<DrawMode>('none')
  const placedVertices = ref(0)
  const hideMisses = ref(false)

  const hasArea = computed(() => area.value !== null)
  const isDrawing = computed(() => drawMode.value !== 'none')
  const canFinish = computed(
    () => drawMode.value === 'polygon' && placedVertices.value >= MINIMUM_OUTLINE_VERTICES,
  )

  const coverage = computed<SiteCoverage | null>(() => {
    const site = area.value
    if (site === null) return null
    return coverageOf(footprints.value, points.value, site)
  })

  function coverageFor(id: string): FrameCoverage | null {
    return coverage.value?.frames.get(id) ?? null
  }

  function proximityFor(id: string): SiteProximity | null {
    return coverage.value?.obliques.get(id) ?? null
  }

  function misses(id: string): boolean {
    return coverageFor(id)?.verdict === 'none'
  }

  function keep(id: string): boolean {
    return !hideMisses.value || !misses(id)
  }

  function begin(mode: Exclude<DrawMode, 'none'>): void {
    drawMode.value = mode
    placedVertices.value = 0
  }

  function cancelDrawing(): void {
    drawMode.value = 'none'
    placedVertices.value = 0
  }

  /**
   * Accept a site, or refuse it with a reason.
   *
   * The check is done here, once, rather than left to the `coverage` computed. Nothing stops a
   * user panning to France and clicking, and the National Grid has no easting to offer for that
   * — but a site that only failed when it was measured would take the whole panel down with it
   * on the next render. Refusing it at the door leaves the previous site, if there was one,
   * exactly where it was.
   */
  function setArea(next: AreaOfInterest): void {
    try {
      siteGeometry(next)
    } catch (error) {
      areaError.value = describeRefusal(error)
      cancelDrawing()
      return
    }

    areaError.value = null
    area.value = next
    cancelDrawing()
  }

  function setPin(position: LngLat): void {
    setArea({ kind: 'point', position })
  }

  function setOutline(ring: readonly LngLat[]): void {
    if (ring.length < MINIMUM_OUTLINE_VERTICES) {
      throw new RangeError(
        `an outline needs at least ${MINIMUM_OUTLINE_VERTICES} corners, got ${ring.length}`,
      )
    }
    setArea({ kind: 'polygon', ring: [...ring] })
  }

  function clear(): void {
    area.value = null
    areaError.value = null
    hideMisses.value = false
    cancelDrawing()
  }

  return {
    area,
    hasArea,
    areaError,
    drawMode,
    isDrawing,
    placedVertices,
    canFinish,
    coverage,
    coverageFor,
    proximityFor,
    misses,
    hideMisses,
    keep,
    begin,
    cancelDrawing,
    setArea,
    setPin,
    setOutline,
    clear,
  }
}

/**
 * A readable reason a site was refused.
 *
 * In practice there is one: somewhere off the National Grid. The message from `wgs84ToGrid`
 * already names the position, so it is passed through with the consequence added rather than
 * replaced by something vaguer.
 */
function describeRefusal(error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error)
  return `${detail}. This tool works over Great Britain only, because that is where the grid references in a supplier's listing mean anything.`
}
