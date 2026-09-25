<script setup>
import { onBeforeUnmount, ref, watch } from 'vue';
import { capabilities } from '../capabilities.js';
import TemplatePickerDialog from './TemplatePickerDialog.vue';

/*
  Add item as a split button: the main part keeps opening the blank form, and the menu offers the
  other starting points. Like the Columns menu, it uses Tabler's dropdown styles without Bootstrap's
  script, so opening, closing on an outside click, and Escape are handled here.
*/
const open = ref(false);
const pickerOpen = ref(false);
const root = ref(null);
const toggleButton = ref(null);

const closeOnOutside = event => {
  if (!root.value?.contains(event.target)) open.value = false;
};
function close() {
  open.value = false;
  toggleButton.value?.focus();
}
function pickTemplate() {
  open.value = false;
  pickerOpen.value = true;
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
    class="btn-group"
    @keydown.esc="close"
  >
    <RouterLink
      to="/items/new"
      class="btn btn-primary"
    >
      {{ $t('items.add') }}
    </RouterLink>
    <button
      ref="toggleButton"
      type="button"
      class="btn btn-primary dropdown-toggle dropdown-toggle-split"
      :aria-expanded="open"
      aria-controls="add-item-menu"
      :aria-label="$t('items.addOptions')"
      @click="open = !open"
    />
    <div
      v-if="open"
      id="add-item-menu"
      class="dropdown-menu dropdown-menu-end show app-add-item-menu"
    >
      <RouterLink
        to="/items/new"
        class="dropdown-item"
      >
        {{ $t('items.addBlank') }}
      </RouterLink>
      <button
        type="button"
        class="dropdown-item"
        @click="pickTemplate"
      >
        {{ $t('items.addFromTemplate') }}
      </button>
      <RouterLink
        v-if="capabilities.ai.enabled"
        to="/items/ai"
        class="dropdown-item"
      >
        {{ $t('aiAddItem.title') }}
      </RouterLink>
    </div>
  </div>
  <TemplatePickerDialog
    v-if="pickerOpen"
    @close="pickerOpen = false"
  />
</template>
