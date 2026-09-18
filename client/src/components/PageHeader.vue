<script setup>
defineProps({
  title: { type: String, required: true },
  subtitle: { type: String, default: '' }
});
</script>

<template>
  <div class="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-3">
    <div class="min-w-0">
      <h1 class="page-title">
        {{ title }}
      </h1>
      <p
        v-if="subtitle"
        class="meta-text mb-0"
      >
        {{ subtitle }}
      </p>
    </div>
    <div class="d-flex flex-wrap gap-2">
      <slot name="actions" />
    </div>
  </div>
</template>
