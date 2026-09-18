<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import AppNavigation from './components/AppNavigation.vue';

const route = useRoute();
const menuOpen = ref(false);
const menuButton = ref(null);
const closeButton = ref(null);
const panel = ref(null);

async function openMenu() {
  menuOpen.value = true;
  document.body.classList.add('app-menu-open');
  await nextTick();
  closeButton.value?.focus();
}

function closeMenu(restoreFocus = true) {
  if (!menuOpen.value) return;
  menuOpen.value = false;
  document.body.classList.remove('app-menu-open');
  if (restoreFocus) menuButton.value?.focus();
}

// Navigating from inside the panel closes it, but the new page keeps the focus.
watch(() => route.fullPath, () => closeMenu(false));

function onKeydown(event) {
  if (menuOpen.value && event.key === 'Escape') closeMenu();
}
// Keeps the focus inside the open panel without a dedicated focus-trap dependency.
function onFocusIn(event) {
  if (menuOpen.value && panel.value && !panel.value.contains(event.target)) closeButton.value?.focus();
}
onMounted(() => {
  document.addEventListener('keydown', onKeydown);
  document.addEventListener('focusin', onFocusIn);
});
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown);
  document.removeEventListener('focusin', onFocusIn);
  document.body.classList.remove('app-menu-open');
});
</script>

<template>
  <div class="app-shell">
    <aside class="app-sidebar d-none d-lg-flex">
      <RouterLink
        to="/"
        class="app-brand"
      >
        Inventory Atlas Lite
      </RouterLink>
      <nav aria-label="Main">
        <AppNavigation />
      </nav>
    </aside>
    <div class="app-main">
      <header class="app-topbar d-lg-none">
        <button
          ref="menuButton"
          type="button"
          class="btn btn-outline-secondary app-menu-button"
          aria-label="Open navigation menu"
          :aria-expanded="menuOpen"
          @click="openMenu"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 18 18"
            aria-hidden="true"
            focusable="false"
          >
            <path
              d="M1 3h16M1 9h16M1 15h16"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            />
          </svg>
        </button>
        <RouterLink
          to="/"
          class="app-brand"
        >
          Inventory Atlas Lite
        </RouterLink>
      </header>
      <main class="app-content">
        <RouterView />
      </main>
    </div>
    <template v-if="menuOpen">
      <div
        class="offcanvas-backdrop show"
        @click="closeMenu()"
      />
      <div
        ref="panel"
        class="offcanvas offcanvas-start show app-offcanvas"
        tabindex="-1"
        role="dialog"
        aria-modal="true"
        aria-label="Main navigation"
      >
        <div class="offcanvas-header">
          <span class="app-brand">Inventory Atlas Lite</span>
          <button
            ref="closeButton"
            type="button"
            class="btn-close"
            aria-label="Close navigation menu"
            @click="closeMenu()"
          />
        </div>
        <div class="offcanvas-body">
          <nav aria-label="Main">
            <AppNavigation />
          </nav>
        </div>
      </div>
    </template>
  </div>
</template>
