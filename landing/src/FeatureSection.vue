<script setup>
import { computed } from 'vue';

const props = defineProps({
  section: { type: Object, required: true },
  // Alternates the side of the screenshots on wide screens; phones always read text first.
  reverse: { type: Boolean, default: false }
});

const titleId = computed(() => `${props.section.id}-title`);
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
            {{ section.eyebrow }}
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
            <!-- Each screenshot links to its full-size file, so small text can be read up close. -->
            <a
              v-for="image in section.media"
              :key="image.src"
              class="landing-shot-link"
              :class="{ 'landing-shot-link-phone': image.phone }"
              :href="image.src"
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
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
