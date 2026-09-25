<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { closeVersionHistory, versionHistoryOpen } from '../about.js';
import { appInfo } from '../build-info.js';
import { releases } from '../releaseHistory.js';
import { releaseVersion } from '../../../shared/releaseHistory.js';
import { formatDate } from '../i18n/index.js';

const panel = ref(null);
const closeButton = ref(null);
let opener = null;

// A development build reports 0.21.0-dev, which still belongs to the 0.21.0 entry.
const currentVersion = computed(() => releaseVersion(appInfo.version));

function onKeydown(event) {
  if (event.key === 'Escape') closeVersionHistory();
}
// Keeps the focus inside this dialog, which sits above the still open About dialog.
function onFocusIn(event) {
  if (panel.value && !panel.value.contains(event.target)) closeButton.value?.focus();
}
function release() {
  document.removeEventListener('keydown', onKeydown);
  document.removeEventListener('focusin', onFocusIn);
}

watch(versionHistoryOpen, async open => {
  if (open) {
    opener = document.activeElement;
    document.addEventListener('keydown', onKeydown);
    document.addEventListener('focusin', onFocusIn);
    await nextTick();
    closeButton.value?.focus();
    return;
  }
  release();
  if (opener?.isConnected) opener.focus();
  opener = null;
});

onBeforeUnmount(release);
</script>

<template>
  <template v-if="versionHistoryOpen">
    <div
      ref="panel"
      class="modal modal-blur d-block app-modal-stacked"
      role="dialog"
      aria-modal="true"
      aria-labelledby="version-history-title"
      @click.self="closeVersionHistory()"
    >
      <div class="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header">
            <h2
              id="version-history-title"
              class="modal-title"
            >
              {{ $t('versionHistory.title') }}
            </h2>
            <button
              ref="closeButton"
              type="button"
              class="btn-close"
              :aria-label="$t('versionHistory.close')"
              @click="closeVersionHistory()"
            />
          </div>
          <div class="modal-body app-version-history">
            <ul
              v-if="releases.length"
              class="steps steps-vertical"
            >
              <li
                v-for="entry in releases"
                :key="entry.version"
                class="step-item"
                :class="{ active: entry.version === currentVersion }"
              >
                <div class="d-flex flex-wrap align-items-baseline gap-2">
                  <h3 class="h4 m-0">
                    v{{ entry.version }}
                  </h3>
                  <span
                    v-if="entry.version === currentVersion"
                    class="badge bg-primary-lt"
                  >{{ $t('versionHistory.installed') }}</span>
                  <span
                    v-if="entry.date"
                    class="text-secondary ms-auto"
                  >{{ formatDate(entry.date) }}</span>
                </div>
                <ul class="mt-1 mb-0 ps-3">
                  <li
                    v-for="(change, index) in entry.changes"
                    :key="index"
                  >
                    {{ change }}
                  </li>
                </ul>
              </li>
            </ul>
            <p
              v-else
              class="mb-0 text-secondary"
            >
              {{ $t('versionHistory.empty') }}
            </p>
          </div>
          <div class="modal-footer">
            <button
              type="button"
              class="btn w-100"
              @click="closeVersionHistory()"
            >
              {{ $t('common.close') }}
            </button>
          </div>
        </div>
      </div>
    </div>
    <div class="modal-backdrop show app-modal-stacked-backdrop" />
  </template>
</template>
