<script setup>
import { IconMoon, IconSun } from '@tabler/icons-vue';
import { setTheme, theme } from '../theme.js';
</script>

<template>
  <div
    class="btn-group"
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
