<script setup>
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { api, jsonOptions } from '../api.js';
import { formatFileSize } from '../i18n/index.js';
import BulkReplaceValue from '../components/BulkReplaceValue.vue';
import PageHeader from '../components/PageHeader.vue';
import ResetDatabaseDialog from '../components/ResetDatabaseDialog.vue';

defineOptions({ name: 'DataBackupPage' });
const { t } = useI18n();

const CONFIRMATION = 'RESTORE';

const file = ref(null);
const validation = ref(null);
const confirmation = ref('');
const validating = ref(false);
const restoring = ref(false);
const error = ref('');
const success = ref(null);
const resetOpen = ref(false);
const resetResult = ref(null);

const compatibility = computed(() => {
  const summary = validation.value?.summary;
  if (!summary) return '';
  return t(summary.migratedFrom !== null ? 'backup.compatibleUpgraded' : 'backup.compatible', { schema: summary.schemaVersion });
});
const busy = computed(() => validating.value || restoring.value);
const canRestore = computed(() => Boolean(validation.value) && confirmation.value.trim().toUpperCase() === CONFIRMATION && !busy.value);

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

async function finishReset(result) {
  resetOpen.value = false;
  resetResult.value = result;
  await waitUntilReady();
  // Like a restore, a full page load drops every cached view of the removed data.
  setTimeout(() => window.location.assign('/items'), 2000);
}
</script>

<template>
  <div class="form-card">
    <PageHeader
      :title="$t('backup.title')"
      :subtitle="$t('backup.subtitle')"
    />
    <section class="card mb-3">
      <div class="card-header">
        <h2 class="card-title">
          {{ $t('backup.sqlite') }}
        </h2>
      </div>
      <div class="card-body">
        <p>{{ $t('backup.downloadText') }}</p>
        <a
          class="btn btn-primary"
          href="/api/backup"
        >{{ $t('backup.download') }}</a>
        <i18n-t
          keypath="backup.cloudHint"
          tag="p"
          class="meta-text mt-3 mb-0"
          scope="global"
        >
          <template #link>
            <RouterLink to="/settings">
              {{ $t('backup.cloudLink') }}
            </RouterLink>
          </template>
        </i18n-t>
      </div>
    </section>

    <section class="card mb-3">
      <div class="card-header">
        <h2 class="card-title">
          {{ $t('backup.restoreTitle') }}
        </h2>
      </div>
      <div class="card-body">
        <div
          v-if="success"
          class="alert alert-success"
          role="status"
        >
          <h3 class="alert-title">
            {{ $t('backup.restored') }}
          </h3>
          <p class="mb-1">
            {{ $t('backup.restoredSummary', {
              items: $t('counts.items', success.summary.items),
              categories: $t('counts.categories', success.summary.categories),
              photos: $t('counts.photos', success.summary.photos)
            }) }}
          </p>
          <i18n-t
            keypath="backup.restoredSafety"
            tag="p"
            class="mb-0"
            scope="global"
          >
            <template #file>
              <code>{{ success.safety_backup }}</code>
            </template>
          </i18n-t>
        </div>
        <div
          v-if="error"
          class="alert alert-danger"
          role="alert"
        >
          {{ error }}
        </div>

        <p>
          {{ $t('backup.restoreText') }}
        </p>

        <div class="mb-3">
          <label
            class="form-label"
            for="restore-file"
          >{{ $t('backup.file') }}</label>
          <input
            id="restore-file"
            class="form-control"
            type="file"
            accept=".sqlite,.sqlite3,.db"
            :disabled="busy"
            @change="selectFile"
          >
          <div class="form-text">
            <i18n-t
              keypath="backup.fileHelp"
              scope="global"
            >
              <template #name>
                <code>inventory-YYYY-MM-DD.sqlite</code>
              </template>
              <template #extensions>
                <code>.sqlite</code>, <code>.sqlite3</code>, <code>.db</code>
              </template>
            </i18n-t>
          </div>
        </div>

        <p
          v-if="file"
          class="meta-text"
        >
          {{ $t('backup.selected') }} <strong>{{ file.name }}</strong> ({{ formatFileSize(file.size) }})
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
          {{ validating ? $t('backup.validating') : $t('backup.validate') }}
        </button>

        <template v-if="validation">
          <h3 class="h4 mt-4">
            {{ $t('backup.validation') }}
          </h3>
          <dl class="row mb-3">
            <dt class="col-5 col-md-4">
              {{ $t('backup.fileLabel') }}
            </dt>
            <dd class="col-7 col-md-8">
              {{ validation.filename }} ({{ formatFileSize(validation.size_bytes) }})
            </dd>
            <dt class="col-5 col-md-4">
              {{ $t('backup.compatibility') }}
            </dt>
            <dd class="col-7 col-md-8">
              {{ compatibility }}
            </dd>
            <dt class="col-5 col-md-4">
              {{ $t('categories.categories') }}
            </dt>
            <dd class="col-7 col-md-8">
              {{ validation.summary.categories }}
            </dd>
            <dt class="col-5 col-md-4">
              {{ $t('items.title') }}
            </dt>
            <dd class="col-7 col-md-8">
              {{ validation.summary.items }}
            </dd>
            <dt class="col-5 col-md-4">
              {{ $t('backup.customFields') }}
            </dt>
            <dd class="col-7 col-md-8">
              {{ $t('backup.fieldSummary', {
                definitions: $t('backup.definitions', validation.summary.fields),
                values: $t('backup.values', validation.summary.fieldValues)
              }) }}
            </dd>
            <dt class="col-5 col-md-4">
              {{ $t('photos.title') }}
            </dt>
            <dd class="col-7 col-md-8">
              {{ validation.summary.photos }}
            </dd>
            <dt class="col-5 col-md-4">
              {{ $t('templates.title') }}
            </dt>
            <dd class="col-7 col-md-8">
              {{ validation.summary.templates }}
            </dd>
          </dl>

          <div
            class="alert alert-danger"
            role="alert"
          >
            <h4 class="alert-title">
              {{ $t('backup.warningTitle') }}
            </h4>
            <ul class="mb-0">
              <li>{{ $t('backup.warningReplaced') }}</li>
              <li>{{ $t('backup.warningLost') }}</li>
              <li>{{ $t('backup.warningSafety') }}</li>
              <li>{{ $t('backup.warningReload') }}</li>
            </ul>
          </div>

          <div class="mb-3">
            <label
              class="form-label"
              for="restore-confirmation"
            ><i18n-t
              keypath="common.typeToConfirm"
              scope="global"
            ><template #phrase><code>{{ CONFIRMATION }}</code></template></i18n-t></label>
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
            {{ restoring ? $t('backup.restoring') : $t('backup.restore') }}
          </button>
          <p class="form-text mt-2 mb-0">
            {{ $t('backup.expires', Math.round(validation.expires_in_seconds / 60)) }}
          </p>
        </template>
      </div>
    </section>

    <BulkReplaceValue />

    <section class="card">
      <div class="card-header">
        <h2 class="card-title">
          {{ $t('backup.whereTitle') }}
        </h2>
      </div>
      <div class="card-body meta-text">
        <i18n-t
          keypath="backup.whereLive"
          tag="p"
          class="mb-2"
          scope="global"
        >
          <template #file>
            <code>data/inventory.sqlite</code>
          </template>
          <template #variable>
            <code>DATA_DIR</code>
          </template>
        </i18n-t>
        <i18n-t
          keypath="backup.whereCopies"
          tag="p"
          class="mb-0"
          scope="global"
        >
          <template #restoreDir>
            <code>pre-restore-backups</code>
          </template>
          <template #resetDir>
            <code>pre-reset-backups</code>
          </template>
        </i18n-t>
      </div>
    </section>

    <!-- Kept apart from the backup actions above so a destructive click cannot happen by accident. -->
    <section
      class="card border-danger mt-5"
      aria-labelledby="danger-zone-title"
    >
      <div class="card-status-top bg-danger" />
      <div class="card-header">
        <h2
          id="danger-zone-title"
          class="card-title text-danger"
        >
          {{ $t('backup.dangerZone') }}
        </h2>
      </div>
      <div class="card-body">
        <div
          v-if="resetResult"
          class="alert alert-success"
          role="status"
        >
          <h3 class="alert-title">
            {{ $t('reset.completed') }}
          </h3>
          <p class="mb-1">
            {{ $t('reset.ready') }}
          </p>
          <i18n-t
            keypath="reset.safety"
            tag="p"
            class="mb-0"
            scope="global"
          >
            <template #file>
              <code>{{ resetResult.safetyBackup }}</code>
            </template>
          </i18n-t>
        </div>
        <h3 class="h4">
          {{ $t('reset.title') }}
        </h3>
        <p class="mb-2">
          {{ $t('reset.text') }}
        </p>
        <p class="meta-text">
          {{ $t('reset.preserved') }}
        </p>
        <button
          class="btn btn-outline-danger"
          type="button"
          :disabled="busy || Boolean(resetResult)"
          @click="resetOpen = true"
        >
          {{ $t('reset.title') }}
        </button>
      </div>
    </section>

    <ResetDatabaseDialog
      v-if="resetOpen"
      @close="resetOpen = false"
      @reset="finishReset"
    />
  </div>
</template>
