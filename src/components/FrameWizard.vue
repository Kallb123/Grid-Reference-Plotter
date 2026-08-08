<script setup lang="ts">
/**
 * A few questions, asked one at a time, that narrow fifty frames to the handful worth ordering.
 *
 * The first of them is the reason this exists. A catalogue says `1:10 500`, and almost nobody
 * buying a photograph knows what that means — but everybody knows whether they need to see the
 * extension on the back of a house or the shape of a village. So the scale is asked for as a
 * slider of plain descriptions, from a landscape in one frame to a garden fence, and the
 * denominator is shown alongside as the thing it actually is rather than as the question.
 *
 * It is a wizard rather than a row of controls because the questions are not equally obvious.
 * Taken one at a time, with the number of surviving frames under each, the answer to "what do I
 * do with a listing of fifty" becomes four decisions instead of one blank form — and because
 * nothing here is a submit step, the map and the table narrow as each one is made rather than at
 * the end.
 *
 * Every step is dropped when the listing cannot answer it: no scales, no dates, no site marked,
 * no `Held` column. A control that cannot change anything reads as a broken one.
 *
 * No arithmetic and no vocabulary of its own. Which frames pass is `domain/filter`, what a scale
 * looks like on the ground is `domain/detail`, and the summary wording is `photoSummary` — all
 * three tested without a browser.
 */

import { computed, ref, useId, watch } from 'vue'
import { describeFilter, describeUnjudged } from '../composables/photoSummary'
import {
  DETAIL_BANDS,
  FINEST_DETAIL_INDEX,
  detailThresholdText,
  formatScale,
} from '../domain/detail'
import type { ScaleSpan } from '../composables/useFrameFilter'
import type { CoverageDemand, FilterCriterion, FrameFilter } from '../domain/filter'

const props = defineProps<{
  filter: FrameFilter
  /** Which questions this listing can answer; the rest are not asked. */
  available: Record<FilterCriterion, boolean>
  isActive: boolean
  matched: number
  total: number
  unjudged: readonly FilterCriterion[]
  unjudgedCount: number
  /** Every year the listing gives, ascending. */
  years: readonly number[]
  /** Verticals at each detail band or finer, so the slider can report as it moves. */
  framesAtLeastDetail: readonly number[]
  /** What the listing itself spans, so the slider can be honest about the range on offer. */
  scaleSpan: ScaleSpan | null
}>()

const emit = defineEmits<{
  change: [patch: Partial<FrameFilter>]
  clear: []
}>()

type StepKey = FilterCriterion

interface Step {
  key: StepKey
  /** The chip above the question, so the reader knows where they are. */
  label: string
  question: string
}

const ALL_STEPS: readonly Step[] = [
  { key: 'detail', label: 'Detail', question: 'What do you need to be able to see?' },
  { key: 'date', label: 'Date', question: 'When should the photograph be from?' },
  { key: 'coverage', label: 'Your site', question: 'How much of your site must be in the frame?' },
  { key: 'print', label: 'Prints', question: 'Does a print have to exist already?' },
]

const COVERAGE_CHOICES: readonly { value: CoverageDemand; label: string; note: string }[] = [
  { value: 'any', label: 'Anywhere in the listing', note: 'Including the frames that miss it.' },
  { value: 'partial', label: 'Some of it', note: 'The frame reaches the site at all.' },
  {
    value: 'full',
    label: 'All of it',
    note: 'The whole site is inside the frame’s indicative extent.',
  },
]

const open = ref(false)
const stepIndex = ref(0)
const sliderId = useId()

const steps = computed(() => ALL_STEPS.filter((step) => props.available[step.key]))
const step = computed(() => steps.value[stepIndex.value] ?? null)
const isLastStep = computed(() => stepIndex.value >= steps.value.length - 1)

/** The band the slider is sitting on: what a frame at the chosen threshold actually shows. */
const band = computed(() => DETAIL_BANDS[props.filter.minDetail] ?? DETAIL_BANDS[0])
const detailCount = computed(() => props.framesAtLeastDetail[props.filter.minDetail] ?? 0)
const verticalCount = computed(() => props.framesAtLeastDetail[0] ?? 0)

const criteria = computed(() => describeFilter(props.filter))
const unjudgedNote = computed(() => describeUnjudged(props.unjudged, props.unjudgedCount))

/**
 * The count under every step, which is the whole reason the map and the table update as the
 * wizard is used rather than when it is finished.
 */
const matchedText = computed(() =>
  props.isActive
    ? `${props.matched} of ${props.total} frames match`
    : `All ${props.total} frames shown`,
)

// A listing replaced by another one, or a site marked part-way through, can take a step away
// from under the reader. Landing on the last remaining question is better than landing on none.
watch(steps, (available) => {
  if (stepIndex.value >= available.length) stepIndex.value = Math.max(0, available.length - 1)
})

function begin(): void {
  open.value = true
  stepIndex.value = 0
}

function back(): void {
  stepIndex.value = Math.max(0, stepIndex.value - 1)
}

function next(): void {
  if (isLastStep.value) open.value = false
  else stepIndex.value += 1
}

function setDetail(value: string): void {
  emit('change', { minDetail: Number(value) })
}

/**
 * A year bound, keeping the two of them in order.
 *
 * Dragging "from" past "to" is a natural thing to do and would otherwise leave a range that
 * matches nothing, with no visible reason why. The other end follows rather than refusing.
 */
function setYear(end: 'fromYear' | 'toYear', value: string): void {
  const year = value === '' ? null : Number(value)
  const patch: Partial<FrameFilter> = { [end]: year }

  if (year !== null && end === 'fromYear' && props.filter.toYear !== null && year > props.filter.toYear) {
    patch.toYear = year
  }
  if (year !== null && end === 'toYear' && props.filter.fromYear !== null && year < props.filter.fromYear) {
    patch.fromYear = year
  }

  emit('change', patch)
}

function clear(): void {
  emit('clear')
}
</script>

<template>
  <section v-if="steps.length > 0" class="wizard">
    <header class="wizard__head">
      <h2 class="wizard__title">Narrow the listing</h2>
      <p class="wizard__count">{{ matchedText }}</p>
    </header>

    <template v-if="!open">
      <p v-if="!props.isActive" class="wizard__lede">
        A results file is one town photographed a dozen times over fifty years. Answer
        {{ steps.length }} question{{ steps.length === 1 ? '' : 's' }} — starting with what you
        need to be able to see — and the map and the table narrow to the frames that fit.
      </p>

      <ul v-else class="wizard__criteria">
        <li v-for="criterion in criteria" :key="criterion">{{ criterion }}</li>
      </ul>

      <div class="wizard__actions">
        <button type="button" class="wizard__button" @click="begin">
          {{ props.isActive ? 'Change' : 'Help me choose' }}
        </button>
        <button v-if="props.isActive" type="button" class="wizard__button" @click="clear">
          Show everything
        </button>
      </div>
    </template>

    <template v-else-if="step !== null">
      <p class="wizard__step">
        Step {{ stepIndex + 1 }} of {{ steps.length }} — {{ step.label }}
      </p>

      <!--
        Detail. The slider is a floor rather than a selection: somebody who needs to see a garden
        fence will not turn down a finer frame that also shows it.
      -->
      <template v-if="step.key === 'detail'">
        <label class="wizard__question" :for="sliderId">{{ step.question }}</label>
        <input
          :id="sliderId"
          class="wizard__slider"
          type="range"
          min="0"
          :max="FINEST_DETAIL_INDEX"
          step="1"
          :value="props.filter.minDetail"
          :aria-valuetext="`${band?.label ?? ''}: ${detailThresholdText(props.filter.minDetail)}`"
          @input="setDetail(($event.target as HTMLInputElement).value)"
        />
        <p class="wizard__ends" aria-hidden="true">
          <span>Wider view</span>
          <span>Finer detail</span>
        </p>

        <p class="wizard__band">{{ band?.label }}</p>
        <p class="wizard__visible">{{ band?.visible }}</p>
        <p class="wizard__cost">{{ band?.cost }}</p>

        <p class="wizard__reading">
          {{ detailThresholdText(props.filter.minDetail) }} —
          {{ detailCount }} of {{ verticalCount }} vertical frames.
        </p>
        <p v-if="props.scaleSpan !== null" class="wizard__note">
          This listing runs from {{ formatScale(props.scaleSpan.coarsest) }} to
          {{ formatScale(props.scaleSpan.finest) }}. The scale is the survey’s nominal target, so
          what a frame really shows varies with the aircraft’s height and the ground beneath it.
        </p>
      </template>

      <!-- Date. Only the years the listing actually contains are offered. -->
      <template v-else-if="step.key === 'date'">
        <p class="wizard__question">{{ step.question }}</p>
        <div class="wizard__years">
          <label class="wizard__field">
            <span>From</span>
            <select
              :value="props.filter.fromYear ?? ''"
              @change="setYear('fromYear', ($event.target as HTMLSelectElement).value)"
            >
              <option value="">Earliest</option>
              <option v-for="year in props.years" :key="year" :value="year">{{ year }}</option>
            </select>
          </label>
          <label class="wizard__field">
            <span>To</span>
            <select
              :value="props.filter.toYear ?? ''"
              @change="setYear('toYear', ($event.target as HTMLSelectElement).value)"
            >
              <option value="">Latest</option>
              <option v-for="year in props.years" :key="year" :value="year">{{ year }}</option>
            </select>
          </label>
        </div>
        <p class="wizard__note">
          This listing was flown between {{ props.years[0] }} and
          {{ props.years[props.years.length - 1] }}.
        </p>
      </template>

      <!-- Coverage. Offered only once a site has been marked, since nothing else has a verdict. -->
      <template v-else-if="step.key === 'coverage'">
        <p class="wizard__question">{{ step.question }}</p>
        <div class="wizard__choices" role="radiogroup" :aria-label="step.question">
          <label v-for="choice in COVERAGE_CHOICES" :key="choice.value" class="wizard__choice">
            <input
              type="radio"
              name="coverage-demand"
              :value="choice.value"
              :checked="props.filter.coverage === choice.value"
              @change="emit('change', { coverage: choice.value })"
            />
            <span>
              {{ choice.label }}
              <small>{{ choice.note }}</small>
            </span>
          </label>
        </div>
        <p class="wizard__note">
          Measured against indicative extents positioned by centre points good to ±50 m, so a
          frame that only just covers the site may not.
        </p>
      </template>

      <!-- Prints. `P` and `N` are the archive's own codes; anything else is left alone. -->
      <template v-else>
        <p class="wizard__question">{{ step.question }}</p>
        <label class="wizard__choice">
          <input
            type="checkbox"
            :checked="props.filter.printHeldOnly"
            @change="
              emit('change', { printHeldOnly: ($event.target as HTMLInputElement).checked })
            "
          />
          <span>
            Only frames with a print held
            <small>Frames marked “N” have to be printed from the film to order.</small>
          </span>
        </label>
      </template>

      <div class="wizard__actions">
        <button v-if="stepIndex > 0" type="button" class="wizard__button" @click="back">
          Back
        </button>
        <button type="button" class="wizard__button wizard__button--go" @click="next">
          {{ isLastStep ? 'Done' : 'Next' }}
        </button>
        <button v-if="props.isActive" type="button" class="wizard__button" @click="clear">
          Show everything
        </button>
      </div>

      <p v-if="!props.available.coverage" class="wizard__note">
        Mark your site above and this listing can be filtered by what covers it as well.
      </p>
    </template>

    <!--
      Said wherever the filter is visible, open or shut: a criterion a frame carries nothing to
      answer never rejects it, so a narrowed listing can contain frames that were not tested.
    -->
    <p v-if="unjudgedNote !== null" class="wizard__note">{{ unjudgedNote }}</p>
  </section>
</template>

<style scoped>
.wizard {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  border: 1px solid var(--rule);
  border-radius: var(--radius-md);
  padding: 0.75rem 0.9rem;
}

.wizard__head {
  display: flex;
  gap: 0.75rem;
  align-items: baseline;
}

.wizard__title {
  margin: 0;
  font-size: 1rem;
}

.wizard__count {
  margin: 0 0 0 auto;
  color: var(--ink-muted);
  font-size: 0.8rem;
  font-variant-numeric: tabular-nums;
}

.wizard__lede,
.wizard__note,
.wizard__cost {
  margin: 0;
  color: var(--ink-muted);
  font-size: 0.8rem;
}

/* Where the reader is, in the same uppercase key the site panel uses for its own headings. */
.wizard__step {
  margin: 0;
  color: var(--ink-muted);
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.wizard__question {
  display: block;
  margin: 0;
  font-family: var(--font-heading);
  font-weight: var(--font-heading-weight);
  font-size: 0.9rem;
}

.wizard__slider {
  width: 100%;
  margin: 0.25rem 0 0;
  accent-color: var(--accent);
}

.wizard__ends {
  display: flex;
  justify-content: space-between;
  margin: -0.35rem 0 0;
  color: var(--ink-muted);
  font-size: 0.7rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

/* The band's name is the answer the slider gives, so it is the one thing here set in the heading
   face — the scale below it is the catalogue's number for the same fact. */
.wizard__band {
  margin: 0;
  font-family: var(--font-heading);
  font-weight: var(--font-heading-weight);
  font-size: 1rem;
}

.wizard__visible {
  margin: 0;
  font-size: 0.85rem;
}

.wizard__reading {
  margin: 0;
  padding-left: 0.6rem;
  border-left: var(--rule-weight) solid var(--accent);
  font-size: 0.8rem;
  font-variant-numeric: tabular-nums;
}

.wizard__criteria {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.wizard__criteria li {
  border: 1px solid var(--rule);
  border-radius: var(--radius-md);
  padding: 0.05rem 0.4rem;
  background: var(--accent-wash);
  font-size: 0.78rem;
}

.wizard__years {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.wizard__field {
  display: flex;
  gap: 0.4rem;
  align-items: baseline;
  font-size: 0.85rem;
}

.wizard__field select {
  border: 1px solid var(--rule);
  border-radius: var(--radius-md);
  padding: 0.15rem 0.3rem;
  background: var(--paper);
  color: var(--ink);
  font-family: var(--font-body);
  font-size: 0.85rem;
}

.wizard__choices {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.wizard__choice {
  display: flex;
  gap: 0.45rem;
  align-items: baseline;
  font-size: 0.85rem;
  cursor: pointer;
}

.wizard__choice input {
  accent-color: var(--accent);
}

.wizard__choice small {
  display: block;
  color: var(--ink-muted);
  font-size: 0.75rem;
}

.wizard__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-top: 0.15rem;
}

.wizard__button {
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

.wizard__button:hover {
  background: color-mix(in srgb, var(--ink) 7%, transparent);
}

.wizard__button:active {
  background: color-mix(in srgb, var(--ink) 14%, transparent);
}

/* The one button that moves the reader on carries the accent border; the rest are quiet. */
.wizard__button--go {
  border-color: var(--accent);
}
</style>
