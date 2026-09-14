<template>
  <div class="form-card mx-auto">
    <h1 class="h3 mb-3">
      Data / Backup
    </h1><div class="card">
      <div class="card-body">
        <h2 class="h5">
          SQLite backup
        </h2><p>Download a consistent snapshot containing all items, categories, custom fields, and photos.</p><a
          class="btn btn-primary"
          href="/api/backup"
        >Download backup</a>
      </div>
    </div><p class="text-secondary small mt-3">
      The live database is stored in <code>data/inventory.sqlite</code>. Keep regular copies outside this server.
    </p>
  </div>
</template>
