/**
 * The listing narrowed to what the user asked for.
 *
 * `useAreaOfInterest` answers *which frames cover my site*. This answers the other half of the
 * same question — *and which of those is the photograph I actually want* — from four things a
 * customer can state without knowing anything about photogrammetry: how much detail they need,
 * roughly when, whether the frame has to cover the site, and whether a print already exists.
 *
 * It holds the criteria and nothing else. Which frames pass is `domain/filter`, and what a scale
 * means is `domain/detail`; both are pure and tested. What is here is the bookkeeping the map,
 * the table and the wizard all need in order to agree about which frames are on screen — the
 * same reason selection lives in `usePhotoSet` rather than in either view.
 *
 * The filter hides frames; it never re-orders or re-measures them. A frame that survives it is
 * exactly the frame it was before, with the same coverage figures and the same caveats.
 */

import { computed, ref, watch } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import { catalogueYear } from '../domain/catalogueDate'
import { DETAIL_BANDS, detailBandIndex } from '../domain/detail'
import { ANY_FRAME, frameMatches, holdsPrint, isFiltering } from '../domain/filter'
import type { FilterCriterion, FrameFilter } from '../domain/filter'
import type { SiteCoverage } from '../domain/coverage'
import type { Footprint, PhotoRecord, PlottedPoint } from '../domain/types'

/** The coarsest and finest scale a listing actually contains. */
export interface ScaleSpan {
  coarsest: number
  finest: number
}

export interface FrameFilterState {
  filter: Ref<FrameFilter>
  /** Change one or more criteria, leaving the rest alone. */
  set: (patch: Partial<FrameFilter>) => void
  clear: () => void
  /** Whether the filter asks anything at all. A filter that asks nothing hides nothing. */
  isActive: ComputedRef<boolean>

  /** The frames the filter puts out of the way: what the map leaves undrawn and the table drops. */
  hiddenIds: ComputedRef<ReadonlySet<string>>
  keep: (id: string) => boolean
  /** How many frames survive, and how many there were. */
  matched: ComputedRef<number>
  total: ComputedRef<number>
  /**
   * Frames kept although the filter could not judge them — an oblique against a scale, an
   * undated row against a date. Surfaced rather than swallowed: a user reading a narrowed
   * listing would otherwise take every frame on it to have passed every test.
   */
  unjudged: ComputedRef<readonly FilterCriterion[]>
  unjudgedCount: ComputedRef<number>

  /**
   * Which criteria this listing can actually answer.
   *
   * A wizard that asked a file of obliques how detailed its frames should be, or asked about
   * prints held in a listing with no `Held` column, would be offering a control that cannot
   * change anything — and, worse, one whose having no effect looks like a bug.
   */
  available: ComputedRef<Record<FilterCriterion, boolean>>

  /** Every year the listing gives, ascending, for the date step to offer. */
  years: ComputedRef<readonly number[]>
  /** How many verticals sit at each detail band *or finer*, so the slider can report as it moves. */
  framesAtLeastDetail: ComputedRef<readonly number[]>
  /** What the listing itself spans, or `null` where it carries no scale at all. */
  scaleSpan: ComputedRef<ScaleSpan | null>
}

export function useFrameFilter(
  footprints: Ref<readonly Footprint[]>,
  points: Ref<readonly PlottedPoint[]>,
  coverage: Ref<SiteCoverage | null>,
): FrameFilterState {
  const filter = ref<FrameFilter>({ ...ANY_FRAME })

  const records = computed<readonly PhotoRecord[]>(() => [
    ...footprints.value.map((footprint) => footprint.record),
    ...points.value.map((point) => point.record),
  ])

  const isActive = computed(() => isFiltering(filter.value))

  /**
   * Every record's verdict on the filter, worked out once per change rather than per lookup.
   *
   * The map asks for this set, the table asks per row and the wizard asks for the counts; doing
   * it three times over fifty frames on every drag of the slider is the sort of thing that makes
   * a slider feel broken.
   */
  const verdicts = computed(() => {
    const current = filter.value
    const site = coverage.value
    return new Map(
      records.value.map((record) => [
        record.id,
        frameMatches(record, site?.frames.get(record.id)?.verdict ?? null, current),
      ]),
    )
  })

  const hiddenIds = computed<ReadonlySet<string>>(() => {
    const hidden = new Set<string>()
    for (const [id, match] of verdicts.value) if (!match.keep) hidden.add(id)
    return hidden
  })

  const total = computed(() => records.value.length)
  const matched = computed(() => total.value - hiddenIds.value.size)

  const unjudged = computed<readonly FilterCriterion[]>(() => {
    const criteria = new Set<FilterCriterion>()
    for (const match of verdicts.value.values()) {
      if (match.keep) for (const criterion of match.unjudged) criteria.add(criterion)
    }
    return [...criteria]
  })

  const unjudgedCount = computed(() => {
    let count = 0
    for (const match of verdicts.value.values()) {
      if (match.keep && match.unjudged.length > 0) count += 1
    }
    return count
  })

  const years = computed<readonly number[]>(() => {
    const found = new Set<number>()
    for (const record of records.value) {
      const year = catalogueYear(record.provenance.date)
      if (year !== null) found.add(year)
    }
    return [...found].sort((a, b) => a - b)
  })

  const framesAtLeastDetail = computed<readonly number[]>(() => {
    const counts = DETAIL_BANDS.map(() => 0)
    for (const footprint of footprints.value) {
      // Cumulative: a frame counts at its own band and at every coarser one, because the slider
      // asks for a floor — everything at least this detailed — and not for a single band.
      for (let index = detailBandIndex(footprint.record.scaleDenominator); index >= 0; index -= 1) {
        counts[index] = (counts[index] ?? 0) + 1
      }
    }
    return counts
  })

  const scaleSpan = computed<ScaleSpan | null>(() => {
    let coarsest = -Infinity
    let finest = Infinity
    for (const footprint of footprints.value) {
      const denominator = footprint.record.scaleDenominator
      if (denominator > coarsest) coarsest = denominator
      if (denominator < finest) finest = denominator
    }
    return Number.isFinite(finest) ? { coarsest, finest } : null
  })

  const available = computed<Record<FilterCriterion, boolean>>(() => ({
    detail: footprints.value.length > 0,
    date: years.value.length > 0,
    // Coverage needs a site to be measured against; the panel above this one is where one is
    // marked, and until it has been there is no verdict for any frame to be filtered on.
    coverage: coverage.value !== null,
    print: records.value.some((record) => holdsPrint(record.provenance.held) !== null),
  }))

  function set(patch: Partial<FrameFilter>): void {
    filter.value = { ...filter.value, ...patch }
  }

  function clear(): void {
    filter.value = { ...ANY_FRAME }
  }

  function keep(id: string): boolean {
    return !hiddenIds.value.has(id)
  }

  /**
   * A new listing starts unfiltered.
   *
   * Unlike the site — a real place, which sensibly survives loading a second quote — the answers
   * here were given about *this* listing: the years were chosen from a menu built out of it, and
   * the detail band was chosen against the scales it happened to contain. Carried over to a file
   * flown in a different decade at a different scale they would hide everything, with the reason
   * three sections up the panel and no longer true.
   */
  watch([footprints, points], clear)

  return {
    filter,
    set,
    clear,
    isActive,
    hiddenIds,
    keep,
    matched,
    total,
    unjudged,
    unjudgedCount,
    available,
    years,
    framesAtLeastDetail,
    scaleSpan,
  }
}
