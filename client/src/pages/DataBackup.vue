<script setup>
import { computed, ref } from 'vue';
import { api, jsonOptions } from '../api.js';
import PageHeader from '../components/PageHeader.vue';

defineOptions({ name: 'DataBackupPage' });

const CONFIRMATION = 'RESTORE';

const file = ref(null);
const validation = ref(null);
const confirmation = ref('');
const validating = ref(false);
const restoring = ref(false);
const error = ref('');
const success = ref(null);

const compatibility = computed(() => {
  const summary = validation.value?.summary;
  if (!summary) return '';
  const upgraded = summary.migratedFrom !== null ? ', upgraded from an older backup' : '';
  return `Compatible with this application (schema ${summary.schemaVersion})${upgraded}`;
});
const busy = computed(() => validating.value || restoring.value);
const canRestore = computed(() => Boolean(validation.value) && confirmation.value.trim().toUpperCase() === CONFIRMATION && !busy.value);

const formatSize = bytes => {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let size = bytes / 1024;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) { size /= 1024; unit += 1; }
  return `${size.toFixed(size >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
};

function selectFile(event) {
  file.value = event.target.files?.[0] || null;
  // A new selection invalidates the server-side session: it must be validated again.
  validation.value = null;
  confirmation.value = '';
  error.value = '';
  success.value = null;
}

async function validate() {
  if (!file.value || busy.value) return;
  validating.value = true;
  validation.value = null;
  error.value = '';
  success.value = null;
  try {
    const body = new FormData();
    body.append('backup', file.value);
    validation.value = await api('/api/restore/validate', { method: 'POST', body });
  } catch (caught) {
    error.value = caught.message;
  } finally {
    validating.value = false;
  }
}

// The application closes and reopens the database during the swap, so the page waits for the
// readiness endpoint before sending the browser to a view that loads restored data.
async function waitUntilReady() {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      if ((await api('/api/restore/status')).ready) return true;
    } catch {
      // The server may be finishing the swap; keep polling until the deadline.
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  return false;
}

async function restore() {
  if (!canRestore.value) return;
  restoring.value = true;
  error.value = '';
  try {
    const result = await api('/api/restore/apply', jsonOptions('POST', {
      restore_token: validation.value.restore_token,
      confirmation: CONFIRMATION
    }));
    success.value = result;
    validation.value = null;
    confirmation.value = '';
    await waitUntilReady();
    // A full page load is the simplest way to drop every cached view of the replaced data.
    setTimeout(() => window.location.assign('/items'), 2000);
  } catch (caught) {
    error.value = caught.message;
  } finally {
    restoring.value = false;
  }
}
</script>

<template>
  <div class="form-card">
    <PageHeader
      title="Data / Backup"
      subtitle="Keep your own copies of the inventory database, and restore one when you need it."
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

    <section class="card mb-3">
      <div class="card-header">
        <h2 class="card-title">
          Restore from backup
        </h2>
      </div>
      <div class="card-body">
        <div
          v-if="success"
          class="alert alert-success"
          role="status"
        >
          <h3 class="alert-title">
            Backup restored successfully
          </h3>
          <p class="mb-1">
            The inventory now contains {{ success.summary.items }} item(s),
            {{ success.summary.categories }} category(ies), and {{ success.summary.photos }} photo(s).
          </p>
          <p class="mb-0">
            The database that was replaced was saved as <code>{{ success.safety_backup }}</code> in the
            pre-restore backup directory. Opening the items list…
          </p>
        </div>
        <div
          v-if="error"
          class="alert alert-danger"
          role="alert"
        >
          {{ error }}
        </div>

        <p>
          Replace the whole inventory with a backup downloaded from this application. The file is checked
          on the server before anything is changed.
        </p>

        <div class="mb-3">
          <label
            class="form-label"
            for="restore-file"
          >Backup file</label>
          <input
            id="restore-file"
            class="form-control"
            type="file"
            accept=".sqlite,.sqlite3,.db"
            :disabled="busy"
            @change="selectFile"
          >
          <div class="form-text">
            An Inventory Atlas Lite SQLite backup, normally named <code>inventory-YYYY-MM-DD.sqlite</code>
            (<code>.sqlite</code>, <code>.sqlite3</code>, or <code>.db</code>). The contents are validated,
            not the file name.
          </div>
        </div>

        <p
          v-if="file"
          class="meta-text"
        >
          Selected: <strong>{{ file.name }}</strong> ({{ formatSize(file.size) }})
        </p>

        <button
          class="btn btn-outline-primary"
          type="button"
          :disabled="!file || busy"
          @click="validate"
        >
          <span
            v-if="validating"
            class="spinner-border spinner-border-sm me-1"
            aria-hidden="true"
          />
          {{ validating ? 'Validating…' : 'Validate backup' }}
        </button>

        <template v-if="validation">
          <h3 class="h4 mt-4">
            Validation result
          </h3>
          <dl class="row mb-3">
            <dt class="col-5 col-md-4">
              File
            </dt>
            <dd class="col-7 col-md-8">
              {{ validation.filename }} ({{ formatSize(validation.size_bytes) }})
            </dd>
            <dt class="col-5 col-md-4">
              Compatibility
            </dt>
            <dd class="col-7 col-md-8">
              {{ compatibility }}
            </dd>
            <dt class="col-5 col-md-4">
              Categories
            </dt>
            <dd class="col-7 col-md-8">
              {{ validation.summary.categories }}
            </dd>
            <dt class="col-5 col-md-4">
              Items
            </dt>
            <dd class="col-7 col-md-8">
              {{ validation.summary.items }}
            </dd>
            <dt class="col-5 col-md-4">
              Custom fields
            </dt>
            <dd class="col-7 col-md-8">
              {{ validation.summary.fields }} definition(s), {{ validation.summary.fieldValues }} saved value(s)
            </dd>
            <dt class="col-5 col-md-4">
              Photos
            </dt>
            <dd class="col-7 col-md-8">
              {{ validation.summary.photos }}
            </dd>
          </dl>

          <div
            class="alert alert-danger"
            role="alert"
          >
            <h4 class="alert-title">
              This replaces all current data
            </h4>
            <ul class="mb-0">
              <li>All current items, categories, custom fields, values, and photos are replaced by this backup.</li>
              <li>Everything added or changed after this backup was created disappears from the active database.</li>
              <li>The current database is saved automatically as a pre-restore safety backup on the server first.</li>
              <li>The application briefly becomes unavailable for changes and then reloads.</li>
            </ul>
          </div>

          <div class="mb-3">
            <label
              class="form-label"
              for="restore-confirmation"
            >Type <code>{{ CONFIRMATION }}</code> to confirm</label>
            <input
              id="restore-confirmation"
              v-model="confirmation"
              class="form-control"
              type="text"
              autocomplete="off"
              :placeholder="CONFIRMATION"
              :disabled="busy"
            >
          </div>

          <button
            class="btn btn-danger"
            type="button"
            :disabled="!canRestore"
            @click="restore"
          >
            <span
              v-if="restoring"
              class="spinner-border spinner-border-sm me-1"
              aria-hidden="true"
            />
            {{ restoring ? 'Restoring…' : 'Restore backup' }}
          </button>
          <p class="form-text mt-2 mb-0">
            The validated file is kept on the server for {{ Math.round(validation.expires_in_seconds / 60) }} minutes.
            After that, validate it again.
          </p>
        </template>
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
          Keep regular copies outside this server. Pre-restore safety backups are written to
          <code>pre-restore-backups</code> next to the live database, and the ten most recent are kept.
        </p>
      </div>
    </section>
  </div>
</template>
