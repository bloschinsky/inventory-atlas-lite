<script setup>
/*
  The read-only face of the core New flag: a green New or an amber Used badge. The flag stays a boolean
  everywhere else; the words and colors belong to the interface. The subtle background and emphasis text
  pairs keep the label readable in both color modes, and the text alone carries the meaning.
*/
defineProps({ isNew: { type: Boolean, required: true } });
</script>

<template>
  <span
    class="badge"
    :class="isNew ? 'bg-success-subtle text-success-emphasis' : 'bg-warning-subtle text-warning-emphasis'"
  >{{ $t(isNew ? 'items.newStatus.new' : 'items.newStatus.used') }}</span>
</template>
