<script setup>
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { loadActiveDatabase, renameActiveDatabase, saveContentLanguage } from '../../activeDatabase.js';
import { formatDateTime } from '../../i18n/index.js';
import { useUnsavedChanges } from '../../settingsOverlay.js';
import LanguageSelect from '../LanguageSelect.vue';
import { normalizeContentLanguage } from '../../../../shared/languages.js';

/*
  The identity of the current database. The name and the Preferred Content Language are editable;
  the rest is managed by the server. Loads and saves go through activeDatabase.js, so the indicator in
  the shell follows at once. While no content language is saved, the interface language is only
  preselected: nothing is written until the user saves it.
*/
const { locale } = useI18n();
const metadata = ref(null);
const name = ref('');
const contentLanguage = ref('en');
const saving = ref(false);
// Which value was saved last: 'name' or 'language'.
const saved = ref('');
const error = ref('');
const savedLanguage = () => normalizeContentLanguage(metadata.value?.content_language) ?? normalizeContentLanguage(locale.value) ?? 'en';
useUnsavedChanges(() => Boolean(metadata.value) && (name.value !== metadata.value.name || contentLanguage.value !== savedLanguage()));

function show(data) {
  metadata.value = data;
  name.value = data.name;
  contentLanguage.value = savedLanguage();
}

async function save(kind, work) {
  saving.value = true; error.value = ''; saved.value = '';
  try {
    const data = await work();
    // Saving one value keeps the other one's unsaved edit.
    const pending = kind === 'name' ? contentLanguage.value : name.value;
    show(data);
    if (kind === 'name') contentLanguage.value = pending; else name.value = pending;
    saved.value = kind;
  } catch (caught) { error.value = caught.message; } finally { saving.value = false; }
}
const saveName = () => save('name', () => renameActiveDatabase(name.value));
const saveLanguage = () => save('language', () => saveContentLanguage(contentLanguage.value));

onMounted(async () => {
  try { show(await loadActiveDatabase()); } catch (caught) { error.value = caught.message; }
});
</script>

<template>
  <section
    class="card"
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
        {{ saved === 'name' ? $t('settings.database.saved') : $t('settings.database.contentLanguageSaved') }}
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
          @submit.prevent="saveName"
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
        <form
          class="mb-3"
          @submit.prevent="saveLanguage"
        >
          <label
            class="form-label"
            for="database-content-language"
          >{{ $t('settings.database.contentLanguage') }}</label>
          <div class="d-flex flex-wrap align-items-end gap-2">
            <LanguageSelect
              id="database-content-language"
              v-model="contentLanguage"
              class="flex-grow-1"
              :label="$t('settings.database.contentLanguage')"
            />
            <button
              class="btn btn-primary"
              :disabled="saving"
            >
              {{ saving ? $t('common.saving') : $t('settings.database.saveContentLanguage') }}
            </button>
          </div>
          <div class="form-text">
            {{ $t('settings.database.contentLanguageHelp') }}
            <template v-if="!metadata.content_language">
              {{ $t('settings.database.contentLanguageUnset') }}
            </template>
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
