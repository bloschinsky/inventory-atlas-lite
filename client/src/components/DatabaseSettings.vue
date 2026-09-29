<script setup>
import { onMounted, ref } from 'vue';
import { api, jsonOptions } from '../api.js';
import { formatDateTime } from '../i18n/index.js';

// The identity of the current database. Only the name is editable; the rest is managed by the server.
const metadata = ref(null);
const name = ref('');
const saving = ref(false);
const saved = ref(false);
const error = ref('');

function show(data) {
  metadata.value = data;
  name.value = data.name;
}

async function save() {
  saving.value = true; error.value = ''; saved.value = false;
  try {
    show(await api('/api/database/metadata', jsonOptions('PUT', { name: name.value })));
    saved.value = true;
  } catch (caught) { error.value = caught.message; } finally { saving.value = false; }
}

onMounted(async () => {
  try { show(await api('/api/database/metadata')); } catch (caught) { error.value = caught.message; }
});
</script>

<template>
  <section
    class="card mb-3"
    aria-labelledby="database-settings-title"
  >
    <div class="card-header">
      <h2
        id="database-settings-title"
        class="card-title"
      >
        {{ $t('settings.database.title') }}
      </h2>
    </div>
    <div class="card-body">
      <div
        v-if="error"
        class="alert alert-danger"
        role="alert"
      >
        {{ error }}
      </div>
      <div
        v-if="saved"
        class="alert alert-success"
        role="status"
      >
        {{ $t('settings.database.saved') }}
      </div>
      <div
        v-if="!metadata && !error"
        class="text-secondary"
      >
        {{ $t('settings.loading') }}
      </div>
      <template v-if="metadata">
        <form
          class="mb-3"
          @submit.prevent="save"
        >
          <label
            class="form-label"
            for="database-name"
          >{{ $t('settings.database.name') }}</label>
          <div class="input-group">
            <input
              id="database-name"
              v-model="name"
              class="form-control"
              required
              maxlength="100"
            >
            <button
              class="btn btn-primary"
              :disabled="saving"
            >
              {{ saving ? $t('common.saving') : $t('settings.database.saveName') }}
            </button>
          </div>
          <div class="form-text">
            {{ $t('settings.database.nameHelp') }}
          </div>
        </form>
        <dl class="row mb-0">
          <dt class="col-sm-4">
            {{ $t('settings.database.lastUpdated') }}
          </dt>
          <dd class="col-sm-8">
            {{ formatDateTime(metadata.last_updated_at) }}
          </dd>
        </dl>
        <details>
          <summary class="mb-2">
            {{ $t('settings.database.technicalDetails') }}
          </summary>
          <dl class="row mb-0">
            <dt class="col-sm-4">
              {{ $t('settings.database.created') }}
            </dt>
            <dd class="col-sm-8">
              {{ formatDateTime(metadata.created_at) }}
            </dd>
            <dt class="col-sm-4">
              {{ $t('settings.database.uuid') }}
            </dt>
            <dd class="col-sm-8 text-break">
              <code>{{ metadata.database_uuid }}</code>
            </dd>
            <dt class="col-sm-4">
              {{ $t('settings.database.schemaVersion') }}
            </dt>
            <dd class="col-sm-8">
              {{ metadata.schema_version }}
            </dd>
          </dl>
        </details>
      </template>
    </div>
  </section>
</template>
