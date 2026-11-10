<script setup>
import { computed, defineAsyncComponent, watch } from 'vue';
import { useRoute } from 'vue-router';
import AccountMenu from './components/AccountMenu.vue';
import ActiveDatabaseIndicator from './components/ActiveDatabaseIndicator.vue';
import AboutDialog from './components/AboutDialog.vue';
import AppMobileNav from './components/AppMobileNav.vue';
import AppSidebar from './components/AppSidebar.vue';
import DemoBanner from './components/DemoBanner.vue';
import { itemHistoryOpen } from './components/ItemHistoryDialog.vue';
import PageView from './components/PageView.vue';
import ReauthDialog from './components/ReauthDialog.vue';
import VersionHistoryDialog from './components/VersionHistoryDialog.vue';
import WhatsNewDialog from './components/WhatsNewDialog.vue';
import { loadActiveDatabase } from './activeDatabase.js';
import { dataRevision } from './api.js';
import { auth } from './auth.js';
import { isSettingsRoute, usePageRoute } from './settingsOverlay.js';

const demoMode = __DEMO__;
const route = useRoute();
// Settings opens as a dialog over the page, which stays rendered but out of reach until it closes.
const settingsOpen = computed(() => isSettingsRoute(route));
// So does the full Item History dialog over its Item details page.
const pageCovered = computed(() => settingsOpen.value || itemHistoryOpen.value);
const pageRoute = usePageRoute();
// Sign-in, setup, and recovery stand on their own, outside the application shell.
const publicPage = computed(() => Boolean(route.meta.public));
const signedIn = computed(() => auth.status === 'signedIn');
// The database indicator's metadata, once someone is signed in; a failure only leaves the indicator
// in its unavailable state. A demo reset replaces the in-browser database in place, so its old name must not linger.
watch(signedIn, value => { if (value) loadActiveDatabase().catch(() => {}); }, { immediate: true });
watch(dataRevision, () => loadActiveDatabase({ replaced: true }).catch(() => {}));
// The guided tour belongs to the public demo only; the normal build never includes it.
const DemoTour = __DEMO__ ? defineAsyncComponent(() => import('./components/DemoTour.vue')) : null;
</script>

<template>
  <RouterView v-if="publicPage" />
  <!-- Tabler shell. The mobile header stays inside .page-wrapper: a horizontal navbar
       directly under .page would make Tabler hide the vertical sidebar. -->
  <template v-else-if="signedIn">
    <div
      class="page"
      :inert="pageCovered"
      :aria-hidden="pageCovered ? 'true' : undefined"
    >
      <AppSidebar />
      <div class="page-wrapper">
        <AppMobileNav />
        <DemoBanner v-if="demoMode" />
        <!-- The active database on desktops, a single quiet line above the page that stays visible
             while the sidebar is folded; phones show it in the mobile header instead. -->
        <div class="app-database-bar d-none d-lg-block d-print-none">
          <div class="container-fluid d-flex align-items-center justify-content-between gap-3">
            <ActiveDatabaseIndicator />
            <AccountMenu v-if="!demoMode" />
          </div>
        </div>
        <main class="page-body">
          <!-- Fluid on purpose: the application canvas uses the full width beside the sidebar;
               narrow surfaces such as .form-card keep their own max-width. -->
          <div class="container-fluid app-content">
            <!-- The key only changes when the demo resets its data in place, so the page loads it again. -->
            <PageView
              :key="dataRevision"
              :route="pageRoute"
            />
          </div>
        </main>
      </div>
    </div>
    <!-- The Settings dialog of the current /settings/<section> address; the dialogs below open over it. -->
    <RouterView v-if="settingsOpen" />
    <!-- One dialog for the whole shell: both navigations open the same instance. -->
    <AboutDialog />
    <VersionHistoryDialog />
    <WhatsNewDialog />
    <ReauthDialog />
    <DemoTour v-if="demoMode" />
  </template>
</template>
