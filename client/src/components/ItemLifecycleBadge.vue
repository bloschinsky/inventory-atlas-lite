<script setup>
import { IconArchive } from '@tabler/icons-vue';

/*
  The neutral Retired badge of an item that left the inventory. It is gray with an archive icon, so it
  never reads as a Condition grade, and the word alone carries the meaning. `showActive` also labels an
  active item in blue, where the status is the subject (item details). Both use opaque subtle/emphasis
  pairs, like the New / Used badge, so the word stays readable in both color modes.
*/
defineProps({
  status: { type: String, required: true },
  showActive: { type: Boolean, default: false }
});
</script>

<template>
  <span
    v-if="status === 'retired'"
    class="badge bg-secondary-subtle text-secondary-emphasis"
  ><IconArchive
    :size="14"
    class="me-1"
    aria-hidden="true"
  />{{ $t('lifecycle.statuses.retired') }}</span>
  <span
    v-else-if="showActive"
    class="badge bg-primary-subtle text-primary-emphasis"
  >{{ $t('lifecycle.statuses.active') }}</span>
</template>
