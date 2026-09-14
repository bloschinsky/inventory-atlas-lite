<template>
  <nav class="navbar navbar-expand-md bg-dark navbar-dark">
    <div class="container">
      <RouterLink
        class="navbar-brand"
        to="/"
      >
        Personal Inventory
      </RouterLink>
      <div
        id="nav"
        class="navbar-nav flex-row gap-2 ms-auto"
      >
        <RouterLink
          class="nav-link"
          to="/"
        >
          Items
        </RouterLink>
        <RouterLink
          class="nav-link"
          to="/categories"
        >
          Categories &amp; Fields
        </RouterLink>
        <RouterLink
          class="nav-link"
          to="/data"
        >
          Data / Backup
        </RouterLink>
      </div>
    </div>
  </nav>
  <main class="container py-4">
    <RouterView />
  </main>
</template>
