<script setup lang="ts">
// Placeholder shell. The map, file drop and table arrive with milestones 3–5 of
// ARCHITECTURE.md §9; the domain layer underneath is already complete and tested.
</script>

<template>
  <main>
    <h1>Grid Reference Plotter</h1>
    <p class="lede">
      Plot UK aerial photography footprints from a supplier's result list. Everything runs in
      your browser — the files you load are never uploaded anywhere.
    </p>
    <p class="status">
      <strong>Under construction.</strong> The coordinate and footprint maths is in place and
      tested; the map and workbook reader are next.
    </p>
  </main>
</template>

<style scoped>
main {
  max-width: 42rem;
  margin: 0 auto;
  padding: 3rem 1.5rem;
}

h1 {
  font-size: 1.6rem;
  margin: 0 0 1rem;
}

.lede {
  margin: 0 0 1.5rem;
}

.status {
  border-top: 1px solid var(--rule);
  padding-top: 1rem;
  color: var(--ink-muted);
  font-size: 0.9rem;
}
</style>
