/**
 * Narrowing a listing to the frames worth looking at.
 *
 * A results file is fifty frames over one town, flown a decade apart at four different scales,
 * and the customer wants three of them. The map and the table let them compare frames one
 * against another; this lets them state what they are after up front — this much detail, this
 * era, actually covering the site, print already held — and put the rest out of the way.
 *
 * Two rules run through the whole module.
 *
 * **A criterion that cannot be judged never rejects.** An oblique has no scale, so a request for
 * fine detail says nothing about it; a listing that gives no date cannot be older or newer than
 * anything. Those records are kept and the criterion is reported back in `unjudged`, so the UI
 * can say how many frames are on screen without having been tested rather than leaving the user
 * to assume every visible frame passed every filter. It is the same stance `useAreaOfInterest`
 * takes on hiding misses: no evidence of a miss is not evidence of one.
 *
 * **Nothing here measures anything.** The scale comes from the catalogue, the year from the
 * catalogue's own date text, and the coverage verdict from `coverage.ts`. This module only
 * compares them with what was asked for.
 */

import { catalogueYear } from './catalogueDate'
import { detailBandIndex } from './detail'
import type { CoverageVerdict } from './coverage'
import type { PhotoRecord } from './types'

/** How much of the marked site a frame has to reach to be worth keeping. */
export type CoverageDemand = 'any' | 'partial' | 'full'

/** The things a frame can be filtered on. Named so the UI can say which one was not applied. */
export type FilterCriterion = 'detail' | 'date' | 'coverage' | 'print'

export interface FrameFilter {
  /**
   * The least detail that will do, as an index into `DETAIL_BANDS`.
   *
   * A floor rather than a selection: someone who needs to see a garden fence will not turn down
   * a finer frame that also shows it. `0` is the coarsest band, which is every frame there is,
   * and so means "no detail filter".
   */
  minDetail: number
  /** Earliest year to keep, inclusive, or `null` for no bound. */
  fromYear: number | null
  /** Latest year to keep, inclusive, or `null` for no bound. */
  toYear: number | null
  /** What the frame has to do about the marked site. Judgeable only once one is marked. */
  coverage: CoverageDemand
  /** Keep only frames the archive holds a print of. */
  printHeldOnly: boolean
}

/** The filter that keeps everything: what the app starts with, and what "clear" returns to. */
export const ANY_FRAME: FrameFilter = {
  minDetail: 0,
  fromYear: null,
  toYear: null,
  coverage: 'any',
  printHeldOnly: false,
}

export interface FilterMatch {
  keep: boolean
  /**
   * Criteria that were asked for but that this record carries nothing to be judged by.
   *
   * Only ever criteria that are actually active: a filter asking nothing about dates does not
   * report an undated frame as unjudged, because nothing went unanswered.
   */
  unjudged: FilterCriterion[]
}

/** Whether the filter asks anything at all. A filter that asks nothing hides nothing. */
export function isFiltering(filter: FrameFilter): boolean {
  return (
    filter.minDetail > 0 ||
    filter.fromYear !== null ||
    filter.toYear !== null ||
    filter.coverage !== 'any' ||
    filter.printHeldOnly
  )
}

/**
 * Whether a frame survives the filter, and what it could not be judged on.
 *
 * `verdict` is what `coverage.ts` made of this frame against the marked site, or `null` where
 * there is no site or the frame has no extent to compare with one.
 */
export function frameMatches(
  record: PhotoRecord,
  verdict: CoverageVerdict | null,
  filter: FrameFilter,
): FilterMatch {
  const unjudged: FilterCriterion[] = []
  let keep = true

  if (filter.minDetail > 0) {
    // Obliques carry no scale — there is nothing to derive a band from, and inventing one would
    // be the same offence as inventing a footprint for them (INPUT-FORMAT.md §6).
    if (record.kind !== 'vertical') unjudged.push('detail')
    else if (detailBandIndex(record.scaleDenominator) < filter.minDetail) keep = false
  }

  if (filter.fromYear !== null || filter.toYear !== null) {
    const year = catalogueYear(record.provenance.date)
    if (year === null) unjudged.push('date')
    else if (
      (filter.fromYear !== null && year < filter.fromYear) ||
      (filter.toYear !== null && year > filter.toYear)
    ) {
      keep = false
    }
  }

  if (filter.coverage !== 'any') {
    if (verdict === null) unjudged.push('coverage')
    else if (!meetsDemand(verdict, filter.coverage)) keep = false
  }

  if (filter.printHeldOnly) {
    const held = holdsPrint(record.provenance.held)
    if (held === null) unjudged.push('print')
    else if (!held) keep = false
  }

  return { keep, unjudged }
}

function meetsDemand(verdict: CoverageVerdict, demand: CoverageDemand): boolean {
  if (demand === 'full') return verdict === 'full'
  return verdict !== 'none'
}

/**
 * Whether the archive holds a print, or `null` where the listing does not say.
 *
 * `"P"` and `"N"` are the codes the archive documents (INPUT-FORMAT.md §5). Anything else is a
 * code this app has not seen, and guessing which way it points would drop frames a customer
 * could have ordered.
 *
 * Exported because the UI needs the same answer for a different reason: a listing where no row
 * carries a code either way should not be offered a control that cannot do anything.
 */
export function holdsPrint(held: string | undefined): boolean | null {
  const code = held?.trim().toUpperCase()
  if (code === 'P') return true
  if (code === 'N') return false
  return null
}
