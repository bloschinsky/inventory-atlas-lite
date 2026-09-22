<script setup>
import AboutDialog from './components/AboutDialog.vue';
import AppMobileNav from './components/AppMobileNav.vue';
import AppSidebar from './components/AppSidebar.vue';
import VersionHistoryDialog from './components/VersionHistoryDialog.vue';
</script>

<template>
  <!-- Tabler shell. The mobile header stays inside .page-wrapper: a horizontal navbar
       directly under .page would make Tabler hide the vertical sidebar. -->
  <div class="page">
    <AppSidebar />
    <div class="page-wrapper">
      <AppMobileNav />
      <main class="page-body">
        <div class="container-xl">
          <RouterView />
        </div>
      </main>
    </div>
  </div>
  <!-- One dialog for the whole shell: both navigations open the same instance. -->
  <AboutDialog />
  <VersionHistoryDialog />
</template>
