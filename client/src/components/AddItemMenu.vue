<script setup>
import { ref } from 'vue';
import { capabilities } from '../capabilities.js';
import { useDropdownMenu } from '../useDropdownMenu.js';
import TemplatePickerDialog from './TemplatePickerDialog.vue';
import { IconFilePlus, IconJson, IconLink, IconSparkles, IconTemplate } from '@tabler/icons-vue';

defineProps({
  // Batch Add needs an existing category, so the page disables it while there is none.
  batchDisabled: { type: Boolean, default: false }
});
const emit = defineEmits(['batch-add']);

/*
  Add item as a split button: the main part keeps opening the blank form, and the menu lists every
  way to start an item. Like the Columns menu, it uses Tabler's dropdown styles without Bootstrap's
  script; useDropdownMenu() handles closing on an outside click, Escape, and placement.
*/
const { open, root, menu, toggleButton, menuStyle, close } = useDropdownMenu();
const pickerOpen = ref(false);

function pickTemplate() {
  open.value = false;
  pickerOpen.value = true;
}
function batchAdd() {
  open.value = false;
  emit('batch-add');
}
// The Items page returns focus here when the Batch Add dialog opened from the menu is cancelled.
defineExpose({ focus: () => toggleButton.value?.focus() });
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
      ref="menu"
      class="dropdown-menu dropdown-menu-end show app-add-item-menu"
      :style="menuStyle"
    >
      <RouterLink
        to="/items/new"
        class="dropdown-item"
      >
        <IconFilePlus
          class="dropdown-item-icon"
          aria-hidden="true"
        />
        {{ $t('items.addBlank') }}
      </RouterLink>
      <button
        type="button"
        class="dropdown-item"
        @click="pickTemplate"
      >
        <IconTemplate
          class="dropdown-item-icon"
          aria-hidden="true"
        />
        {{ $t('items.addFromTemplate') }}
      </button>
      <div
        class="dropdown-divider"
        role="separator"
      />
      <!-- Opens the blank form with the URL import over it; nothing is created until the form is saved. -->
      <RouterLink
        v-if="capabilities.urlImport"
        :to="{ path: '/items/new', query: { import: 'url' } }"
        class="dropdown-item"
      >
        <IconLink
          class="dropdown-item-icon"
          aria-hidden="true"
        />
        {{ $t('urlImport.newAction') }}
      </RouterLink>
      <!-- Also a quick action beside Add item on the Items page: it is offered here too on purpose. -->
      <RouterLink
        v-if="capabilities.ai.enabled"
        to="/items/ai"
        class="dropdown-item"
      >
        <IconSparkles
          class="dropdown-item-icon"
          aria-hidden="true"
        />
        {{ $t('aiAddItem.title') }}
      </RouterLink>
      <button
        type="button"
        class="dropdown-item"
        :disabled="batchDisabled"
        @click="batchAdd"
      >
        <IconJson
          class="dropdown-item-icon"
          aria-hidden="true"
        />
        {{ $t('items.batchAdd') }}
      </button>
    </div>
  </div>
  <TemplatePickerDialog
    v-if="pickerOpen"
    @close="pickerOpen = false"
  />
</template>
