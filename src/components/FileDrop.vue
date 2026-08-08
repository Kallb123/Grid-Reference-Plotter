<script setup lang="ts">
/**
 * Drag-and-drop or pick a supplier workbook.
 *
 * The file is handed straight to the parent as a `File`; nothing is uploaded and nothing is
 * copied anywhere. That is a property of the app worth stating on the control itself, because
 * the files people load here are their own customer enquiry data.
 */

import { ref } from 'vue'
import type { LoadStatus } from '../composables/usePhotoSet'

const props = defineProps<{
  status: LoadStatus
  fileName: string | null
  error: string | null
}>()

const emit = defineEmits<{
  file: [file: File]
  clear: []
}>()

/** What the reader accepts (INPUT-FORMAT.md §7.1): the sample is `.xls`, but `.xlsx` is likely. */
const ACCEPT = '.xls,.xlsx,.csv'

const input = ref<HTMLInputElement | null>(null)
const isDragging = ref(false)

function openPicker(): void {
  input.value?.click()
}

function onPicked(event: Event): void {
  const [file] = (event.target as HTMLInputElement).files ?? []
  if (file !== undefined) emit('file', file)
  // Reset, so picking the same file twice in a row fires `change` the second time too.
  if (input.value !== null) input.value.value = ''
}

function onDrop(event: DragEvent): void {
  isDragging.value = false
  const [file] = event.dataTransfer?.files ?? []
  if (file !== undefined) emit('file', file)
}
</script>

<template>
  <section class="drop" :class="{ 'drop--active': isDragging }">
    <div
      class="drop__target"
      role="button"
      tabindex="0"
      @click="openPicker"
      @keydown.enter.prevent="openPicker"
      @keydown.space.prevent="openPicker"
      @dragover.prevent="isDragging = true"
      @dragenter.prevent="isDragging = true"
      @dragleave="isDragging = false"
      @drop.prevent="onDrop"
    >
      <p class="drop__prompt">
        <strong>Drop a results workbook here</strong>, or click to choose one.
      </p>
      <p class="drop__hint">
        Excel <code>.xls</code> or <code>.xlsx</code> from an aerial photography supplier. The
        file is read in this browser and is not uploaded anywhere.
      </p>
    </div>

    <!--
      Outside the drop target on purpose. `input.click()` dispatches an event that bubbles, so an
      input nested inside the clickable region would re-enter `openPicker` and recurse.
    -->
    <input ref="input" class="drop__input" type="file" :accept="ACCEPT" @change="onPicked" />

    <p v-if="props.status === 'loading'" class="drop__state">Reading {{ props.fileName }}…</p>
    <p v-else-if="props.error !== null" class="drop__state drop__state--error">
      {{ props.error }}
    </p>
    <p v-else-if="props.fileName !== null" class="drop__state">
      <span class="drop__file">{{ props.fileName }}</span>
      <button type="button" class="drop__clear" @click="emit('clear')">Clear</button>
    </p>
  </section>
</template>

<style scoped>
.drop__target {
  display: block;
  width: 100%;
  border: 2px dashed var(--rule);
  border-radius: 8px;
  padding: 1.25rem;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.drop__target:hover,
.drop__target:focus-visible,
.drop--active .drop__target {
  border-color: var(--accent);
  background: var(--accent-wash);
}

.drop__prompt {
  margin: 0 0 0.4rem;
}

.drop__hint {
  margin: 0;
  font-size: 0.85rem;
  color: var(--ink-muted);
}

.drop__input {
  display: none;
}

.drop__state {
  display: flex;
  gap: 0.6rem;
  align-items: baseline;
  margin: 0.75rem 0 0;
  font-size: 0.9rem;
  color: var(--ink-muted);
}

.drop__state--error {
  color: var(--danger);
}

.drop__file {
  overflow-wrap: anywhere;
}

.drop__clear {
  margin-left: auto;
  border: 1px solid var(--rule);
  border-radius: 4px;
  padding: 0.15rem 0.5rem;
  background: none;
  color: inherit;
  font: inherit;
  font-size: 0.85rem;
  cursor: pointer;
}
</style>
