<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import ScreenshotFigure from './ScreenshotFigure.vue';

const props = defineProps({
  section: { type: Object, required: true },
  // The place of the section in the showcase story, shown as 01, 02, …
  number: { type: Number, required: true },
  // Alternates the side of the screenshots on wide screens; phones always read text first.
  reverse: { type: Boolean, default: false }
});

const { t, tm, rt } = useI18n();
const titleId = computed(() => `${props.section.id}-title`);
const step = computed(() => String(props.number).padStart(2, '0'));
const copy = key => t(`sections.${props.section.id}.${key}`);
const points = computed(() => tm(`sections.${props.section.id}.points`).map(point => rt(point)));
</script>

<template>
  <section
    :id="section.id"
    class="landing-section landing-feature"
    :aria-labelledby="titleId"
  >
    <div class="container-xl">
      <div class="row align-items-center g-5">
        <div
          class="col-lg-5 landing-reveal"
          :class="{ 'order-lg-2': reverse }"
        >
          <p class="landing-eyebrow">
            <span class="landing-eyebrow-icon">
              <component
                :is="section.icon"
                class="icon"
                aria-hidden="true"
              />
            </span>
            <span class="landing-story">
              <span class="landing-story-number">{{ step }}</span>
              <span aria-hidden="true"> / </span>
              {{ copy('verb') }}
            </span>
          </p>
          <h2
            :id="titleId"
            class="landing-section-title"
          >
            {{ copy('title') }}
          </h2>
          <p class="landing-text">
            {{ copy('text') }}
          </p>
          <ul class="landing-points">
            <li
              v-for="point in points"
              :key="point"
            >
              {{ point }}
            </li>
          </ul>
        </div>
        <div
          class="col-lg-7 landing-reveal"
          style="--landing-reveal-delay: .12s"
        >
          <div class="landing-media">
            <ScreenshotFigure
              v-for="(image, index) in section.media"
              :key="image.name"
              :image="image"
              :gallery="section.media"
              :index="index"
            />
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
