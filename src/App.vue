<script setup lang="ts">
/**
 * ARCHITECTURE.md §9.6–7: drop a supplier workbook, see the frames drawn, mark the site you want
 * photographs of, compare the frames by how well they cover it, and narrow fifty of them to the
 * handful worth ordering.
 *
 * Three composables hold everything. `usePhotoSet` is the supplier's side — the file, the frames
 * it yielded, and which one is selected or hovered; `useAreaOfInterest` is the user's — the site,
 * and what every frame does about it; `useFrameFilter` is what they asked the wizard for. All
 * three are shared rather than owned by a view, because the map and the table show the same
 * frames and each has to react to what the user does in the other: a row lights up its polygon, a
 * polygon clicked on the map scrolls its row into view, a site drawn on the map reorders the
 * table, and an answer given to the wizard narrows both at once.
 */

import { computed, watch } from 'vue'
import AreaOfInterestPanel from './components/AreaOfInterestPanel.vue'
import BrandLockup from './components/BrandLockup.vue'
import FileDrop from './components/FileDrop.vue'
import FrameWizard from './components/FrameWizard.vue'
import IssueList from './components/IssueList.vue'
import MapView from './components/MapView.vue'
import PhotoDetail from './components/PhotoDetail.vue'
import PhotoTable from './components/PhotoTable.vue'
import { plotBounds } from './domain/bounds'
import { useAreaOfInterest } from './composables/useAreaOfInterest'
import { useFrameFilter } from './composables/useFrameFilter'
import { usePhotoSet } from './composables/usePhotoSet'

const photos = usePhotoSet()
const site = useAreaOfInterest(photos.footprints, photos.points)
const filter = useFrameFilter(photos.footprints, photos.points, site.coverage)

/**
 * The two filters are one predicate by the time a view sees them.
 *
 * The wizard's answers and the site panel's "leave out the misses" tick both narrow the same
 * listing, and a row has to satisfy both to be worth a line. The map takes the same decision as
 * a set of ids, because Leaflet needs to be told which layers to take off rather than asked
 * about each one.
 */
const keep = (id: string): boolean => filter.keep(id) && site.keep(id)

/**
 * Frame what is on the map, not what was in the file.
 *
 * "Fit to frames" on a listing narrowed to three frames should show those three. The map is not
 * reframed when the filter changes — that would yank the view out from under someone dragging a
 * slider — so this only takes effect when the button is pressed or a new file is loaded.
 */
const visibleBounds = computed(() =>
  plotBounds(
    photos.footprints.value.filter((footprint) => filter.keep(footprint.record.id)),
    photos.points.value.filter((point) => filter.keep(point.record.id)),
  ),
)

/**
 * Frames that miss the site and are still on screen.
 *
 * Counted over what the wizard has left rather than over the whole listing, so the site panel
 * never offers to drop frames the wizard has already taken away. Deliberately blind to the tick
 * itself: counting what *it* has hidden would take the count to zero the moment it was ticked,
 * and the control would disappear with no way to untick it.
 */
const visibleMissCount = computed(() => {
  const measured = site.coverage.value
  if (measured === null) return 0

  let count = 0
  for (const [id, frame] of measured.frames) {
    if (frame.verdict === 'none' && filter.keep(id)) count += 1
  }
  return count
})

// A frame the user has just filtered away cannot stay selected: the detail panel would go on
// describing a frame that is no longer on the map, and the map would have nothing to highlight.
watch(filter.hiddenIds, (hidden) => {
  const id = photos.selectedId.value
  if (id !== null && hidden.has(id)) photos.select(null)
})

const counts = computed(() => {
  const parts: string[] = []
  const verticals = photos.footprints.value.length
  const obliques = photos.points.value.length
  if (verticals > 0) parts.push(`${verticals} vertical footprint${verticals === 1 ? '' : 's'}`)
  if (obliques > 0) parts.push(`${obliques} oblique position${obliques === 1 ? '' : 's'}`)
  return parts.join(' and ')
})
</script>

<template>
  <div class="app">
    <aside class="panel">
      <header class="panel__head">
        <h1 class="panel__brand"><BrandLockup :mark-size="60" /></h1>
        <p class="panel__lede">
          Drop an aerial photography results workbook to see which frames cover your site.
        </p>
      </header>

      <FileDrop
        :status="photos.status.value"
        :file-name="photos.fileName.value"
        :error="photos.loadError.value"
        @file="photos.loadFile"
        @clear="photos.clear"
      />

      <p v-if="counts !== ''" class="panel__counts">{{ counts }} plotted.</p>
      <p v-else-if="photos.status.value === 'loaded'" class="panel__counts">
        No frames could be plotted from this file.
      </p>

      <IssueList
        :errors="photos.errors.value"
        :warnings="photos.warnings.value"
        :start-open="photos.status.value === 'loaded' && photos.isEmpty.value"
      />

      <AreaOfInterestPanel
        :area="site.area.value"
        :area-error="site.areaError.value"
        :coverage="site.coverage.value"
        :draw-mode="site.drawMode.value"
        :hide-misses="site.hideMisses.value"
        :miss-count="visibleMissCount"
        :has-frames="!photos.isEmpty.value"
        @begin="site.begin"
        @cancel-draw="site.cancelDrawing"
        @clear="site.clear"
        @update:hide-misses="site.hideMisses.value = $event"
      />

      <FrameWizard
        :filter="filter.filter.value"
        :available="filter.available.value"
        :is-active="filter.isActive.value"
        :matched="filter.matched.value"
        :total="filter.total.value"
        :unjudged="filter.unjudged.value"
        :unjudged-count="filter.unjudgedCount.value"
        :years="filter.years.value"
        :frames-at-least-detail="filter.framesAtLeastDetail.value"
        :scale-span="filter.scaleSpan.value"
        @change="filter.set"
        @clear="filter.clear"
      />

      <PhotoDetail :selection="photos.selected.value" :coverage="site.coverage.value" />

      <p v-if="photos.selected.value === null && !photos.isEmpty.value" class="panel__hint">
        Choose a frame, on the map or in the table, to see the numbers behind it.
      </p>

      <footer class="panel__foot">
        Everything runs in this browser. Your file is never uploaded.
      </footer>
    </aside>

    <main class="app__work">
      <MapView
        :footprints="photos.footprints.value"
        :points="photos.points.value"
        :bounds="visibleBounds"
        :selected-id="photos.selectedId.value"
        :hovered-id="photos.hoveredId.value"
        :hidden-ids="filter.hiddenIds.value"
        :area="site.area.value"
        :coverage="site.coverage.value"
        :draw-mode="site.drawMode.value"
        :placed-vertices="site.placedVertices.value"
        @select="photos.select"
        @hover="photos.hover"
        @area="site.setArea"
        @cancel-draw="site.cancelDrawing"
        @vertex-placed="site.placedVertices.value = $event"
      />

      <PhotoTable
        :footprints="photos.footprints.value"
        :points="photos.points.value"
        :selected-id="photos.selectedId.value"
        :hovered-id="photos.hoveredId.value"
        :coverage="site.coverage.value"
        :keep="keep"
        @select="photos.select"
        @hover="photos.hover"
      />
    </main>
  </div>
</template>

<style scoped>
/*
 * Narrow: panel, map and table down one scrolling page. From 60rem: the panel alongside, and the
 * page locked to the viewport so map and table share one screen.
 *
 * The lock is deliberately not applied to the narrow layout. The panel on its own is taller than
 * a phone screen, so locking the page to the viewport height left the work column nothing: its
 * track sized to zero, the map overflowed it and painted over the panel's own footer, and the
 * table — whose scroller is allowed to be zero-high — collapsed to its border and vanished. A
 * document that scrolls is the honest shape for a screen that cannot hold all three at once.
 */
.app {
  display: grid;
  grid-template-rows: auto auto;
}

@media (width >= 60rem) {
  .app {
    grid-template-rows: 1fr;
    grid-template-columns: minmax(20rem, 26rem) 1fr;
    height: 100vh;
    height: 100dvh;
  }
}

.panel {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  min-height: 0;
  overflow-y: auto;
  padding: 1.25rem;
  /* Strong rules between major sections; hairlines are for rows inside one. */
  border-bottom: var(--rule-weight) solid var(--rule);
}

@media (width >= 60rem) {
  .panel {
    border-right: var(--rule-weight) solid var(--rule);
    border-bottom: none;
  }
}

.panel__brand {
  margin: 0 0 0.6rem;
}

.panel__lede {
  margin: 0;
  color: var(--ink-muted);
  font-size: 0.9rem;
}

.panel__counts {
  margin: 0;
  font-size: 0.9rem;
}

.panel__hint,
.panel__foot {
  margin: 0;
  color: var(--ink-muted);
  font-size: 0.8rem;
}

.panel__foot {
  margin-top: auto;
  padding-top: 0.75rem;
  border-top: var(--rule-weight) solid var(--rule);
}

/*
 * Map above, table below. Stacked, both size to their own content — the map to the height it
 * gives itself for the narrow layout, the table to its rows — and the page carries the scrolling.
 */
.app__work {
  display: grid;
  grid-template-rows: auto auto;
  /* Without this the table's widest row sets the column width and drags the whole page wider. */
  min-width: 0;
}

/*
 * Sharing one locked screen, the split is `auto` for the table rather than fixed: it sizes to its
 * own content up to the cap it sets itself, so a listing of three frames does not reserve half the
 * window, and the map keeps the rest.
 *
 * `min-content` rather than `0` as the map's floor: with a floor of zero the track can be sized
 * smaller than the map's own minimum height, and the map then overflows the track and paints over
 * the table. Sized from its content, a window too short for both scrolls instead of overlapping.
 */
@media (width >= 60rem) {
  .app__work {
    grid-template-rows: minmax(min-content, 1fr) auto;
    min-height: 0;
  }
}
</style>
