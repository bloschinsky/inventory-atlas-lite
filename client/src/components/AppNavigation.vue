<script setup>
import { useRoute } from 'vue-router';
import { IconInfoCircle } from '@tabler/icons-vue';
import { openAbout } from '../about.js';
import { isLinkActive, navigationLinks } from '../navigation.js';

const emit = defineEmits(['navigate']);
const route = useRoute();

// About is an action, not a destination, but it belongs in the same list at every width.
function showAbout() {
  emit('navigate');
  openAbout();
}
</script>

<template>
  <ul class="navbar-nav">
    <li
      v-for="link in navigationLinks"
      :key="link.to"
      class="nav-item"
      :class="{ active: isLinkActive(link, route.path) }"
    >
      <RouterLink
        :to="link.to"
        class="nav-link"
        :title="$t(link.label)"
        :aria-current="isLinkActive(link, route.path) ? 'page' : undefined"
        @click="$emit('navigate')"
      >
        <span class="nav-link-icon">
          <component
            :is="link.icon"
            :size="24"
            :stroke-width="1.75"
            aria-hidden="true"
          />
        </span>
        <span class="nav-link-title">{{ $t(link.label) }}</span>
      </RouterLink>
    </li>
    <li class="nav-item">
      <button
        type="button"
        class="nav-link nav-link-button"
        :title="$t('nav.about')"
        @click="showAbout"
      >
        <span class="nav-link-icon">
          <IconInfoCircle
            :size="24"
            :stroke-width="1.75"
            aria-hidden="true"
          />
        </span>
        <span class="nav-link-title">{{ $t('nav.about') }}</span>
      </button>
    </li>
  </ul>
</template>
