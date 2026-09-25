<script setup>
import { computed, ref, useId, watch } from 'vue';

const props = defineProps({ photos: { type: Array, required: true } });
defineEmits(['delete']);

// More than one viewer could share a page, so the heading and the carousel need unique ids.
const uid = useId();
const headingId = `photos-heading-${uid}`;
const carouselId = `photo-carousel-${uid}`;

const index = ref(0);
const current = computed(() => props.photos[index.value] || null);
const show = position => { index.value = (position + props.photos.length) % props.photos.length; };
const move = step => show(index.value + step);

// A deleted photo must never leave the carousel on a removed slide: keep the photo that was
// shown when it is still there, otherwise fall back to the nearest remaining position.
watch(() => props.photos, (photos, previous) => {
  const kept = photos.findIndex(photo => photo.id === previous[index.value]?.id);
  index.value = kept >= 0 ? kept : Math.max(0, Math.min(index.value, photos.length - 1));
});

// One pointer handler covers touch swipe and mouse drag; short movements stay ordinary clicks.
const dragThreshold = 40;
let dragStart = null;
const startDrag = event => { dragStart = event.isPrimary ? event.clientX : null; };
const endDrag = event => {
  const distance = dragStart === null ? 0 : event.clientX - dragStart;
  dragStart = null;
  if (Math.abs(distance) >= dragThreshold) move(distance < 0 ? 1 : -1);
};
const cancelDrag = () => { dragStart = null; };
</script>

<template>
  <section
    class="card"
    :aria-labelledby="headingId"
  >
    <h2
      :id="headingId"
      class="visually-hidden"
    >
      {{ $t('photos.title') }}
    </h2>
    <div
      v-if="!current"
      class="photo-frame"
    >
      <p class="text-secondary text-center m-0 p-4">
        {{ $t('photos.empty') }}
      </p>
    </div>
    <template v-else>
      <!-- A single photo needs no controls at all. -->
      <div
        v-if="photos.length === 1"
        class="photo-frame"
      >
        <img
          :src="`/api/photos/${current.id}`"
          :alt="current.filename"
        >
      </div>
      <!--
        Tabler already ships the Bootstrap carousel styles. Vue drives the active slide, so no
        Bootstrap JavaScript is loaded and the carousel never rotates on its own.
      -->
      <div
        v-else
        :id="carouselId"
        class="carousel slide pointer-event photo-carousel"
      >
        <div
          class="carousel-inner"
          @pointerdown="startDrag"
          @pointerup="endDrag"
          @pointercancel="cancelDrag"
          @pointerleave="cancelDrag"
        >
          <div
            v-for="(photo, position) in photos"
            :key="photo.id"
            class="carousel-item"
            :class="{ active: position === index }"
          >
            <div class="photo-frame">
              <img
                :src="`/api/photos/${photo.id}`"
                :alt="photo.filename"
                draggable="false"
              >
            </div>
          </div>
        </div>
        <button
          type="button"
          class="carousel-control-prev"
          :aria-label="$t('photos.previous')"
          @click="move(-1)"
        >
          <span
            class="carousel-control-prev-icon"
            aria-hidden="true"
          />
        </button>
        <button
          type="button"
          class="carousel-control-next"
          :aria-label="$t('photos.next')"
          @click="move(1)"
        >
          <span
            class="carousel-control-next-icon"
            aria-hidden="true"
          />
        </button>
        <div class="carousel-indicators">
          <button
            v-for="(photo, position) in photos"
            :key="photo.id"
            type="button"
            :data-bs-target="`#${carouselId}`"
            :class="{ active: position === index }"
            :aria-current="position === index ? 'true' : undefined"
            :aria-label="$t('photos.show', { position: position + 1, total: photos.length })"
            @click="show(position)"
          />
        </div>
      </div>
      <div class="card-body d-flex flex-wrap align-items-center gap-2 py-2">
        <span
          v-if="photos.length > 1"
          class="meta-text"
        >{{ index + 1 }} / {{ photos.length }}</span>
        <span class="meta-text text-truncate flex-grow-1">{{ current.filename }}</span>
        <button
          type="button"
          class="btn btn-sm btn-ghost-danger ms-auto"
          :aria-label="$t('photos.delete')"
          @click="$emit('delete', current.id)"
        >
          {{ $t('photos.delete') }}
        </button>
      </div>
    </template>
  </section>
</template>
