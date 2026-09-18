<script setup>
defineProps({ compact: { type: Boolean, default: false } });
</script>

<template>
  <!-- The repository has no logo asset, so the mark is inline and drawn in currentColor,
       which keeps it readable in both color modes and in the folded sidebar rail. -->
  <svg
    class="app-brand-mark"
    viewBox="0 0 24 24"
    aria-hidden="true"
    focusable="false"
  >
    <path
      d="M12 2.5 21 7v10l-9 4.5L3 17V7l9-4.5Z"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linejoin="round"
    />
    <path
      d="M3 7l9 4.5L21 7M12 11.5V21"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linejoin="round"
    />
  </svg>
  <span
    class="app-brand-name"
    :class="{ 'nav-link-title': compact }"
  >Inventory Atlas Lite</span>
</template>
