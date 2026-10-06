<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { IconExternalLink, IconPlayerPlay, IconServer2 } from '@tabler/icons-vue';
import ScreenshotFigure from './ScreenshotFigure.vue';
import { guidePresentation } from '../guidePresentation.js';
import { demoLink, info } from './content.js';

/*
  What the presentation metadata adds under a guide heading, before its text: Try this in Demo for a
  workflow the static demo really performs (in a new tab, in the page language), a note for what needs
  a real installation, and a screenshot of the active language. Without a published demo
  (LANDING_DEMO_URL) the demo link is left out.
*/
const props = defineProps({
  id: { type: String, required: true }
});

const { locale, t } = useI18n();
const entry = computed(() => guidePresentation[props.id]);
const demoUrl = computed(() => (entry.value?.demo && info.demoUrl ? demoLink(locale.value, entry.value.demo) : null));
const image = computed(() => (entry.value?.screenshot ? { name: entry.value.screenshot, phone: Boolean(entry.value.phone) } : null));
</script>

<template>
  <div
    v-if="demoUrl || entry?.selfHosted || image"
    class="guide-extras"
  >
    <p
      v-if="demoUrl || entry.selfHosted"
      class="guide-extras-actions"
    >
      <a
        v-if="demoUrl"
        class="btn btn-outline-primary"
        :href="demoUrl"
        target="_blank"
        rel="noopener noreferrer"
      >
        <IconPlayerPlay
          class="icon"
          aria-hidden="true"
        />
        {{ t('guide.demo') }}
        <span class="visually-hidden">{{ t('hero.newTab') }}</span>
        <IconExternalLink
          class="icon icon-end landing-external"
          aria-hidden="true"
        />
      </a>
      <span
        v-if="entry.selfHosted"
        class="guide-note"
      >
        <IconServer2
          class="icon"
          aria-hidden="true"
        />
        {{ t('guide.selfHosted') }}
      </span>
    </p>
    <ScreenshotFigure
      v-if="image"
      class="guide-figure"
      :image="image"
      :gallery="[image]"
    />
  </div>
</template>
