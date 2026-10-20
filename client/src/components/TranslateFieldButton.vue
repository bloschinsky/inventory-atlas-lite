<script setup>
import { IconLanguage } from '@tabler/icons-vue';

/*
  The compact Translate action beside a text field's label; `label` is the field's visible name. Its
  name is hidden text rather than aria-label, so the button never labels itself like the field does.
*/
defineProps({
  label: { type: String, required: true },
  disabled: { type: Boolean, default: false }
});
defineEmits(['click']);
</script>

<template>
  <button
    type="button"
    class="btn btn-ghost-secondary btn-icon btn-sm"
    :disabled="disabled"
    :title="$t('translation.action', { field: label })"
    @click="$emit('click')"
  >
    <IconLanguage
      :size="18"
      :stroke-width="1.75"
      aria-hidden="true"
    />
    <span class="visually-hidden">{{ $t('translation.action', { field: label }) }}</span>
  </button>
</template>
