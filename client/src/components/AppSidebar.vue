<script setup>
import AppBrand from './AppBrand.vue';
import AppNavigation from './AppNavigation.vue';
import ThemeToggle from './ThemeToggle.vue';
</script>

<template>
  <!--
    Tabler's own folded-hover sidebar: the rail expands on hover and, through Tabler's
    :has(:focus-visible) rule, on keyboard focus as well. It is fixed and only the folded
    width reserves space, so expanding never shifts the page.
  -->
  <aside class="navbar navbar-vertical navbar-expand-lg navbar-folded-hover d-none d-lg-flex">
    <div class="container-fluid">
      <RouterLink
        to="/"
        class="navbar-brand app-brand"
      >
        <AppBrand compact />
      </RouterLink>
      <div class="navbar-collapse">
        <nav aria-label="Main">
          <AppNavigation />
        </nav>
        <div class="navbar-footer d-flex justify-content-center">
          <ThemeToggle />
        </div>
      </div>
    </div>
  </aside>
</template>
