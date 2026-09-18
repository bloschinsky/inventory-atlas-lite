<script setup>
defineProps({
  photoId: { type: [Number, String], default: null },
  name: { type: String, required: true },
  large: { type: Boolean, default: false }
});
</script>

<template>
  <div
    class="item-thumb"
    :class="{ 'item-thumb-lg': large }"
  >
    <img
      v-if="photoId"
      :src="`/api/photos/${photoId}`"
      :alt="name"
      loading="lazy"
    >
    <span
      v-else
      class="item-thumb-empty"
      aria-hidden="true"
    >No photo</span>
  </div>
</template>
