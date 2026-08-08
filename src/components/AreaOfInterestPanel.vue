<script setup lang="ts">
/**
 * Marking the site, and what the listing says about it.
 *
 * This is the control half of milestone 6; the map is the other half. The panel is where a site
 * is started, described back and cleared, and where the listing's verdict is stated in one
 * sentence before the table breaks it down frame by frame.
 *
 * No arithmetic and no geometry. The coverage comes from `domain/coverage` and the wording from
 * `photoSummary`, both of which are tested without a browser.
 */

import { computed } from 'vue'
import { areaOfInterestSummary, describeTally } from '../composables/photoSummary'
import type { SiteCoverage } from '../domain/coverage'
import type { AreaOfInterest } from '../domain/types'
import type { DrawMode } from '../composables/useAreaOfInterest'

const props = defineProps<{
  area: AreaOfInterest | null
  areaError: string | null
  coverage: SiteCoverage | null
  drawMode: DrawMode
  hideMisses: boolean
  /**
   * Frames that miss the site *and are still on screen* — counted outside this component,
   * because the wizard's own coverage question may already have taken some of them away.
   *
   * The two controls overlap and are deliberately not the same: this tick empties the table
   * while leaving the map alone, which is where a miss is worth seeing — a run that went a
   * kilometre north is the shape of the sortie. The wizard's answer is the broader one and
   * takes them off both.
   */
  missCount: number
  /** Whether a listing has been loaded at all, which changes what marking a site is worth. */
  hasFrames: boolean
}>()

const emit = defineEmits<{
  begin: [mode: Exclude<DrawMode, 'none'>]
  'cancel-draw': []
  clear: []
  'update:hideMisses': [value: boolean]
}>()

const summary = computed(() => (props.area === null ? null : areaOfInterestSummary(props.area)))
const tally = computed(() =>
  props.coverage === null ? null : describeTally(props.coverage.tally),
)
</script>

<template>
  <section class="site">
    <h2 class="site__title">Your site</h2>

    <p v-if="props.area === null && props.drawMode === 'none'" class="site__lede">
      Mark the place you want photographs of, and every frame is measured against it — how much of
      the site it covers, and how close to the edge of the picture the site falls.
    </p>

    <p v-if="props.drawMode !== 'none'" class="site__drawing">
      {{
        props.drawMode === 'point'
          ? 'Click the map to drop a pin.'
          : 'Click the map to place corners.'
      }}
    </p>

    <p v-if="props.areaError !== null" class="site__error" role="alert">
      {{ props.areaError }}
    </p>

    <template v-if="summary !== null">
      <p class="site__kind">{{ summary.title }}</p>
      <dl class="site__lines">
        <template v-for="line in summary.lines" :key="line.label">
          <dt>{{ line.label }}</dt>
          <dd>{{ line.value }}</dd>
        </template>
      </dl>
    </template>

    <p v-if="tally !== null && props.hasFrames" class="site__tally">{{ tally }}</p>
    <p v-else-if="props.area !== null" class="site__lede">
      Load a results workbook to see which frames cover it.
    </p>

    <label v-if="props.missCount > 0" class="site__filter">
      <input
        type="checkbox"
        :checked="props.hideMisses"
        @change="emit('update:hideMisses', ($event.target as HTMLInputElement).checked)"
      />
      Leave the {{ props.missCount }} frame{{ props.missCount === 1 ? '' : 's' }} that miss it out of the table
    </label>

    <div class="site__actions">
      <template v-if="props.drawMode === 'none'">
        <!--
          The labels follow what is actually marked: "move the pin" only makes sense when there
          is a pin, and after drawing an outline the pin button is starting a new site, not
          nudging the old one.
        -->
        <button type="button" class="site__button" @click="emit('begin', 'point')">
          {{ props.area?.kind === 'point' ? 'Move the pin' : 'Drop a pin' }}
        </button>
        <button type="button" class="site__button" @click="emit('begin', 'polygon')">
          {{ props.area?.kind === 'polygon' ? 'Draw a new outline' : 'Draw an outline' }}
        </button>
        <button
          v-if="props.area !== null"
          type="button"
          class="site__button"
          @click="emit('clear')"
        >
          Clear
        </button>
      </template>
      <button v-else type="button" class="site__button" @click="emit('cancel-draw')">
        Cancel
      </button>
    </div>

    <!--
      Said once, here, rather than beside every number: a coverage figure is a comparison with an
      estimated extent, and the estimate is the part that can be wrong.
    -->
    <p v-if="props.area !== null && props.hasFrames" class="site__caveat">
      Coverage is measured against indicative extents, from nominal scales and centre points good
      to ±50 m. A frame that only just covers the site may not.
    </p>
  </section>
</template>

<style scoped>
.site {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  border: 1px solid var(--rule);
  border-radius: var(--radius-md);
  padding: 0.75rem 0.9rem;
}

.site__title {
  margin: 0;
  font-size: 1rem;
}

.site__lede,
.site__caveat {
  margin: 0;
  color: var(--ink-muted);
  font-size: 0.8rem;
}

/* The palette is mono, so a refusal is marked by a rule and a deep step of the accent. */
.site__error {
  margin: 0;
  padding-left: 0.6rem;
  border-left: var(--rule-weight) solid var(--danger);
  color: var(--danger);
  font-size: 0.8rem;
}

.site__drawing {
  margin: 0;
  padding-left: 0.6rem;
  border-left: var(--rule-weight) solid var(--accent);
  font-size: 0.85rem;
}

.site__kind {
  margin: 0;
  color: var(--ink-muted);
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.site__lines {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.15rem 0.75rem;
  margin: 0;
  font-size: 0.85rem;
}

.site__lines dt {
  color: var(--ink-muted);
}

.site__lines dd {
  margin: 0;
}

.site__tally {
  margin: 0;
  font-size: 0.85rem;
}

.site__filter {
  display: flex;
  gap: 0.45rem;
  align-items: baseline;
  font-size: 0.8rem;
  cursor: pointer;
}

.site__filter input {
  accent-color: var(--accent);
}

.site__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.site__button {
  border: 1px solid var(--rule);
  border-radius: var(--radius-md);
  padding: 0.2rem 0.55rem;
  background: none;
  color: var(--ink);
  font-family: var(--font-heading);
  font-weight: var(--font-heading-weight);
  font-size: 0.8rem;
  cursor: pointer;
}

.site__button:hover {
  background: color-mix(in srgb, var(--ink) 7%, transparent);
}

.site__button:active {
  background: color-mix(in srgb, var(--ink) 14%, transparent);
}
</style>
