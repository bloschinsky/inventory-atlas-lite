<script setup>
import { computed, nextTick, ref } from 'vue';
import { IconChevronLeft, IconChevronRight, IconX } from '@tabler/icons-vue';

/*
  The screenshot viewer: one native modal <dialog> for the whole page. The browser gives it the top
  layer, the inert page behind it, focus containment, and Escape; this component adds the gallery of
  the section that opened it, Previous/Next with the arrow keys, closing on the backdrop, and focus
  back on the screenshot that opened it.
*/
const dialog = ref(null);
const images = ref([]);
const index = ref(0);
const image = computed(() => images.value[index.value]);
let opener = null;

async function open(gallery, start, trigger) {
  images.value = gallery;
  index.value = start;
  opener = trigger;
  // The panel renders first, so showModal() can move focus to its autofocused Close button.
  await nextTick();
  document.documentElement.classList.add('landing-viewer-open');
  dialog.value.showModal();
}

function step(delta) {
  index.value = (index.value + delta + images.value.length) % images.value.length;
}

function onKeydown(event) {
  if (images.value.length < 2) return;
  if (event.key === 'ArrowLeft') step(-1);
  else if (event.key === 'ArrowRight') step(1);
}

// The dialog fills the viewport around the panel, so a click on the dialog itself is a backdrop click.
function onClick(event) {
  if (event.target === dialog.value) dialog.value.close();
}

function onClose() {
  document.documentElement.classList.remove('landing-viewer-open');
  opener?.focus();
  opener = null;
}

defineExpose({ open });
</script>

<template>
  <dialog
    ref="dialog"
    class="landing-viewer"
    data-bs-theme="light"
    aria-labelledby="landing-viewer-title"
    @click="onClick"
    @keydown="onKeydown"
    @close="onClose"
  >
    <div
      v-if="image"
      class="landing-viewer-panel"
    >
      <div class="landing-viewer-header">
        <h2
          id="landing-viewer-title"
          class="landing-viewer-title"
        >
          {{ image.caption }}
        </h2>
        <div class="landing-viewer-controls">
          <template v-if="images.length > 1">
            <button
              type="button"
              class="btn btn-icon btn-ghost-secondary"
              aria-label="Previous screenshot"
              @click="step(-1)"
            >
              <IconChevronLeft
                class="icon"
                aria-hidden="true"
              />
            </button>
            <span class="landing-viewer-counter">{{ index + 1 }} / {{ images.length }}</span>
            <button
              type="button"
              class="btn btn-icon btn-ghost-secondary"
              aria-label="Next screenshot"
              @click="step(1)"
            >
              <IconChevronRight
                class="icon"
                aria-hidden="true"
              />
            </button>
          </template>
          <button
            type="button"
            class="btn btn-icon btn-ghost-secondary"
            aria-label="Close"
            autofocus
            @click="dialog.close()"
          >
            <IconX
              class="icon"
              aria-hidden="true"
            />
          </button>
        </div>
      </div>
      <div class="landing-viewer-stage">
        <img
          :key="image.src"
          class="landing-viewer-image"
          :class="{ 'landing-viewer-image-phone': image.phone }"
          :src="image.src"
          :alt="image.alt"
        >
      </div>
    </div>
  </dialog>
</template>
