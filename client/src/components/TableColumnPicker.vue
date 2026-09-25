<script setup>
import { onBeforeUnmount, ref, watch } from 'vue';
import { IconColumns } from '@tabler/icons-vue';

/*
  The Columns control of a data table: one checkbox per column, in the table's own order. A required
  column stays checked and disabled. Tabler's dropdown styles are used without Bootstrap's script,
  so opening, closing on an outside click, and Escape are handled here.
*/
const props = defineProps({
  columns: { type: Array, required: true },
  visible: { type: Array, required: true }
});
const emit = defineEmits(['update:visible', 'reset']);

const open = ref(false);
const root = ref(null);
const toggleButton = ref(null);

function setVisible(key, checked) {
  emit('update:visible', checked ? [...props.visible, key] : props.visible.filter(visibleKey => visibleKey !== key));
}

const closeOnOutside = event => {
  if (!root.value?.contains(event.target)) open.value = false;
};
function close() {
  open.value = false;
  toggleButton.value?.focus();
}
watch(open, value => {
  if (value) document.addEventListener('pointerdown', closeOnOutside);
  else document.removeEventListener('pointerdown', closeOnOutside);
});
onBeforeUnmount(() => document.removeEventListener('pointerdown', closeOnOutside));
</script>

<template>
  <div
    ref="root"
    class="dropdown"
    @keydown.esc="close"
  >
    <button
      ref="toggleButton"
      type="button"
      class="btn w-100"
      :aria-expanded="open"
      aria-controls="table-column-picker"
      @click="open = !open"
    >
      <IconColumns
        :size="18"
        aria-hidden="true"
      />
      {{ $t('tableView.columns') }}
    </button>
    <div
      v-if="open"
      id="table-column-picker"
      class="dropdown-menu dropdown-menu-end show app-column-picker"
      role="group"
      :aria-label="$t('tableView.visibleColumns')"
    >
      <label
        v-for="column in columns"
        :key="column.key"
        class="dropdown-item form-check m-0"
      >
        <input
          type="checkbox"
          class="form-check-input m-0 me-2"
          :checked="column.required || visible.includes(column.key)"
          :disabled="column.required"
          @change="setVisible(column.key, $event.target.checked)"
        >
        <span class="form-check-label text-truncate">{{ column.label }}</span>
      </label>
      <div class="dropdown-divider" />
      <button
        type="button"
        class="dropdown-item"
        @click="emit('reset')"
      >
        {{ $t('tableView.resetToDefault') }}
      </button>
    </div>
  </div>
</template>
