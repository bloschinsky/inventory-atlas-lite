<script setup>
import { computed, ref, watch } from 'vue';

const props = defineProps({ photos: { type: Array, required: true } });
defineEmits(['delete']);

const index = ref(0);
// Deleting the last photo of the list must not leave the viewer pointing past the end.
watch(() => props.photos.length, length => { if (index.value >= length) index.value = Math.max(0, length - 1); });

const current = computed(() => props.photos[index.value] || null);
const move = step => { index.value = (index.value + step + props.photos.length) % props.photos.length; };
</script>

<template>
  <section
    class="card"
    aria-labelledby="photos-heading"
  >
    <h2
      id="photos-heading"
      class="visually-hidden"
    >
      Photos
    </h2>
    <div
      v-if="!current"
      class="photo-frame"
    >
      <p class="photo-empty mb-0">
        No photos for this item yet.
      </p>
    </div>
    <template v-else>
      <div class="photo-frame">
        <img
          :src="`/api/photos/${current.id}`"
          :alt="current.filename"
        >
      </div>
      <div class="card-body d-flex flex-wrap align-items-center gap-2 py-2">
        <template v-if="photos.length > 1">
          <button
            type="button"
            class="btn btn-sm btn-outline-secondary"
            aria-label="Previous photo"
            @click="move(-1)"
          >
            Previous
          </button>
          <button
            type="button"
            class="btn btn-sm btn-outline-secondary"
            aria-label="Next photo"
            @click="move(1)"
          >
            Next
          </button>
          <span class="meta-text">{{ index + 1 }} / {{ photos.length }}</span>
        </template>
        <span class="meta-text text-truncate flex-grow-1">{{ current.filename }}</span>
        <button
          type="button"
          class="btn btn-sm btn-outline-danger ms-auto"
          aria-label="Delete photo"
          @click="$emit('delete', current.id)"
        >
          Delete photo
        </button>
      </div>
    </template>
  </section>
</template>
