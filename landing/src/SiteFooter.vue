<script setup>
import { useI18n } from 'vue-i18n';
import { links } from '../site.js';
import { info } from './content.js';

const { t } = useI18n();
</script>

<template>
  <footer
    class="landing-footer landing-dark"
    data-bs-theme="dark"
  >
    <div class="container-xl d-flex flex-wrap justify-content-between gap-2">
      <span>{{ t('footer.byline') }}</span>
      <span>
        <a :href="info.release.url">{{ t('footer.version', { version: info.release.version }) }}</a>
        ·
        <a :href="links.releases">{{ t('footer.releases') }}</a>
        ·
        <a :href="links.github">{{ t('footer.source') }}</a>
      </span>
    </div>
  </footer>
</template>
