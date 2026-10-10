<script setup>
import { computed, defineAsyncComponent } from 'vue';
import { useRoute } from 'vue-router';
import AboutDialog from './components/AboutDialog.vue';
import AppMobileNav from './components/AppMobileNav.vue';
import AppSidebar from './components/AppSidebar.vue';
import DemoBanner from './components/DemoBanner.vue';
import PageView from './components/PageView.vue';
import VersionHistoryDialog from './components/VersionHistoryDialog.vue';
import WhatsNewDialog from './components/WhatsNewDialog.vue';
import { dataRevision } from './api.js';
import { isSettingsRoute, usePageRoute } from './settingsOverlay.js';

const demoMode = __DEMO__;
const route = useRoute();
// Settings opens as a dialog over the page, which stays rendered but out of reach until it closes.
const settingsOpen = computed(() => isSettingsRoute(route));
const pageRoute = usePageRoute();
// The guided tour belongs to the public demo only; the normal build never includes it.
const DemoTour = __DEMO__ ? defineAsyncComponent(() => import('./components/DemoTour.vue')) : null;
</script>

<template>
  <!-- Tabler shell. The mobile header stays inside .page-wrapper: a horizontal navbar
       directly under .page would make Tabler hide the vertical sidebar. -->
  <div
    class="page"
    :inert="settingsOpen"
    :aria-hidden="settingsOpen ? 'true' : undefined"
  >
    <AppSidebar />
    <div class="page-wrapper">
      <AppMobileNav />
      <DemoBanner v-if="demoMode" />
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
  <DemoTour v-if="demoMode" />
</template>
