<script setup>
import { IconFlask } from '@tabler/icons-vue';
import { appInfo } from '../build-info.js';

/*
  The compact strip that marks the public demo. The demo database lives only in this page, so a reload
  is the reset: it starts again from the canonical fixture, on the Dashboard.
*/
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
    <span class="demo-banner-text me-auto">{{ $t('demo.text') }}</span>
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
