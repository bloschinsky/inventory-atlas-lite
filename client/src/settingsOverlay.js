import { computed, onBeforeUnmount, onMounted, shallowRef } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { i18n } from './i18n/index.js';

/*
  Settings is a dialog over the page it was opened from, while every section keeps its own
  /settings/<section> address. The router still navigates to the Settings route; the shell keeps
  rendering the page underneath (the background), or the Dashboard when a Settings address was loaded
  directly, as after a reload or the cloud OAuth return.
*/
const fallbackPath = '/dashboard';
const background = shallowRef(null);
// Each mounted Settings form adds a check of its own unsaved edits.
const unsavedChecks = new Set();

export const isSettingsRoute = route => route.matched[0]?.path === '/settings';

export function installSettingsOverlay(router) {
  // A real edit is never lost silently: closing, another section, Back, or any other page asks first.
  router.beforeEach((to, from) => {
    if (to.path === from.path || ![...unsavedChecks].some(check => check())) return true;
    return window.confirm(i18n.global.t('settings.discardChanges'));
  });
  router.afterEach((to, from, failure) => {
    if (failure) return;
    if (!isSettingsRoute(to)) background.value = null;
    else if (from.matched.length && !isSettingsRoute(from)) background.value = from;
  });
}

/*
  The route the page area renders. It stays the same object while its address does not change, so
  closing Settings back to the page it covered keeps that page exactly as it was.
*/
export function usePageRoute() {
  const router = useRouter();
  const route = useRoute();
  return computed(previous => {
    const next = !isSettingsRoute(route) ? router.currentRoute.value : background.value ?? router.resolve(fallbackPath);
    return previous?.fullPath === next.fullPath ? previous : next;
  });
}

/*
  Returns to the covered page. When that page is the previous history entry, Back removes the dialog
  from the history; a directly loaded Settings address is replaced by the Dashboard, so Back never
  reopens it over a page it was not opened from.
*/
export function closeSettings(router) {
  const target = background.value?.fullPath;
  if (!target) return router.replace(fallbackPath);
  if (router.options.history.state.back === target) return router.back();
  return router.push(target);
}

// Registers a Settings form's unsaved-edit check for as long as the form is shown.
export function useUnsavedChanges(isDirty) {
  onMounted(() => unsavedChecks.add(isDirty));
  onBeforeUnmount(() => unsavedChecks.delete(isDirty));
}
