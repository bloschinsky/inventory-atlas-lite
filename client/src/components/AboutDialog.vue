<script setup>
import { nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { IconBrandGithub, IconHistory } from '@tabler/icons-vue';
import AppBrand from './AppBrand.vue';
import { aboutOpen, closeAbout, openVersionHistory, versionHistoryOpen } from '../about.js';
import { appInfo } from '../build-info.js';
import AboutUpdate from './AboutUpdate.vue';

const panel = ref(null);
const closeButton = ref(null);
let opener = null;

// Version History opens on top of this dialog and owns the keyboard and the focus while it is up.
function onKeydown(event) {
  if (event.key === 'Escape' && !versionHistoryOpen.value) closeAbout();
}
// Keeps the focus inside the open dialog without a dedicated focus-trap dependency.
function onFocusIn(event) {
  if (versionHistoryOpen.value) return;
  if (panel.value && !panel.value.contains(event.target)) closeButton.value?.focus();
}
function release() {
  document.body.classList.remove('modal-open');
  document.removeEventListener('keydown', onKeydown);
  document.removeEventListener('focusin', onFocusIn);
}

watch(aboutOpen, async open => {
  if (open) {
    opener = document.activeElement;
    document.body.classList.add('modal-open');
    document.addEventListener('keydown', onKeydown);
    document.addEventListener('focusin', onFocusIn);
    await nextTick();
    closeButton.value?.focus();
    return;
  }
  release();
  // The entry that opened the dialog is gone when it was the one in the mobile drawer.
  if (opener?.isConnected) opener.focus();
  opener = null;
});

onBeforeUnmount(release);
</script>

<template>
  <!-- Bootstrap's modal markup driven by Vue state, like the drawer: no Bootstrap JavaScript. -->
  <template v-if="aboutOpen">
    <div
      ref="panel"
      class="modal modal-blur d-block"
      role="dialog"
      aria-modal="true"
      aria-labelledby="about-dialog-title"
      @click.self="closeAbout()"
    >
      <div class="modal-dialog modal-sm modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h2
              id="about-dialog-title"
              class="modal-title"
            >
              About
            </h2>
            <button
              ref="closeButton"
              type="button"
              class="btn-close"
              aria-label="Close About"
              @click="closeAbout()"
            />
          </div>
          <div class="modal-body text-center">
            <div class="app-about-brand mb-3">
              <AppBrand />
            </div>
            <dl class="app-about-meta mb-3">
              <dt>Version</dt>
              <dd>{{ appInfo.version }}</dd>
              <dt>Build</dt>
              <dd class="font-monospace">
                {{ appInfo.build }}
              </dd>
              <dt>Build date</dt>
              <dd>{{ appInfo.buildDate }}</dd>
            </dl>
            <p class="mb-3">
              Developed by {{ appInfo.developer }}
            </p>
            <a
              class="btn btn-outline-secondary w-100"
              :href="appInfo.repositoryUrl"
              target="_blank"
              rel="noopener noreferrer"
            >
              <IconBrandGithub
                class="me-1"
                :size="18"
                :stroke-width="1.75"
                aria-hidden="true"
              />
              GitHub repository
            </a>
            <button
              type="button"
              class="btn btn-outline-secondary w-100 mt-2"
              @click="openVersionHistory()"
            >
              <IconHistory
                class="me-1"
                :size="18"
                :stroke-width="1.75"
                aria-hidden="true"
              />
              Version History
            </button>
            <AboutUpdate />
          </div>
          <div class="modal-footer">
            <button
              type="button"
              class="btn w-100"
              @click="closeAbout()"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
    <div class="modal-backdrop show" />
  </template>
</template>
