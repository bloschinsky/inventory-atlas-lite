<script setup>
import { useRoute } from 'vue-router';
import { isLinkActive, navigationLinks } from '../navigation.js';

defineEmits(['navigate']);
const route = useRoute();
</script>

<template>
  <ul class="nav flex-column gap-1">
    <li
      v-for="link in navigationLinks"
      :key="link.to"
      class="nav-item"
    >
      <RouterLink
        :to="link.to"
        class="nav-link app-nav-link"
        :class="{ active: isLinkActive(link, route.path) }"
        :aria-current="isLinkActive(link, route.path) ? 'page' : undefined"
        @click="$emit('navigate')"
      >
        {{ link.label }}
      </RouterLink>
    </li>
  </ul>
</template>
