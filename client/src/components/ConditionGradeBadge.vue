<script setup>
import { conditionGradeBadgeClass, conditionGradeLabelKey } from '../conditionGrades.js';

// The read-only face of the structured Condition, shared by the table, the cards, and the details.
defineProps({ grade: { type: String, default: null } });
</script>

<template>
  <span
    class="badge"
    :class="conditionGradeBadgeClass(grade)"
  >{{ $t(conditionGradeLabelKey(grade)) }}</span>
</template>
