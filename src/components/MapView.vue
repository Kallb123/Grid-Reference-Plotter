<script setup lang="ts">
/**
 * The map, and nothing else. All of the Leaflet handling is in `useLeafletMap`; this component
 * owns the element, the legend and the caveat that has to sit under every drawn extent.
 */

import { computed, ref, toRef } from 'vue'
import 'leaflet/dist/leaflet.css'
import type { LngLatBounds } from '../domain/bounds'
import type { Footprint, PlottedPoint } from '../domain/types'
import { useLeafletMap } from '../composables/useLeafletMap'

const props = defineProps<{
  footprints: readonly Footprint[]
  points: readonly PlottedPoint[]
  bounds: LngLatBounds | null
  selectedId: string | null
  hoveredId: string | null
}>()

const emit = defineEmits<{
  select: [id: string | null]
  hover: [id: string | null]
}>()

const container = ref<HTMLElement | null>(null)

const { fitToData } = useLeafletMap(
  container,
  {
    footprints: toRef(props, 'footprints'),
    points: toRef(props, 'points'),
    bounds: toRef(props, 'bounds'),
    selectedId: toRef(props, 'selectedId'),
    hoveredId: toRef(props, 'hoveredId'),
  },
  {
    onSelect: (id) => emit('select', id),
    onHover: (id) => emit('hover', id),
  },
)

const hasData = computed(() => props.footprints.length > 0 || props.points.length > 0)
</script>

<template>
  <div class="map">
    <div ref="container" class="map__canvas" aria-label="Map of frame footprints" role="region" />

    <div v-if="hasData" class="map__legend">
      <p class="map__key">
        <span class="map__swatch map__swatch--vertical" aria-hidden="true" />
        Vertical frame footprint
      </p>
      <p v-if="props.points.length > 0" class="map__key">
        <span class="map__swatch map__swatch--oblique" aria-hidden="true" />
        Oblique photo position (±50 m; no extent is derivable)
      </p>
      <button type="button" class="map__fit" @click="fitToData">Fit to frames</button>
    </div>

    <p v-if="hasData" class="map__caveat">
      Footprints are indicative extents from the survey's nominal target scale, not surveyed
      photograph boundaries. Individual frames vary with aircraft altitude and terrain.
    </p>
  </div>
</template>

<style scoped>
.map {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
}

.map__canvas {
  flex: 1;
  /* Big enough to be a map, but it gives way on a short window rather than pushing the table off. */
  min-height: min(20rem, 45vh);
  background: var(--rule);
}

.map__legend {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  z-index: 500;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  max-width: 16rem;
  border: 1px solid var(--rule);
  border-radius: 6px;
  padding: 0.6rem 0.75rem;
  background: var(--paper);
  font-size: 0.8rem;
}

.map__key {
  display: flex;
  gap: 0.5rem;
  align-items: baseline;
  margin: 0;
}

.map__swatch {
  flex: none;
  width: 0.85rem;
  height: 0.85rem;
  border: 2px solid;
  border-radius: 2px;
}

.map__swatch--vertical {
  border-color: #1d4ed8;
}

.map__swatch--oblique {
  border-color: #b45309;
  border-radius: 50%;
  background: rgb(180 83 9 / 60%);
}

.map__fit {
  margin-top: 0.15rem;
  border: 1px solid var(--rule);
  border-radius: 4px;
  padding: 0.2rem 0.5rem;
  background: none;
  color: inherit;
  font: inherit;
  font-size: 0.8rem;
  cursor: pointer;
}

.map__caveat {
  flex: none;
  margin: 0;
  border-top: 1px solid var(--rule);
  padding: 0.5rem 0.9rem;
  background: var(--paper);
  color: var(--ink-muted);
  font-size: 0.8rem;
}
</style>
