<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { api, jsonOptions } from '../api.js';
import FieldAutocomplete from './FieldAutocomplete.vue';

/*
  Bulk Replace Value: pick a field, one exact saved value, and its replacement, review the affected
  items, then confirm. The server finds the matches again when the replacement runs, so the preview
  here is only what the user confirms, never what gets written.
*/
const { t } = useI18n();

const fields = ref({ core: [], custom: [] });
// `core:<key>`, or `custom` when a text custom field is chosen through its category.
const selected = ref('core:location');
const categoryId = ref('');
const customFieldId = ref('');
const from = ref('');
const to = ref('');
const preview = ref(null);
const loading = ref(false);
const applying = ref(false);
const error = ref('');
const done = ref('');

// Only categories that have a text custom field are offered, and then only that category's fields.
const categories = computed(() => [...new Map(fields.value.custom.map(custom => [custom.category_id, custom.category_name]))]
  .map(([id, name]) => ({ id, name }))
  .sort((a, b) => a.name.localeCompare(b.name)));
const categoryFields = computed(() => fields.value.custom.filter(custom => custom.category_id === categoryId.value));

// Null until a custom field is chosen; nothing can be previewed without a field.
const field = computed(() => {
  if (selected.value === 'custom') return customFieldId.value ? { type: 'custom', fieldId: customFieldId.value } : null;
  return { type: 'core', key: selected.value.slice('core:'.length) };
});
const valuesSource = computed(() => (field.value?.type === 'custom'
  ? `/api/items/bulk-replace/values/custom/${field.value.fieldId}`
  : `/api/items/bulk-replace/values/core/${field.value?.key ?? 'location'}`));
const fieldLabel = target => (target.type === 'core'
  ? t(`items.fields.${target.key}`)
  : t('bulkReplace.customFieldOption', { field: target.name, category: target.category_name }));

// A new category starts at its first field, so the chosen field is always visible in the form.
watch(categoryId, () => { customFieldId.value = categoryFields.value[0]?.id ?? ''; });
// A preview belongs to exactly the inputs it was made for.
watch([selected, customFieldId, from, to], () => { preview.value = null; });

onMounted(async () => {
  try {
    fields.value = await api('/api/items/bulk-replace/fields');
  } catch (caught) {
    error.value = caught.message;
  }
});

async function showPreview() {
  loading.value = true;
  error.value = '';
  done.value = '';
  try {
    preview.value = await api('/api/items/bulk-replace/preview', jsonOptions('POST', { field: field.value, from: from.value, to: to.value }));
  } catch (caught) {
    error.value = caught.message;
  } finally {
    loading.value = false;
  }
}

async function apply() {
  if (!preview.value?.count) return;
  applying.value = true;
  error.value = '';
  try {
    const { updated } = await api('/api/items/bulk-replace', jsonOptions('POST', { field: field.value, from: from.value, to: to.value }));
    done.value = updated ? t('bulkReplace.done', { n: updated }, updated) : t('bulkReplace.doneNone');
    from.value = '';
    to.value = '';
  } catch (caught) {
    error.value = caught.message;
  } finally {
    applying.value = false;
  }
}
</script>

<template>
  <section
    class="card mb-3"
    aria-labelledby="bulk-replace-title"
  >
    <div class="card-header">
      <h2
        id="bulk-replace-title"
        class="card-title"
      >
        {{ $t('bulkReplace.title') }}
      </h2>
    </div>
    <div class="card-body">
      <p>{{ $t('bulkReplace.text') }}</p>
      <div
        v-if="done"
        class="alert alert-success"
        role="status"
      >
        {{ done }}
      </div>
      <div
        v-if="error"
        class="alert alert-danger"
        role="alert"
      >
        {{ error }}
      </div>
      <form @submit.prevent="showPreview">
        <div class="mb-3">
          <label
            class="form-label"
            for="bulk-replace-field"
          >{{ $t('bulkReplace.field') }}</label>
          <select
            id="bulk-replace-field"
            v-model="selected"
            class="form-select"
          >
            <option
              v-for="key in fields.core"
              :key="key"
              :value="`core:${key}`"
            >
              {{ $t(`items.fields.${key}`) }}
            </option>
            <option
              v-if="fields.custom.length"
              value="custom"
            >
              {{ $t('bulkReplace.customFieldChoice') }}
            </option>
          </select>
          <div
            v-if="selected === 'core:location'"
            class="form-text"
          >
            {{ $t('bulkReplace.locationHelp') }}
          </div>
        </div>
        <div
          v-if="selected === 'custom'"
          class="row"
        >
          <div class="col-md-6 mb-3">
            <label
              class="form-label"
              for="bulk-replace-category"
            >{{ $t('items.fields.category') }}</label>
            <select
              id="bulk-replace-category"
              v-model="categoryId"
              class="form-select"
              required
            >
              <option
                value=""
                disabled
              >
                {{ $t('common.selectCategory') }}
              </option>
              <option
                v-for="category in categories"
                :key="category.id"
                :value="category.id"
              >
                {{ category.name }}
              </option>
            </select>
          </div>
          <div class="col-md-6 mb-3">
            <label
              class="form-label"
              for="bulk-replace-custom-field"
            >{{ $t('bulkReplace.customField') }}</label>
            <select
              id="bulk-replace-custom-field"
              v-model="customFieldId"
              class="form-select"
              :disabled="!categoryId"
              required
            >
              <option
                v-for="custom in categoryFields"
                :key="custom.id"
                :value="custom.id"
              >
                {{ custom.name }}
              </option>
            </select>
          </div>
        </div>
        <div class="row">
          <div class="col-md-6 mb-3">
            <label
              class="form-label"
              for="bulk-replace-from"
            >{{ $t('bulkReplace.from') }}</label>
            <FieldAutocomplete
              v-model="from"
              input-id="bulk-replace-from"
              :source="valuesSource"
              show-counts
              :disabled="!field"
              required
            />
          </div>
          <div class="col-md-6 mb-3">
            <label
              class="form-label"
              for="bulk-replace-to"
            >{{ $t('bulkReplace.to') }}</label>
            <FieldAutocomplete
              v-model="to"
              input-id="bulk-replace-to"
              :source="valuesSource"
              show-counts
              :disabled="!field"
              required
            />
          </div>
        </div>
        <button
          class="btn btn-outline-primary"
          type="submit"
          :disabled="!field || loading || applying"
        >
          {{ loading ? $t('bulkReplace.previewing') : $t('bulkReplace.preview') }}
        </button>
      </form>

      <section
        v-if="preview"
        class="mt-4"
        aria-labelledby="bulk-replace-preview-title"
      >
        <h3
          id="bulk-replace-preview-title"
          class="h4"
        >
          {{ $t('bulkReplace.previewTitle') }}
        </h3>
        <dl class="row mb-3">
          <dt class="col-sm-4">
            {{ $t('bulkReplace.field') }}
          </dt>
          <dd class="col-sm-8">
            {{ fieldLabel(preview.field) }}
          </dd>
          <template v-if="preview.field.type === 'custom'">
            <dt class="col-sm-4">
              {{ $t('bulkReplace.scope') }}
            </dt>
            <dd class="col-sm-8">
              {{ $t('bulkReplace.customScope', { field: preview.field.name, category: preview.field.category_name }) }}
            </dd>
          </template>
          <dt class="col-sm-4">
            {{ $t('bulkReplace.from') }}
          </dt>
          <dd class="col-sm-8 text-break">
            {{ preview.from }}
          </dd>
          <dt class="col-sm-4">
            {{ $t('bulkReplace.to') }}
          </dt>
          <dd class="col-sm-8 text-break">
            {{ preview.to }}
          </dd>
        </dl>

        <div
          v-if="!preview.count"
          class="alert alert-secondary"
          role="status"
        >
          {{ $t('bulkReplace.none') }}
        </div>
        <template v-else>
          <p class="fw-bold">
            {{ $t('bulkReplace.affected', preview.count) }}
          </p>
          <div
            v-if="preview.existingCount"
            class="alert alert-info"
            role="status"
          >
            <p class="mb-1">
              {{ $t('bulkReplace.existing', { value: preview.to, n: preview.existingCount }, preview.existingCount) }}
            </p>
            <p class="mb-0">
              {{ $t('bulkReplace.additional', preview.count) }}
            </p>
          </div>
          <div class="table-responsive mb-2">
            <table
              class="table table-vcenter card-table border"
              :aria-label="$t('bulkReplace.affectedItems')"
            >
              <thead>
                <tr>
                  <th>{{ $t('bulkReplace.item') }}</th>
                  <th>{{ $t('items.fields.category') }}</th>
                  <th>{{ $t('bulkReplace.savedValue') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="item in preview.items"
                  :key="item.id"
                >
                  <td class="text-break">
                    <RouterLink :to="`/items/${item.uuid}`">
                      {{ item.name }}
                    </RouterLink>
                  </td>
                  <td class="text-break">
                    {{ item.category_name }}
                  </td>
                  <td class="text-break">
                    {{ item.value }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p
            v-if="preview.count > preview.items.length"
            class="meta-text"
          >
            {{ $t('bulkReplace.shownOf', { shown: preview.items.length, count: preview.count }) }}
          </p>
        </template>
        <div class="d-flex flex-wrap gap-2 mt-3">
          <button
            class="btn btn-primary"
            type="button"
            :disabled="!preview.count || applying"
            @click="apply"
          >
            {{ applying ? $t('bulkReplace.applying') : $t('bulkReplace.apply', preview.count) }}
          </button>
          <button
            class="btn"
            type="button"
            :disabled="applying"
            @click="preview = null"
          >
            {{ $t('common.cancel') }}
          </button>
        </div>
      </section>
    </div>
  </section>
</template>
