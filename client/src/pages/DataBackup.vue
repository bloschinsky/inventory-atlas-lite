<script setup>
import PageHeader from '../components/PageHeader.vue';
</script>

<template>
  <div class="form-card">
    <PageHeader
      title="Data / Backup"
      subtitle="Keep your own copies of the inventory database."
    />
    <section class="card mb-3">
      <div class="card-header">
        <h2 class="card-title">
          SQLite backup
        </h2>
      </div>
      <div class="card-body">
        <p>Download a consistent snapshot containing all items, categories, custom fields, and photos.</p>
        <a
          class="btn btn-primary"
          href="/api/backup"
        >Download backup</a>
      </div>
    </section>
    <section class="card">
      <div class="card-header">
        <h2 class="card-title">
          Where the data lives
        </h2>
      </div>
      <div class="card-body meta-text">
        <p class="mb-2">
          The live database is stored in <code>data/inventory.sqlite</code>, or in the directory set through
          <code>DATA_DIR</code>. Photos are inside the same file, so the snapshot is the whole inventory.
        </p>
        <p class="mb-0">
          Keep regular copies outside this server. Restoring a snapshot is a manual server-side operation:
          stop the application, replace the live database file, and start it again.
        </p>
      </div>
    </section>
  </div>
</template>
