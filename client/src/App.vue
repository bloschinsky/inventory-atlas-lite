<script setup>
import AppMobileNav from './components/AppMobileNav.vue';
import AppSidebar from './components/AppSidebar.vue';
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
</template>
