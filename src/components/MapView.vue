<script setup lang="ts">
/**
 * The map, and nothing else. All of the Leaflet handling is in `useLeafletMap`; this component
 * owns the element, the legend, the prompt shown while a site is being drawn, and the caveat that
 * has to sit under every drawn extent.
 */

import { computed, ref, toRef } from 'vue'
import 'leaflet/dist/leaflet.css'
import type { LngLatBounds } from '../domain/bounds'
import type { SiteCoverage } from '../domain/coverage'
import type { AreaOfInterest, Footprint, PlottedPoint } from '../domain/types'
import {
  AREA_COLOUR,
  OBLIQUE_COLOUR,
  VERTICAL_COLOUR,
  useLeafletMap,
} from '../composables/useLeafletMap'
import { MINIMUM_OUTLINE_VERTICES } from '../composables/useAreaOfInterest'
import type { DrawMode } from '../composables/useAreaOfInterest'

const props = defineProps<{
  footprints: readonly Footprint[]
  points: readonly PlottedPoint[]
  bounds: LngLatBounds | null
  selectedId: string | null
  hoveredId: string | null
  area: AreaOfInterest | null
  coverage: SiteCoverage | null
  drawMode: DrawMode
  /** Corners placed so far, so the prompt can say whether the outline can be closed. */
  placedVertices: number
}>()

const emit = defineEmits<{
  select: [id: string | null]
  hover: [id: string | null]
  area: [area: AreaOfInterest]
  'cancel-draw': []
  'vertex-placed': [count: number]
}>()

const container = ref<HTMLElement | null>(null)

const { fitToData, fitToArea, finishDrawing, cancelDrawing } = useLeafletMap(
  container,
  {
    footprints: toRef(props, 'footprints'),
    points: toRef(props, 'points'),
    bounds: toRef(props, 'bounds'),
    selectedId: toRef(props, 'selectedId'),
    hoveredId: toRef(props, 'hoveredId'),
    area: toRef(props, 'area'),
    coverage: toRef(props, 'coverage'),
    drawMode: toRef(props, 'drawMode'),
  },
  {
    onSelect: (id) => emit('select', id),
    onHover: (id) => emit('hover', id),
    onAreaDrawn: (area) => emit('area', area),
    onDrawCancelled: () => emit('cancel-draw'),
    onVertexPlaced: (count) => emit('vertex-placed', count),
  },
)

const hasData = computed(() => props.footprints.length > 0 || props.points.length > 0)
const canFinish = computed(
  () => props.drawMode === 'polygon' && props.placedVertices >= MINIMUM_OUTLINE_VERTICES,
)

/**
 * What to do next, spelled out on the map rather than only in the panel.
 *
 * A user in the middle of drawing is looking at the map, not at the sidebar, and "click the
 * first corner again" is not guessable.
 */
const prompt = computed(() => {
  if (props.drawMode === 'point') return 'Click the map to drop a pin on your site.'
  if (props.placedVertices === 0) return 'Click the map to place the first corner of your site.'
  if (!canFinish.value) {
    const remaining = MINIMUM_OUTLINE_VERTICES - props.placedVertices
    return `${props.placedVertices} corner${props.placedVertices === 1 ? '' : 's'} placed; ${remaining} more to make a shape.`
  }
  return `${props.placedVertices} corners placed. Click the first corner again, or press Enter, to close the outline.`
})
</script>

<template>
  <div class="map">
    <div ref="container" class="map__canvas" aria-label="Map of frame footprints" role="region" />

    <div v-if="props.drawMode !== 'none'" class="map__prompt" role="status">
      <p class="map__prompt-text">{{ prompt }}</p>
      <div class="map__prompt-actions">
        <button
          v-if="props.drawMode === 'polygon'"
          type="button"
          class="map__button"
          :disabled="!canFinish"
          @click="finishDrawing"
        >
          Finish outline
        </button>
        <button type="button" class="map__button" @click="cancelDrawing">Cancel (Esc)</button>
      </div>
    </div>

    <div v-if="hasData" class="map__legend">
      <p class="map__key">
        <span
          class="map__swatch"
          :style="{ borderColor: VERTICAL_COLOUR }"
          aria-hidden="true"
        />
        Vertical frame footprint
      </p>
      <p v-if="props.points.length > 0" class="map__key">
        <span
          class="map__swatch map__swatch--oblique"
          :style="{
            borderColor: OBLIQUE_COLOUR,
            background: `color-mix(in srgb, ${OBLIQUE_COLOUR} 60%, transparent)`,
          }"
          aria-hidden="true"
        />
        Oblique photo position (±50 m; no extent is derivable)
      </p>
      <p v-if="props.area !== null" class="map__key">
        <span
          class="map__swatch map__swatch--area"
          :style="{
            borderColor: AREA_COLOUR,
            background: `color-mix(in srgb, ${AREA_COLOUR} 18%, transparent)`,
          }"
          aria-hidden="true"
        />
        Your site; frames that miss it are faded
      </p>
      <div class="map__buttons">
        <button type="button" class="map__button" @click="fitToData">Fit to frames</button>
        <button v-if="props.area !== null" type="button" class="map__button" @click="fitToArea">
          Fit to site
        </button>
      </div>
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

/*
 * While a site is being drawn the pointer has to say that a click places something rather than
 * dragging the map. `!important` because the competition is not another rule: Leaflet's canvas
 * renderer writes `cursor: pointer` straight onto this element's style attribute whenever the
 * pointer is over a frame, and no amount of specificity beats an inline style.
 */
.map__canvas--drawing {
  cursor: crosshair !important;
}

.map__legend,
.map__prompt {
  position: absolute;
  z-index: 500;
  /*
   * Fixed brand colours rather than the scheme's: these panels float on the basemap, and the
   * basemap is a light raster in both schemes — as are Leaflet's own zoom and scale controls.
   */
  border: 1px solid color-mix(in srgb, var(--brand-ink) 40%, transparent);
  border-radius: var(--radius-md);
  padding: 0.6rem 0.75rem;
  background: var(--brand-ground);
  color: var(--brand-ink);
  font-size: 0.8rem;
}

.map__legend {
  top: 0.75rem;
  right: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  max-width: 16rem;
}

/*
 * The prompt sits top-left, away from the legend and away from Leaflet's zoom control, and is
 * marked out by the accent border because it is the one panel that is asking for something.
 */
.map__prompt {
  top: 0.75rem;
  left: 3.5rem;
  display: flex;
  gap: 0.75rem;
  align-items: center;
  flex-wrap: wrap;
  max-width: min(30rem, calc(100% - 5rem));
  border-color: var(--brand-red);
  border-left-width: var(--rule-weight);
}

.map__prompt-text {
  margin: 0;
}

.map__prompt-actions {
  display: flex;
  gap: 0.35rem;
  margin-left: auto;
}

.map__key {
  display: flex;
  gap: 0.5rem;
  align-items: baseline;
  margin: 0;
}

/* Colours come from the map's own constants, bound inline — see the note beside them. */
.map__swatch {
  flex: none;
  width: 0.85rem;
  height: 0.85rem;
  border: 2px solid;
  border-radius: var(--radius-md);
}

/* Round, because an oblique is a position and not an extent. */
.map__swatch--oblique {
  border-radius: 50%;
}

/* Dashed, as it is drawn: the user's own mark rather than something out of the file. */
.map__swatch--area {
  border-style: dashed;
}

.map__buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-top: 0.15rem;
}

.map__button {
  border: 1px solid color-mix(in srgb, var(--brand-ink) 40%, transparent);
  border-radius: var(--radius-md);
  padding: 0.2rem 0.5rem;
  background: none;
  color: inherit;
  font-family: var(--font-heading);
  font-weight: var(--font-heading-weight);
  font-size: 0.8rem;
  /* Wider than its label, so the label starts at the left padding edge rather than centring. */
  text-align: left;
  cursor: pointer;
}

.map__button:hover:not(:disabled) {
  background: color-mix(in srgb, var(--brand-ink) 7%, transparent);
}

.map__button:active:not(:disabled) {
  background: color-mix(in srgb, var(--brand-ink) 14%, transparent);
}

.map__button:disabled {
  opacity: 0.45;
  cursor: default;
}

.map__caveat {
  flex: none;
  margin: 0;
  border-top: var(--rule-weight) solid var(--rule);
  padding: 0.5rem 0.9rem;
  background: var(--paper);
  color: var(--ink-muted);
  font-size: 0.8rem;
}
</style>
