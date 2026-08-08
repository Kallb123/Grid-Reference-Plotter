<script setup lang="ts">
/**
 * The brand lockup: the mark, then the name.
 *
 * The mark is inlined rather than loaded from `public/brand/logo-mark.svg` for two reasons. Its
 * ink follows `currentColor`, so one component serves the light and dark grounds that the kit
 * ships as separate files; and the wordmark stays real text, in the page's own Archivo, which an
 * `<img>` of the lockup could not be — an SVG loaded as an image cannot reach the document's
 * fonts, and would fall back to Arial.
 *
 * Everything the kit fixes about the mark is fixed here: the red field is never recoloured, the
 * frames are never rotated, and the corners never round.
 */

import { computed } from 'vue'

const props = withDefaults(defineProps<{ markSize?: number }>(), { markSize: 40 })

/**
 * The mark's stroke, in the 100-unit viewBox: 5 units at 34px and above, 8 below. A stroke that
 * scaled with the mark would thin to nothing at interface sizes, so it thickens as it shrinks.
 */
const strokeWidth = computed(() => (props.markSize >= 34 ? 5 : 8))

/**
 * The frames' offset, again in viewBox units. At favicon sizes the two frames are pushed apart so
 * the red field they share stays big enough to read; at header sizes they sit at the kit's offset.
 */
const offset = computed(() => (props.markSize >= 34 ? 18 : 28))

/** Clear space is the width of the red field, which is the overlap the two frames make. */
const clearSpace = computed(() => `${((52 - offset.value) / 100) * props.markSize}px`)
</script>

<template>
  <span class="brand" :style="{ '--mark-size': `${props.markSize}px`, '--clear-space': clearSpace }">
    <svg class="brand__mark" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <rect
        x="12"
        y="12"
        width="52"
        height="52"
        fill="none"
        stroke="currentColor"
        :stroke-width="strokeWidth"
      />
      <rect
        :x="12 + offset"
        :y="12 + offset"
        width="52"
        height="52"
        fill="none"
        stroke="currentColor"
        :stroke-width="strokeWidth"
      />
      <!-- The ground both frames cover. Brand red, in both schemes, always. -->
      <rect
        :x="12 + offset"
        :y="12 + offset"
        :width="52 - offset"
        :height="52 - offset"
        fill="#ec3013"
      />
    </svg>
    <span class="brand__name">Grid Reference Plotter</span>
  </span>
</template>

<style scoped>
.brand {
  display: flex;
  gap: var(--clear-space);
  align-items: center;
}

.brand__mark {
  flex: none;
  width: var(--mark-size);
  height: var(--mark-size);
}

/*
 * The kit's lockup sets the wordmark at roughly half the height of the drawn frames. The frames
 * fill 70% of the mark's box, so that is 0.33 of the size the box is given.
 */
.brand__name {
  font-family: var(--font-heading);
  font-weight: var(--font-heading-weight);
  font-size: calc(var(--mark-size) * 0.33);
  line-height: 1.12;
  letter-spacing: -0.015em;
}
</style>
