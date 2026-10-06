<script setup>
import { computed, inject } from 'vue';
import { useI18n } from 'vue-i18n';
import { screenshotSizes } from '../screenshots.js';
import { screenshotUrl } from './content.js';

/*
  One captioned screenshot of the active language. It opens in the page's screenshot viewer with the
  other screenshots of its gallery; the link to the full-size file is the no-script fallback.
*/
const props = defineProps({
  // { name, phone }: a landing screenshot name, and whether it is a phone capture.
  image: { type: Object, required: true },
  gallery: { type: Array, required: true },
  index: { type: Number, default: 0 }
});

const { locale, t } = useI18n();
const url = computed(() => screenshotUrl(locale.value, props.image.name));
const openScreenshot = inject('openScreenshot');
</script>

<template>
  <figure
    class="landing-figure"
    :class="{ 'landing-figure-phone': image.phone }"
  >
    <a
      class="landing-shot-link"
      :href="url"
      aria-haspopup="dialog"
      aria-describedby="landing-viewer-hint"
      @click="openScreenshot(gallery, index, $event)"
    >
      <img
        class="landing-shot"
        :class="{ 'landing-shot-phone': image.phone }"
        :src="url"
        :alt="t(`screenshots.${image.name}.alt`)"
        :width="screenshotSizes[image.name][0]"
        :height="screenshotSizes[image.name][1]"
        loading="lazy"
        decoding="async"
      >
    </a>
    <figcaption class="landing-caption">
      {{ t(`screenshots.${image.name}.caption`) }}
    </figcaption>
  </figure>
</template>
