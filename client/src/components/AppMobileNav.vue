<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { IconMenu2 } from '@tabler/icons-vue';
import AppBrand from './AppBrand.vue';
import AppNavigation from './AppNavigation.vue';
import ThemeToggle from './ThemeToggle.vue';

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
  <header class="navbar navbar-expand-md d-lg-none sticky-top d-print-none">
    <div class="container-fluid gap-2">
      <button
        ref="menuButton"
        type="button"
        class="btn btn-icon app-menu-button"
        aria-label="Open navigation menu"
        :aria-expanded="menuOpen"
        @click="openMenu"
      >
        <IconMenu2
          :size="22"
          :stroke-width="1.75"
          aria-hidden="true"
        />
      </button>
      <RouterLink
        to="/"
        class="navbar-brand app-brand m-0 p-0 flex-grow-1"
      >
        <AppBrand />
      </RouterLink>
      <ThemeToggle />
    </div>
  </header>

  <!-- Offcanvas drawer: hover navigation is never used below the sidebar breakpoint. -->
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
        <span class="navbar-brand app-brand m-0 p-0">
          <AppBrand />
        </span>
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
</template>
