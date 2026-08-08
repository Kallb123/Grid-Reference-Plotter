/**
 * The loaded result set: one supplier file in, footprints and points out.
 *
 * This is the whole of the app's state. It composes the two layers that already exist —
 * `io/parseWorkbook` for the file and `domain/footprint` for the geometry — and adds nothing of
 * its own except the bookkeeping a view needs: what is loading, what failed, what is selected.
 *
 * Nothing here uploads anything. `File.arrayBuffer()` reads the bytes the browser already has,
 * and they never leave it (ARCHITECTURE.md §3).
 */

import { computed, ref, shallowRef } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import { plotBounds } from '../domain/bounds'
import type { LngLatBounds } from '../domain/bounds'
import { buildFootprint, buildObliquePoint } from '../domain/footprint'
import type { Footprint, ParseIssue, PlottedPoint } from '../domain/types'
import type { SheetSummary } from '../io/parseWorkbook'
import { parseWorkbookFile } from '../io/parseWorkbook'

export type LoadStatus = 'empty' | 'loading' | 'loaded' | 'failed'

/** Either half of the plot, identified the same way, so selection can be one field. */
export type Selection =
  | { kind: 'vertical'; footprint: Footprint }
  | { kind: 'oblique'; point: PlottedPoint }

export interface PhotoSet {
  status: Ref<LoadStatus>
  /** Name of the file currently loaded, for the UI to echo back. */
  fileName: Ref<string | null>
  /** Why the *file* could not be read at all. Per-row failures are `issues`, not this. */
  loadError: Ref<string | null>

  footprints: Ref<readonly Footprint[]>
  points: Ref<readonly PlottedPoint[]>
  issues: Ref<readonly ParseIssue[]>
  sheets: Ref<readonly SheetSummary[]>

  /** Rows that produced no frame — a frame missing from the map. */
  errors: ComputedRef<readonly ParseIssue[]>
  /** Rows that were kept but are worth mentioning. */
  warnings: ComputedRef<readonly ParseIssue[]>
  /** Frames actually plotted, of both kinds. */
  plottedCount: ComputedRef<number>
  isEmpty: ComputedRef<boolean>
  /** The box the map should frame, or `null` when nothing is plotted. */
  bounds: ComputedRef<LngLatBounds | null>

  selectedId: Ref<string | null>
  selected: ComputedRef<Selection | null>
  select: (id: string | null) => void

  loadFile: (file: File) => Promise<void>
  clear: () => void
}

export function usePhotoSet(): PhotoSet {
  const status = ref<LoadStatus>('empty')
  const fileName = ref<string | null>(null)
  const loadError = ref<string | null>(null)

  // `shallowRef` because these are rebuilt wholesale on every load and never mutated in place.
  // Deep reactivity over a few hundred footprints would be paid for on every map redraw.
  const footprints = shallowRef<readonly Footprint[]>([])
  const points = shallowRef<readonly PlottedPoint[]>([])
  const issues = shallowRef<readonly ParseIssue[]>([])
  const sheets = shallowRef<readonly SheetSummary[]>([])

  const selectedId = ref<string | null>(null)

  // A second file dropped while the first is still being read must not have its results
  // overwritten by the slower one finishing later. Only the most recent load may write.
  let currentLoad = 0

  const errors = computed(() => issues.value.filter((issue) => issue.severity !== 'warning'))
  const warnings = computed(() => issues.value.filter((issue) => issue.severity === 'warning'))
  const plottedCount = computed(() => footprints.value.length + points.value.length)
  const isEmpty = computed(() => plottedCount.value === 0)
  const bounds = computed(() => plotBounds(footprints.value, points.value))

  const selected = computed<Selection | null>(() => {
    const id = selectedId.value
    if (id === null) return null

    const footprint = footprints.value.find((candidate) => candidate.record.id === id)
    if (footprint !== undefined) return { kind: 'vertical', footprint }

    const point = points.value.find((candidate) => candidate.record.id === id)
    if (point !== undefined) return { kind: 'oblique', point }

    return null
  })

  function select(id: string | null): void {
    selectedId.value = id
  }

  function clear(): void {
    currentLoad += 1
    status.value = 'empty'
    fileName.value = null
    loadError.value = null
    footprints.value = []
    points.value = []
    issues.value = []
    sheets.value = []
    selectedId.value = null
  }

  async function loadFile(file: File): Promise<void> {
    currentLoad += 1
    const load = currentLoad

    status.value = 'loading'
    fileName.value = file.name
    loadError.value = null
    selectedId.value = null

    try {
      const parse = await parseWorkbookFile(file)
      if (load !== currentLoad) return

      footprints.value = parse.verticals.map((record) => buildFootprint(record))
      points.value = parse.obliques.map((record) => buildObliquePoint(record))
      issues.value = parse.issues
      sheets.value = parse.sheets
      status.value = 'loaded'
    } catch (error) {
      if (load !== currentLoad) return

      footprints.value = []
      points.value = []
      issues.value = []
      sheets.value = []
      status.value = 'failed'
      loadError.value = describeLoadFailure(file, error)
    }
  }

  return {
    status,
    fileName,
    loadError,
    footprints,
    points,
    issues,
    sheets,
    errors,
    warnings,
    plottedCount,
    isEmpty,
    bounds,
    selectedId,
    selected,
    select,
    loadFile,
    clear,
  }
}

/**
 * A readable reason a whole file could not be read.
 *
 * This is the *file* failing, not a row: a PDF renamed to `.xls`, a corrupt workbook, a file the
 * browser could not read off disk. A row that fails is reported on its own line by the parser
 * and leaves the rest of the listing on the map.
 */
function describeLoadFailure(file: File, error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error)
  return `“${file.name}” could not be read as a spreadsheet: ${detail}`
}
