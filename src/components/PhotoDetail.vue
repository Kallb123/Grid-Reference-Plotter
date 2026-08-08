<script setup lang="ts">
/**
 * One frame: the derived numbers, the inputs they came from, and the caveats that come with them.
 *
 * Lifted out of `App.vue` now that a frame can be chosen in two places. The content is
 * `photoSummary`'s, the same data the map popup renders — a popup covers the frames around the
 * one it describes, so the full detail lives beside the map where it can be read against the
 * table.
 *
 * The notes are not decoration. They are what separates an indicative extent from a claim about
 * where a photograph's edges are, and this component shows every one it is given
 * (ARCHITECTURE.md §8.4).
 */

import { computed } from 'vue'
import { footprintSummary, pointSummary } from '../composables/photoSummary'
import type { Selection } from '../composables/usePhotoSet'

const props = defineProps<{ selection: Selection | null }>()

const summary = computed(() => {
  const selection = props.selection
  if (selection === null) return null
  return selection.kind === 'vertical'
    ? footprintSummary(selection.footprint)
    : pointSummary(selection.point)
})
</script>

<template>
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
</template>

<style scoped>
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
