<script setup lang="ts">
/**
 * Rows that did not reach the map, and rows that did but are worth mentioning.
 *
 * This panel is the reason the parser collects `ParseIssue[]` instead of throwing: a frame that
 * fell out of a listing is a frame a customer might have bought, so it is named on screen with
 * its line number rather than silently absent (ARCHITECTURE.md §5).
 */

import { computed } from 'vue'
import type { ParseIssue } from '../domain/types'

const props = defineProps<{
  errors: readonly ParseIssue[]
  warnings: readonly ParseIssue[]
  /** Open the list without being asked — used when nothing at all reached the map. */
  startOpen?: boolean
}>()

const total = computed(() => props.errors.length + props.warnings.length)
const isOpen = computed(() => props.errors.length > 0 || props.startOpen === true)

function describeLocation(issue: ParseIssue): string {
  return issue.sheet === undefined ? `Row ${issue.line}` : `${issue.sheet}, row ${issue.line}`
}
</script>

<template>
  <details v-if="total > 0" class="issues" :open="isOpen">
    <summary class="issues__summary">
      <span v-if="props.errors.length > 0" class="issues__count issues__count--error">
        {{ props.errors.length }} row{{ props.errors.length === 1 ? '' : 's' }} not plotted
      </span>
      <span v-if="props.warnings.length > 0" class="issues__count">
        {{ props.warnings.length }} warning{{ props.warnings.length === 1 ? '' : 's' }}
      </span>
    </summary>

    <ul class="issues__list">
      <li
        v-for="(issue, index) in [...props.errors, ...props.warnings]"
        :key="`${issue.sheet ?? ''}:${issue.line}:${index}`"
        class="issues__item"
        :class="{ 'issues__item--warning': issue.severity === 'warning' }"
      >
        <span class="issues__where">{{ describeLocation(issue) }}</span>
        <span class="issues__reason">{{ issue.reason }}</span>
      </li>
    </ul>
  </details>
</template>

<style scoped>
.issues {
  border: 1px solid var(--rule);
  border-radius: 6px;
  padding: 0.5rem 0.75rem;
  font-size: 0.85rem;
}

.issues__summary {
  display: flex;
  gap: 0.75rem;
  cursor: pointer;
}

.issues__count--error {
  color: var(--danger);
}

.issues__list {
  margin: 0.6rem 0 0;
  padding: 0;
  max-height: 14rem;
  overflow-y: auto;
  list-style: none;
}

.issues__item {
  padding: 0.35rem 0;
  border-top: 1px solid var(--rule);
}

.issues__where {
  display: block;
  color: var(--danger);
  font-variant-numeric: tabular-nums;
}

.issues__item--warning .issues__where {
  color: var(--ink-muted);
}

.issues__reason {
  color: var(--ink-muted);
}
</style>
