<script setup>
import { IconMoon, IconSun } from '@tabler/icons-vue';
import { setTheme, theme } from '../theme.js';
</script>

<template>
  <div
    class="btn-group"
    role="group"
    :aria-label="$t('theme.colorMode')"
  >
    <button
      type="button"
      class="btn btn-icon"
      :class="theme === 'light' ? 'btn-primary' : 'btn-outline-secondary'"
      :aria-pressed="theme === 'light'"
      :title="$t('theme.light')"
      @click="setTheme('light')"
    >
      <IconSun
        :size="18"
        :stroke-width="1.75"
      />
      <span class="visually-hidden">{{ $t('theme.light') }}</span>
    </button>
    <button
      type="button"
      class="btn btn-icon"
      :class="theme === 'dark' ? 'btn-primary' : 'btn-outline-secondary'"
      :aria-pressed="theme === 'dark'"
      :title="$t('theme.dark')"
      @click="setTheme('dark')"
    >
      <IconMoon
        :size="18"
        :stroke-width="1.75"
      />
      <span class="visually-hidden">{{ $t('theme.dark') }}</span>
    </button>
  </div>
</template>
