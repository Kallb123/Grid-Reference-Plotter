<script setup lang="ts">
/**
 * The walking skeleton of ARCHITECTURE.md §9.4: drop a supplier workbook, see the frames drawn,
 * and be told about anything that did not make it.
 *
 * The table and the linked selection are milestone 5; selection exists here already because the
 * map needs somewhere to put a click, and `usePhotoSet` is where the table will read it from.
 */

import { computed } from 'vue'
import FileDrop from './components/FileDrop.vue'
import IssueList from './components/IssueList.vue'
import MapView from './components/MapView.vue'
import { footprintSummary, pointSummary } from './composables/photoSummary'
import { usePhotoSet } from './composables/usePhotoSet'

const photos = usePhotoSet()

const summary = computed(() => {
  const selection = photos.selected.value
  if (selection === null) return null
  return selection.kind === 'vertical'
    ? footprintSummary(selection.footprint)
    : pointSummary(selection.point)
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

      <section v-if="summary !== null" class="detail">
        <h2 class="detail__title">{{ summary.title }}</h2>
        <p class="detail__subtitle">{{ summary.subtitle }}</p>
        <dl class="detail__lines">
          <template v-for="line in summary.lines" :key="line.label">
            <dt>{{ line.label }}</dt>
            <dd>{{ line.value }}</dd>
          </template>
        </dl>

        <h3 class="detail__heading">Ordering details</h3>
        <dl class="detail__lines">
          <template v-for="line in summary.provenance" :key="line.label">
            <dt>{{ line.label }}</dt>
            <dd>{{ line.value }}</dd>
          </template>
        </dl>
        <ul class="detail__notes">
          <li v-for="note in summary.notes" :key="note">{{ note }}</li>
        </ul>
      </section>

      <p v-else-if="!photos.isEmpty.value" class="panel__hint">
        Click a frame on the map to see the numbers behind it.
      </p>

      <footer class="panel__foot">
        Everything runs in this browser. Your file is never uploaded.
      </footer>
    </aside>

    <main class="app__map">
      <MapView
        :footprints="photos.footprints.value"
        :points="photos.points.value"
        :bounds="photos.bounds.value"
        :selected-id="photos.selectedId.value"
        @select="photos.select"
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

.app__map {
  min-height: 0;
}

.detail {
  border: 1px solid var(--rule);
  border-radius: 6px;
  padding: 0.75rem 0.9rem;
}

.detail__title {
  margin: 0;
  font-size: 1rem;
}

.detail__subtitle {
  margin: 0 0 0.6rem;
  color: var(--ink-muted);
  font-size: 0.85rem;
}

.detail__heading {
  margin: 0.9rem 0 0.3rem;
  color: var(--ink-muted);
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.detail__lines {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.15rem 0.75rem;
  margin: 0;
  font-size: 0.85rem;
}

.detail__lines dt {
  color: var(--ink-muted);
}

.detail__lines dd {
  margin: 0;
}

.detail__notes {
  margin: 0.75rem 0 0;
  padding-left: 1.1rem;
  color: var(--ink-muted);
  font-size: 0.78rem;
}
</style>
