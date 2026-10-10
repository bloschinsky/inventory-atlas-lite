<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { IconSettings } from '@tabler/icons-vue';
import { aboutOpen, versionHistoryOpen } from '../about.js';
import { closeSettings } from '../settingsOverlay.js';
import { settingsGroups, settingsPath } from '../settingsSections.js';
import { whatsNewReleases } from '../whatsNew.js';

defineOptions({ name: 'SettingsPage' });
const route = useRoute();
const router = useRouter();
const panel = ref(null);
const pane = ref(null);
const closeButton = ref(null);
let opener = null;

// The matched route record ignores a trailing slash or a query, such as the cloud OAuth return.
const currentPath = computed(() => route.matched.at(-1)?.path);
const isCurrent = section => currentPath.value === settingsPath(section);

// About, Version History, and What's New can open above Settings; while one is up it owns the keyboard and the focus.
const coveredByDialog = computed(() => aboutOpen.value || versionHistoryOpen.value || whatsNewReleases.value.length > 0);

const close = () => closeSettings(router);

// Section changes replace the address, so Back leaves Settings instead of stepping through its sections.
async function chooseSection(event) {
  await router.replace(event.target.value);
  // A change declined by the unsaved-changes prompt puts the selector back on the shown section.
  event.target.value = currentPath.value;
}

const focusableSelector = 'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex]:not([tabindex="-1"])';

// Tab wraps around inside the dialog instead of leaving the page for the browser's own controls.
function wrapFocus(event) {
  const focusable = [...panel.value.querySelectorAll(focusableSelector)].filter(node => node.getClientRects().length);
  const edge = event.shiftKey ? focusable[0] : focusable.at(-1);
  if (document.activeElement !== edge) return;
  event.preventDefault();
  (event.shiftKey ? focusable.at(-1) : focusable[0]).focus();
}

function onKeydown(event) {
  if (coveredByDialog.value || !panel.value) return;
  if (event.key === 'Tab') wrapFocus(event);
  else if (event.key === 'Escape' && (event.target === document.body || panel.value.contains(event.target))) close();
}
// Keeps the focus inside the dialog without a dedicated focus-trap dependency.
function onFocusIn(event) {
  if (!coveredByDialog.value && panel.value && !panel.value.contains(event.target)) closeButton.value?.focus();
}

// The focus comes back to Settings when a dialog above it closes.
watch(coveredByDialog, covered => {
  if (!covered && !panel.value?.contains(document.activeElement)) closeButton.value?.focus();
});
// Every section starts at its top.
watch(() => route.path, () => { if (pane.value) pane.value.scrollTop = 0; });

onMounted(async () => {
  opener = document.activeElement;
  document.body.classList.add('modal-open');
  document.addEventListener('keydown', onKeydown);
  document.addEventListener('focusin', onFocusIn);
  await nextTick();
  if (!coveredByDialog.value) closeButton.value?.focus();
});

onBeforeUnmount(() => {
  if (!coveredByDialog.value) document.body.classList.remove('modal-open');
  document.removeEventListener('keydown', onKeydown);
  document.removeEventListener('focusin', onFocusIn);
  // The entry that opened Settings is gone when it was the one in the mobile drawer.
  if (opener?.isConnected) nextTick(() => opener.focus());
});
</script>

<template>
  <!-- Tabler's modal markup driven by the route, like the About dialog: no Bootstrap JavaScript. -->
  <div
    ref="panel"
    class="modal modal-blur d-block app-settings-modal"
    role="dialog"
    aria-modal="true"
    aria-labelledby="settings-dialog-title"
    @click.self="close"
  >
    <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable modal-fullscreen-md-down app-settings-dialog">
      <div class="modal-content">
        <div class="modal-header">
          <h1
            id="settings-dialog-title"
            class="modal-title d-flex align-items-center gap-2"
          >
            <IconSettings
              class="icon"
              aria-hidden="true"
            />
            {{ $t('settings.title') }}
          </h1>
          <button
            ref="closeButton"
            type="button"
            class="btn-close"
            :aria-label="$t('settings.close')"
            @click="close"
          />
        </div>
        <div class="modal-body d-flex p-0 overflow-hidden">
          <nav
            class="app-settings-nav d-none d-md-block"
            :aria-label="$t('settings.sections')"
          >
            <div
              v-for="group in settingsGroups"
              :key="group.id"
              class="mb-4"
              role="group"
              :aria-labelledby="`settings-group-${group.id}`"
            >
              <div
                :id="`settings-group-${group.id}`"
                class="subheader mb-2"
              >
                {{ $t(group.label) }}
              </div>
              <div class="list-group list-group-transparent">
                <RouterLink
                  v-for="section in group.sections"
                  :key="section.path"
                  :to="settingsPath(section)"
                  replace
                  class="list-group-item list-group-item-action d-flex align-items-center gap-2 py-2"
                  :class="{ active: isCurrent(section) }"
                  :aria-current="isCurrent(section) ? 'page' : undefined"
                >
                  <component
                    :is="section.icon"
                    class="icon"
                    aria-hidden="true"
                  />
                  {{ $t(section.label) }}
                </RouterLink>
              </div>
            </div>
          </nav>
          <div
            ref="pane"
            class="app-settings-pane"
          >
            <!-- Phones get one native selector instead of the side list: compact, keyboard-ready, and it grows with the sections. -->
            <div class="d-md-none mb-3">
              <label
                class="form-label"
                for="settings-section"
              >{{ $t('settings.section') }}</label>
              <select
                id="settings-section"
                class="form-select"
                :value="currentPath"
                @change="chooseSection"
              >
                <optgroup
                  v-for="group in settingsGroups"
                  :key="group.id"
                  :label="$t(group.label)"
                >
                  <option
                    v-for="section in group.sections"
                    :key="section.path"
                    :value="settingsPath(section)"
                  >
                    {{ $t(section.label) }}
                  </option>
                </optgroup>
              </select>
            </div>
            <RouterView />
          </div>
        </div>
      </div>
    </div>
  </div>
  <div class="modal-backdrop show app-settings-backdrop" />
</template>
