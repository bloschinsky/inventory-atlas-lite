<script>
import { ref } from 'vue';

// While the dialog is open the shell makes the page underneath inert and hidden from assistive technology.
export const itemHistoryOpen = ref(false);
</script>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { aboutOpen, versionHistoryOpen } from '../about.js';
import { reauthPending } from '../auth.js';
import { isSettingsRoute } from '../settingsOverlay.js';
import { whatsNewReleases } from '../whatsNew.js';
import ItemHistoryTimeline from './ItemHistoryTimeline.vue';

/*
  /items/:id/history: the full timeline in a dialog over the Item details page, which renders it as
  its child route and passes the item it already loaded. The page underneath keeps its state and
  scroll; a directly loaded address shows the same page behind the dialog.
*/
const props = defineProps({ item: { type: Object, required: true } });
const router = useRouter();
const panel = ref(null);
const closeButton = ref(null);
const itemPath = computed(() => `/items/${props.item.id}`);

// Settings (only reachable by its address) and the shell's own dialogs can open above this one; then they own the keyboard and the focus.
const coveredBySettings = computed(() => isSettingsRoute(router.currentRoute.value));
const covered = computed(() => coveredBySettings.value || aboutOpen.value || versionHistoryOpen.value || whatsNewReleases.value.length > 0 || Boolean(reauthPending.value));

/*
  Back to the item. Opened from it, the dialog's entry leaves the history, so Forward can reopen it;
  a directly loaded address is replaced by the item, so Back never shows the dialog again.
*/
function close() {
  if (router.options.history.state.back === itemPath.value) return router.back();
  return router.replace(itemPath.value);
}

const focusableSelector = 'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

// Tab wraps around inside the dialog instead of leaving it for the page underneath.
function wrapFocus(event) {
  const focusable = [...panel.value.querySelectorAll(focusableSelector)].filter(node => node.getClientRects().length);
  const edge = event.shiftKey ? focusable[0] : focusable.at(-1);
  if (document.activeElement !== edge) return;
  event.preventDefault();
  (event.shiftKey ? focusable.at(-1) : focusable[0]).focus();
}

function onKeydown(event) {
  if (covered.value || !panel.value) return;
  if (event.key === 'Tab') wrapFocus(event);
  else if (event.key === 'Escape' && (event.target === document.body || panel.value.contains(event.target))) close();
}
function onFocusIn(event) {
  if (!covered.value && panel.value && !panel.value.contains(event.target)) closeButton.value?.focus();
}

// After the dialog above closes, the page stays locked (Settings unlocks it as it closes) and the focus comes back here.
watch(covered, value => {
  if (value) return;
  document.body.classList.add('modal-open');
  if (!panel.value?.contains(document.activeElement)) closeButton.value?.focus();
}, { flush: 'post' });

onMounted(async () => {
  itemHistoryOpen.value = true;
  document.body.classList.add('modal-open');
  document.addEventListener('keydown', onKeydown);
  document.addEventListener('focusin', onFocusIn);
  await nextTick();
  if (!covered.value) closeButton.value?.focus();
});

onBeforeUnmount(() => {
  itemHistoryOpen.value = false;
  // Settings keeps the page locked while it stays open above.
  if (!coveredBySettings.value) document.body.classList.remove('modal-open');
  document.removeEventListener('keydown', onKeydown);
  document.removeEventListener('focusin', onFocusIn);
});
</script>

<template>
  <!-- Outside the page, which the shell makes inert while the dialog is open; Tabler's modal markup without Bootstrap JavaScript. -->
  <Teleport to="body">
    <div
      ref="panel"
      class="modal modal-blur d-block app-item-history-modal"
      :class="{ 'd-none': coveredBySettings }"
      role="dialog"
      aria-modal="true"
      aria-labelledby="item-history-dialog-title"
      aria-describedby="item-history-dialog-item"
      :inert="covered"
      @click.self="close"
    >
      <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable modal-fullscreen-md-down app-item-history-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <div class="min-w-0">
              <h1
                id="item-history-dialog-title"
                class="modal-title"
              >
                {{ $t('history.dialogTitle') }}
              </h1>
              <div
                id="item-history-dialog-item"
                class="text-secondary text-break"
              >
                {{ item.name }}
              </div>
            </div>
            <button
              ref="closeButton"
              type="button"
              class="btn-close"
              :aria-label="$t('history.close')"
              @click="close"
            />
          </div>
          <div class="modal-body">
            <ItemHistoryTimeline :item-id="item.id" />
          </div>
        </div>
      </div>
    </div>
    <div
      class="modal-backdrop show app-item-history-backdrop"
      :class="{ 'd-none': coveredBySettings }"
    />
  </Teleport>
</template>
