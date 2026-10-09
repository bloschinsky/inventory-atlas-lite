<script setup>
import { IconArchive } from '@tabler/icons-vue';

/*
  The neutral Retired badge of an item that left the inventory. It is gray with an archive icon, so it
  never reads as the green New / amber Used badge or a Condition grade, and the word alone carries the
  meaning. `showActive` also labels an active item, where the status is the subject (item details).
*/
defineProps({
  status: { type: String, required: true },
  showActive: { type: Boolean, default: false }
});
</script>

<template>
  <span
    v-if="status === 'retired'"
    class="badge bg-secondary-lt text-secondary-emphasis"
  ><IconArchive
    :size="14"
    class="me-1"
    aria-hidden="true"
  />{{ $t('lifecycle.statuses.retired') }}</span>
  <span
    v-else-if="showActive"
    class="badge bg-blue-lt"
  >{{ $t('lifecycle.statuses.active') }}</span>
</template>
