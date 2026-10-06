<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

/*
  A small concept diagram of the user guide: a titled, ordered list of steps, each a term and a short
  line, drawn as boxes joined by arrows (across on wide screens, down on phones). The words come from
  guide.diagrams.<name> in the page language, and the list itself is the textual equivalent; the
  arrows are decoration.
*/
const props = defineProps({
  name: { type: String, required: true }
});

const { t, tm, rt } = useI18n();
const titleId = computed(() => `guide-diagram-${props.name}`);
const steps = computed(() => tm(`guide.diagrams.${props.name}.steps`).map(step => ({ term: rt(step.term), text: rt(step.text) })));
</script>

<template>
  <figure
    class="guide-diagram"
    :aria-labelledby="titleId"
  >
    <figcaption
      :id="titleId"
      class="guide-diagram-title"
    >
      {{ t(`guide.diagrams.${name}.title`) }}
    </figcaption>
    <ol class="guide-flow">
      <li
        v-for="step in steps"
        :key="step.term"
        class="guide-flow-step"
      >
        <span class="guide-flow-term">{{ step.term }}</span>
        <span class="guide-flow-text">{{ step.text }}</span>
      </li>
    </ol>
  </figure>
</template>
