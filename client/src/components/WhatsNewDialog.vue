<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { IconHistory } from '@tabler/icons-vue';
import { aboutOpen, openAbout, openVersionHistory } from '../about.js';
import { appInfo } from '../build-info.js';
import { releases } from '../releaseHistory.js';
import { formatDate } from '../i18n/index.js';
import { checkWhatsNew, closeWhatsNew, whatsNewReleases } from '../whatsNew.js';

const panel = ref(null);
const closeButton = ref(null);
const open = computed(() => whatsNewReleases.value.length > 0);

function onKeydown(event) {
  if (event.key === 'Escape') closeWhatsNew();
}
// Keeps the focus inside the open dialog, like the About dialog does.
function onFocusIn(event) {
  if (panel.value && !panel.value.contains(event.target)) closeButton.value?.focus();
}
function release() {
  // View full changelog hands the page straight to the About dialog, which keeps it locked.
  if (!aboutOpen.value) document.body.classList.remove('modal-open');
  document.removeEventListener('keydown', onKeydown);
  document.removeEventListener('focusin', onFocusIn);
}

// The full history is the existing About → Version History pair, opened over the page.
function viewChangelog() {
  closeWhatsNew();
  openAbout();
  openVersionHistory();
}

watch(open, async value => {
  if (!value) return release();
  document.body.classList.add('modal-open');
  document.addEventListener('keydown', onKeydown);
  document.addEventListener('focusin', onFocusIn);
  await nextTick();
  closeButton.value?.focus();
});

onMounted(() => checkWhatsNew(releases, appInfo.version));
onBeforeUnmount(release);
</script>

<template>
  <template v-if="open">
    <div
      ref="panel"
      class="modal modal-blur d-block"
      role="dialog"
      aria-modal="true"
      aria-labelledby="whats-new-title"
      @click.self="closeWhatsNew()"
    >
      <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header">
            <h2
              id="whats-new-title"
              class="modal-title"
            >
              {{ $t('whatsNew.title') }}
            </h2>
            <button
              ref="closeButton"
              type="button"
              class="btn-close"
              :aria-label="$t('whatsNew.close')"
              @click="closeWhatsNew()"
            />
          </div>
          <div class="modal-body">
            <p class="mb-3">
              {{ $t('whatsNew.updatedTo', { name: appInfo.name, version: appInfo.version }) }}
            </p>
            <section
              v-for="entry in whatsNewReleases"
              :key="entry.version"
              class="app-whats-new-release"
            >
              <div class="d-flex flex-wrap align-items-baseline gap-2">
                <h3 class="h4 m-0">
                  v{{ entry.version }}
                </h3>
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
            </section>
          </div>
          <div class="modal-footer">
            <button
              type="button"
              class="btn btn-outline-secondary"
              @click="viewChangelog()"
            >
              <IconHistory
                class="me-1"
                :size="18"
                :stroke-width="1.75"
                aria-hidden="true"
              />
              {{ $t('whatsNew.viewChangelog') }}
            </button>
            <button
              type="button"
              class="btn btn-primary ms-auto"
              @click="closeWhatsNew()"
            >
              {{ $t('whatsNew.gotIt') }}
            </button>
          </div>
        </div>
      </div>
    </div>
    <div class="modal-backdrop show" />
  </template>
</template>
