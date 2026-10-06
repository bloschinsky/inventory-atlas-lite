<script setup>
/*
  The table of contents of the user guide, built from the guide's own headings: every numbered
  section, and the subsections of the section being read. The heading being read is the current
  location (`aria-current`). The sticky desktop sidebar and the phone's On this page panel both use it.
*/
defineProps({
  sections: { type: Array, required: true },
  // The id of the heading being read, and of the numbered section it belongs to.
  active: { type: String, default: null },
  activeSection: { type: String, default: null }
});
defineEmits(['navigate']);

const pad = number => String(number).padStart(2, '0');
</script>

<template>
  <ol class="guide-toc">
    <li
      v-for="section in sections"
      :key="section.id"
      :class="{ 'is-open': section.id === activeSection }"
    >
      <a
        class="guide-toc-link"
        :href="`#${section.id}`"
        :aria-current="section.id === active ? 'location' : null"
        @click="$emit('navigate')"
      >
        <span
          class="guide-toc-number"
          aria-hidden="true"
        >{{ pad(section.number) }}</span>
        <span>{{ section.title }}</span>
      </a>
      <ol
        v-if="section.subsections.length && section.id === activeSection"
        class="guide-toc-sub"
      >
        <li
          v-for="sub in section.subsections"
          :key="sub.id"
        >
          <a
            class="guide-toc-link"
            :href="`#${sub.id}`"
            :aria-current="sub.id === active ? 'location' : null"
            @click="$emit('navigate')"
          >{{ sub.title }}</a>
        </li>
      </ol>
    </li>
  </ol>
</template>
