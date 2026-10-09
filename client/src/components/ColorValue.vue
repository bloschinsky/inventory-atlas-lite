<script setup>
import { computed } from 'vue';
import { colorLabelKey, storedColor } from '../colors.js';

/*
  The read-only face of a Color field value, shared by the table, the cards, the details, and the
  picker preview: a round swatch and the color's name. `showHex` adds the exact HEX; a custom color
  always carries it in the tooltip. An empty or unreadable value shows `empty`.
*/
const props = defineProps({
  value: { type: String, default: '' },
  showHex: { type: Boolean, default: false },
  empty: { type: String, default: '—' }
});
const color = computed(() => storedColor(props.value));
</script>

<template>
  <span
    v-if="color"
    class="color-value"
    :title="color.key === 'custom' && !showHex ? color.hex : undefined"
  >
    <span
      class="color-dot"
      :style="{ backgroundColor: color.hex }"
      aria-hidden="true"
    />
    <span>{{ showHex ? `${$t(colorLabelKey(color.key))} ${color.hex}` : $t(colorLabelKey(color.key)) }}</span>
  </span>
  <template v-else>
    {{ empty }}
  </template>
</template>
