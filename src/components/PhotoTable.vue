<script setup lang="ts">
/**
 * The listing as a table, linked to the map.
 *
 * The map answers "where are these frames"; this answers "which of them do I buy". Sorting by
 * scale, date or extent is the comparison the tool exists to support, and the linkage is what
 * makes it usable with fifty candidates: pointing at a row lights up its polygon, clicking one
 * selects it in both places, and a frame selected on the map scrolls into view here.
 *
 * No arithmetic. Rows and their ordering come from `photoTable`, which is a plain module so the
 * ordering can be tested without a browser.
 */

import { computed, nextTick, ref, watch } from 'vue'
import type { SiteCoverage } from '../domain/coverage'
import type { Footprint, PlottedPoint } from '../domain/types'
import { buildRows, photoColumns, sortRows } from '../composables/photoTable'
import type { PhotoColumn, PhotoColumnKey, SortDirection } from '../composables/photoTable'

const props = defineProps<{
  footprints: readonly Footprint[]
  points: readonly PlottedPoint[]
  selectedId: string | null
  hoveredId: string | null
  coverage: SiteCoverage | null
  /**
   * Which rows survive the filters — the wizard's answers and the "leave out the misses" tick.
   * Both are decided outside this component, in `useFrameFilter` and `useAreaOfInterest`.
   */
  keep: (id: string) => boolean
}>()

const emit = defineEmits<{
  select: [id: string | null]
  hover: [id: string | null]
}>()

/** `null` is the supplier's own order — sortie and frame — which is a meaningful default. */
const sortKey = ref<PhotoColumnKey | null>(null)
const sortDirection = ref<SortDirection>('ascending')
const isOpen = ref(true)

const columns = computed(() => photoColumns(props.coverage !== null))

const rows = computed(() =>
  sortRows(
    buildRows(props.footprints, props.points, props.coverage).filter((row) => props.keep(row.id)),
    sortKey.value,
    sortDirection.value,
  ),
)

const hiddenCount = computed(
  () => props.footprints.length + props.points.length - rows.value.length,
)

const columnHeader = computed(() =>
  columns.value.map((column) => ({
    ...column,
    ariaSort: sortKey.value === column.key ? sortDirection.value : ('none' as const),
  })),
)

/**
 * The moment a site is marked, order the listing by how well it is covered.
 *
 * This is the whole point of milestone 6: until a site exists the supplier's order is the most
 * meaningful one there is, and the instant one exists it is not. Only an untouched sort is
 * replaced — a user who has chosen to read the listing by date has made a decision, and marking
 * a site is not a reason to overrule it.
 */
watch(
  () => props.coverage !== null,
  (hasSite) => {
    if (!hasSite || sortKey.value !== null) return
    sortKey.value = 'covered'
    sortDirection.value = 'descending'
  },
)

/**
 * First click sorts the interesting way, second reverses, third returns to the listing's own
 * order.
 *
 * Which way is interesting depends on the column: the earliest date and the finest scale are at
 * the ascending end, but the best-covered frame is at the descending one, so the site's columns
 * declare `descendingFirst` and start there. The third state is there because the supplier's
 * order is information — frames arrive grouped by sortie and run — and once a table has been
 * sorted there is otherwise no way back to it.
 */
function toggleSort(key: PhotoColumnKey): void {
  const first: SortDirection = firstDirection(key)

  if (sortKey.value !== key) {
    sortKey.value = key
    sortDirection.value = first
    return
  }
  if (sortDirection.value === first) {
    sortDirection.value = first === 'ascending' ? 'descending' : 'ascending'
    return
  }
  sortKey.value = null
  sortDirection.value = 'ascending'
}

/**
 * Rows for frames measured against the site and found not to reach it.
 *
 * Faded to match the map, where the same frames are drawn faintly. They stay legible and stay
 * selectable: a frame that misses by 80 m is worth being able to look at, and it is exactly the
 * one whose ±50 m makes the verdict arguable.
 */
function misses(id: string): boolean {
  return props.coverage?.frames.get(id)?.verdict === 'none'
}

function firstDirection(key: PhotoColumnKey): SortDirection {
  const column: PhotoColumn | undefined = columns.value.find((candidate) => candidate.key === key)
  return column?.descendingFirst === true ? 'descending' : 'ascending'
}

function sortIndicator(key: PhotoColumnKey): string {
  if (sortKey.value !== key) return ''
  return sortDirection.value === 'ascending' ? '▲' : '▼'
}

/**
 * The row elements, so a selection made on the map can be scrolled to.
 *
 * Kept as element references rather than looked up by a selector: a record id is a sortie number
 * out of a spreadsheet — `MAL/74049(Z) frame 8` — and building a CSS selector out of one is a
 * quoting problem with no upside.
 */
const rowElements = new Map<string, HTMLElement>()

function captureRow(id: string, element: unknown): void {
  if (element instanceof HTMLElement) rowElements.set(id, element)
  else rowElements.delete(id)
}

// A frame clicked on the map has to become visible here, or the linkage only runs one way.
// `nearest` scrolls only when the row is actually off-screen, so clicking rows does not jump.
watch(
  () => props.selectedId,
  async (id) => {
    if (id === null || !isOpen.value) return
    await nextTick()
    rowElements.get(id)?.scrollIntoView({ block: 'nearest' })
  },
)
</script>

<template>
  <section v-if="rows.length > 0 || hiddenCount > 0" class="table">
    <header class="table__bar">
      <h2 class="table__title">
        {{ rows.length }} frame{{ rows.length === 1 ? '' : 's' }}
        <span v-if="hiddenCount > 0" class="table__order">
          — {{ hiddenCount }} left out by your filters
        </span>
        <span v-else-if="sortKey === null" class="table__order">in listing order</span>
      </h2>
      <button type="button" class="table__toggle" :aria-expanded="isOpen" @click="isOpen = !isOpen">
        {{ isOpen ? 'Hide table' : 'Show table' }}
      </button>
    </header>

    <div v-show="isOpen" class="table__scroll">
      <table class="table__grid">
        <caption class="table__caption">
          Every plotted frame. Choose a column heading to sort; choose a row to select the frame
          on the map.
        </caption>
        <thead>
          <tr>
            <th
              v-for="column in columnHeader"
              :key="column.key"
              scope="col"
              :aria-sort="column.ariaSort"
              :class="{ 'table__cell--numeric': column.numeric }"
            >
              <button
                type="button"
                class="table__sort"
                :title="column.description"
                @click="toggleSort(column.key)"
              >
                {{ column.label }}
                <span class="table__arrow" aria-hidden="true">{{ sortIndicator(column.key) }}</span>
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in rows"
            :key="row.id"
            :ref="(element) => captureRow(row.id, element)"
            tabindex="0"
            class="table__row"
            :class="{
              'table__row--selected': row.id === props.selectedId,
              'table__row--hovered': row.id === props.hoveredId,
              'table__row--oblique': row.kind === 'oblique',
              'table__row--misses': misses(row.id),
            }"
            :aria-current="row.id === props.selectedId ? 'true' : undefined"
            @click="emit('select', row.id === props.selectedId ? null : row.id)"
            @keydown.enter.prevent="emit('select', row.id)"
            @keydown.space.prevent="emit('select', row.id)"
            @mouseenter="emit('hover', row.id)"
            @mouseleave="emit('hover', null)"
            @focus="emit('hover', row.id)"
            @blur="emit('hover', null)"
          >
            <td
              v-for="column in columns"
              :key="column.key"
              :title="row.cells[column.key].note"
              :class="{ 'table__cell--numeric': column.numeric }"
            >
              {{ row.cells[column.key].text }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
.table {
  display: flex;
  flex-direction: column;
  min-height: 0;
  /* The rows do not wrap, so every box between here and the viewport has to be allowed to be
     narrower than its content — otherwise the widest row widens the whole page instead. */
  min-width: 0;
  border-top: var(--rule-weight) solid var(--rule);
  background: var(--paper);
}

.table__bar {
  display: flex;
  gap: 0.75rem;
  align-items: baseline;
  padding: 0.4rem 0.9rem;
}

.table__title {
  margin: 0;
  font-family: var(--font-heading);
  font-weight: var(--font-heading-weight);
  font-size: 0.85rem;
}

.table__order {
  color: var(--ink-muted);
  font-family: var(--font-body);
  font-weight: 400;
}

.table__toggle {
  margin-left: auto;
  border: 1px solid var(--rule);
  border-radius: var(--radius-md);
  padding: 0.15rem 0.5rem;
  background: none;
  color: var(--ink);
  font-family: var(--font-heading);
  font-weight: var(--font-heading-weight);
  font-size: 0.8rem;
  cursor: pointer;
}

.table__toggle:hover {
  background: color-mix(in srgb, var(--ink) 7%, transparent);
}

.table__toggle:active {
  background: color-mix(in srgb, var(--ink) 14%, transparent);
}

.table__scroll {
  overflow: auto;
  min-height: 0;
  /* About eight rows, and less than a third of a short window — the map is still the main view. */
  max-height: min(16rem, 30vh);
}

/*
 * Stacked on a narrow screen the page itself scrolls, so the listing runs to its full length
 * rather than becoming a second scroller inside the first — a 16rem window of rows inside a
 * scrolling page is a trap on a touchscreen. It stays a scroll container sideways: the rows do
 * not wrap and there are more columns than a phone is wide.
 */
@media (width < 60rem) {
  .table__scroll {
    max-height: none;
  }
}

.table__grid {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.82rem;
  white-space: nowrap;
}

.table__caption {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}

.table__grid th {
  position: sticky;
  top: 0;
  z-index: 1;
  /* The header rule is one of the strong ones; the row rules below it are hairlines. */
  border-bottom: var(--rule-weight) solid var(--rule);
  padding: 0;
  background: var(--paper);
  text-align: left;
}

.table__sort {
  width: 100%;
  border: none;
  padding: 0.35rem 0.6rem;
  background: none;
  color: var(--ink-muted);
  font-family: var(--font-heading);
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  text-align: inherit;
  cursor: pointer;
}

.table__sort:hover {
  color: var(--ink);
}

.table__arrow {
  display: inline-block;
  width: 0.75em;
  font-size: 0.7em;
}

.table__grid td {
  padding: 0.25rem 0.6rem;
  border-bottom: 1px solid var(--rule);
}

.table__cell--numeric {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.table__row {
  cursor: pointer;
}

.table__row--hovered {
  background: var(--accent-wash);
}

/* The same accent the map paints the selected frame in, so the two views agree. */
.table__row--selected {
  background: var(--accent-wash);
  box-shadow: inset 3px 0 0 var(--accent);
}

/* Obliques are a different claim about the ground, and are marked as one here as on the map. */
.table__row--oblique td:first-child {
  font-style: italic;
}

/* The same fading the map gives a frame that does not reach the site. */
.table__row--misses td {
  color: var(--ink-muted);
}

.table__row:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}
</style>
