<script setup>
import { onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { IconFlask } from '@tabler/icons-vue';
import { resetDemoData } from '../api.js';
import { appInfo } from '../build-info.js';

/*
  The compact strip that marks the public demo. The demo database lives only in this page, so a reload
  is the reset: it starts again from the canonical fixture, on the Dashboard.

  The demo inventory is written in every interface language, so a language change seeds it again in
  the new language and the open page reloads its data: the interface and the sample data never mix
  two languages. Only the demo does this; the self-hosted application never touches its data when
  the language changes.
*/
const { locale } = useI18n();
const languageReset = ref(false);
let hideNotice = 0;

watch(locale, async () => {
  await resetDemoData();
  languageReset.value = true;
  clearTimeout(hideNotice);
  hideNotice = setTimeout(() => { languageReset.value = false; }, 6000);
});
onBeforeUnmount(() => clearTimeout(hideNotice));

function resetDemo() {
  window.history.replaceState(null, '', '#/dashboard');
  window.location.reload();
}
</script>

<template>
  <aside
    class="demo-banner d-flex flex-wrap align-items-center gap-2 px-3 py-2"
    :aria-label="$t('demo.label')"
  >
    <span class="badge bg-azure-lt d-inline-flex align-items-center gap-1">
      <IconFlask
        class="icon"
        aria-hidden="true"
      />
      {{ $t('demo.label') }}
    </span>
    <span class="demo-banner-text me-auto">
      {{ $t('demo.text') }}
      <span
        class="text-success"
        role="status"
      >{{ languageReset ? $t('demo.languageReset') : '' }}</span>
    </span>
    <button
      type="button"
      class="btn btn-sm"
      @click="resetDemo"
    >
      {{ $t('demo.reset') }}
    </button>
    <a
      class="btn btn-sm btn-primary"
      :href="appInfo.repositoryUrl"
    >{{ $t('demo.get') }}</a>
  </aside>
</template>
