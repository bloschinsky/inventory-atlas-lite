<script setup>
import { IconMoon, IconSun } from '@tabler/icons-vue';
import { setTheme, theme } from '../theme.js';

// The sidebar rail is only 4rem wide when folded, so it stacks the two modes instead.
defineProps({ vertical: { type: Boolean, default: false } });
</script>

<template>
  <div
    :class="vertical ? 'btn-group-vertical' : 'btn-group'"
    role="group"
    aria-label="Color mode"
  >
    <button
      type="button"
      class="btn btn-icon"
      :class="theme === 'light' ? 'btn-primary' : 'btn-outline-secondary'"
      :aria-pressed="theme === 'light'"
      title="Light mode"
      @click="setTheme('light')"
    >
      <IconSun
        :size="18"
        :stroke-width="1.75"
      />
      <span class="visually-hidden">Light mode</span>
    </button>
    <button
      type="button"
      class="btn btn-icon"
      :class="theme === 'dark' ? 'btn-primary' : 'btn-outline-secondary'"
      :aria-pressed="theme === 'dark'"
      title="Dark mode"
      @click="setTheme('dark')"
    >
      <IconMoon
        :size="18"
        :stroke-width="1.75"
      />
      <span class="visually-hidden">Dark mode</span>
    </button>
  </div>
</template>
