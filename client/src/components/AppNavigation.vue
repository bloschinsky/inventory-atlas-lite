<script setup>
import { useRoute } from 'vue-router';
import { isLinkActive, navigationLinks } from '../navigation.js';

defineEmits(['navigate']);
const route = useRoute();
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
        :title="link.label"
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
        <span class="nav-link-title">{{ link.label }}</span>
      </RouterLink>
    </li>
  </ul>
</template>
