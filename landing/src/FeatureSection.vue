<script setup>
import { computed, inject } from 'vue';

const props = defineProps({
  section: { type: Object, required: true },
  // The place of the section in the showcase story, shown as 01, 02, …
  number: { type: Number, required: true },
  // Alternates the side of the screenshots on wide screens; phones always read text first.
  reverse: { type: Boolean, default: false }
});

const titleId = computed(() => `${props.section.id}-title`);
const step = computed(() => String(props.number).padStart(2, '0'));
const openScreenshot = inject('openScreenshot');
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
              {{ section.verb }}
            </span>
          </p>
          <h2
            :id="titleId"
            class="landing-section-title"
          >
            {{ section.title }}
          </h2>
          <p class="landing-text">
            {{ section.text }}
          </p>
          <ul class="landing-points">
            <li
              v-for="point in section.points"
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
            <!-- Each screenshot opens in the viewer; the link to the full-size file is the no-script fallback. -->
            <figure
              v-for="(image, index) in section.media"
              :key="image.src"
              class="landing-figure"
              :class="{ 'landing-figure-phone': image.phone }"
            >
              <a
                class="landing-shot-link"
                :href="image.src"
                aria-haspopup="dialog"
                aria-describedby="landing-viewer-hint"
                @click="openScreenshot(section.media, index, $event)"
              >
                <img
                  class="landing-shot"
                  :class="{ 'landing-shot-phone': image.phone }"
                  :src="image.src"
                  :alt="image.alt"
                  loading="lazy"
                  decoding="async"
                >
              </a>
              <figcaption class="landing-caption">
                {{ image.caption }}
              </figcaption>
            </figure>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
