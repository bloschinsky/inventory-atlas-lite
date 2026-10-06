<script setup>
import { useI18n } from 'vue-i18n';
import { IconBrandGithub } from '@tabler/icons-vue';
import LanguageMenu from './LanguageMenu.vue';
import { links } from '../site.js';

/*
  The navigation bar of every public page: the product mark leading to the top of the product page,
  the page links of the slot (hidden on phones), the language menu, and GitHub.
*/
defineProps({
  // Where the product mark leads: the top of this page, or the product page from the guide.
  home: { type: String, required: true }
});
const { t } = useI18n();
</script>

<template>
  <nav
    class="landing-nav landing-dark navbar"
    data-bs-theme="dark"
    :aria-label="t('nav.label')"
  >
    <div class="container-xl">
      <a
        class="landing-brand"
        :href="home"
      >
        <svg
          class="landing-brand-mark"
          viewBox="0 0 24 24"
          aria-hidden="true"
          focusable="false"
        >
          <path
            d="M12 2.5 21 7v10l-9 4.5L3 17V7l9-4.5Z M3 7l9 4.5L21 7M12 11.5V21"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linejoin="round"
          />
        </svg>
        Inventory Atlas Lite
      </a>
      <div class="d-flex align-items-center gap-2 gap-md-3">
        <slot />
        <LanguageMenu />
        <a
          class="btn btn-outline-secondary"
          :href="links.github"
        >
          <IconBrandGithub
            class="icon"
            aria-hidden="true"
          />
          <span class="landing-nav-label">GitHub</span>
        </a>
      </div>
    </div>
  </nav>
</template>
