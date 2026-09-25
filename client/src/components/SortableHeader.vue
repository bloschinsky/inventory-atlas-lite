<script setup>
import { computed } from 'vue';

// A table header cell. Only a sortable column gets the Tabler sort button and an aria-sort state.
const props = defineProps({
  label: { type: String, required: true },
  sortable: { type: Boolean, default: false },
  active: { type: Boolean, default: false },
  direction: { type: String, default: 'asc' }
});
defineEmits(['sort']);

const ariaSort = computed(() => {
  if (!props.sortable) return undefined;
  if (!props.active) return 'none';
  return props.direction === 'desc' ? 'descending' : 'ascending';
});
</script>

<template>
  <th
    scope="col"
    :aria-sort="ariaSort"
  >
    <button
      v-if="sortable"
      type="button"
      class="table-sort text-nowrap"
      :class="active && direction"
      @click="$emit('sort')"
    >
      {{ label }}
    </button>
    <template v-else>
      {{ label }}
    </template>
  </th>
</template>
