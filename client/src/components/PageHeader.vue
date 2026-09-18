<script setup>
defineProps({
  title: { type: String, required: true },
  subtitle: { type: String, default: '' }
});
</script>

<template>
  <div class="page-header d-print-none mb-3">
    <div class="row g-2 align-items-center">
      <div class="col min-w-0">
        <h1 class="page-title text-break">
          {{ title }}
        </h1>
        <div
          v-if="subtitle"
          class="page-subtitle"
        >
          {{ subtitle }}
        </div>
      </div>
      <div class="col-auto ms-auto d-flex flex-wrap gap-2">
        <slot name="actions" />
      </div>
    </div>
  </div>
</template>
