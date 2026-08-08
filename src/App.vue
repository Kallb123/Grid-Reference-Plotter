<script setup lang="ts">
/**
 * ARCHITECTURE.md §9.5: drop a supplier workbook, see the frames drawn, compare them in the
 * table, and be told about anything that did not make it.
 *
 * Selection and hover live in `usePhotoSet` rather than in either view, because both views show
 * the same frames and each has to react to the other: a row lights up its polygon, and a polygon
 * clicked on the map scrolls its row into view.
 */

import { computed } from 'vue'
import FileDrop from './components/FileDrop.vue'
import IssueList from './components/IssueList.vue'
import MapView from './components/MapView.vue'
import PhotoDetail from './components/PhotoDetail.vue'
import PhotoTable from './components/PhotoTable.vue'
import { usePhotoSet } from './composables/usePhotoSet'

const photos = usePhotoSet()

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
        <h1>Grid Reference Plotter</h1>
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

      <PhotoDetail :selection="photos.selected.value" />

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
        :bounds="photos.bounds.value"
        :selected-id="photos.selectedId.value"
        :hovered-id="photos.hoveredId.value"
        @select="photos.select"
        @hover="photos.hover"
      />

      <PhotoTable
        :footprints="photos.footprints.value"
        :points="photos.points.value"
        :selected-id="photos.selectedId.value"
        :hovered-id="photos.hoveredId.value"
        @select="photos.select"
        @hover="photos.hover"
      />
    </main>
  </div>
</template>

<style scoped>
.app {
  display: grid;
  grid-template-rows: auto 1fr;
  height: 100vh;
  height: 100dvh;
}

@media (width >= 60rem) {
  .app {
    grid-template-rows: 1fr;
    grid-template-columns: minmax(20rem, 26rem) 1fr;
  }
}

.panel {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  min-height: 0;
  overflow-y: auto;
  padding: 1.25rem;
  border-bottom: 1px solid var(--rule);
}

@media (width >= 60rem) {
  .panel {
    border-right: 1px solid var(--rule);
    border-bottom: none;
  }
}

.panel__head h1 {
  margin: 0 0 0.35rem;
  font-size: 1.25rem;
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
  border-top: 1px solid var(--rule);
}

/*
 * Map above, table below. `auto` rather than a fixed split: the table sizes to its own content up
 * to the cap it sets itself, so a listing of three frames does not reserve half the window, and
 * the map keeps the rest.
 *
 * `min-content` rather than `0` as the map's floor: with a floor of zero the track can be sized
 * smaller than the map's own minimum height, and the map then overflows the track and paints over
 * the table. Sized from its content, a window too short for both scrolls instead of overlapping.
 */
.app__work {
  display: grid;
  grid-template-rows: minmax(min-content, 1fr) auto;
  min-height: 0;
  /* Without this the table's widest row sets the column width and drags the whole page wider. */
  min-width: 0;
}
</style>
