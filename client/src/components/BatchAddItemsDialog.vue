<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { api, jsonOptions } from '../api.js';
import {
  MAX_BATCH_ITEMS, hasDraftErrors, itemImportDocument, itemImportTemplate, parseItemImportDocument,
  reviewItemDraft
} from '../../../shared/itemImport.js';

const props = defineProps({
  categories: { type: Array, required: true },
  // Preselects the category the item list is filtered by; the user can still pick another one.
  initialCategoryId: { type: [Number, String], default: '' }
});
const emit = defineEmits(['close', 'created']);
const { t } = useI18n();

const currencies = Intl.supportedValuesOf('currency');

const categoryId = ref(props.initialCategoryId);
const fields = ref([]);
const source = ref('');
const drafts = ref(null);
const error = ref('');
const saving = ref(false);
const editor = ref(null);

const category = computed(() => props.categories.find(c => c.id === categoryId.value) || null);

// The selected category is authoritative: its current fields drive the template, parsing, and review.
async function loadFields() {
  fields.value = [];
  if (!category.value) return;
  try {
    fields.value = await api(`/api/categories/${category.value.id}/fields`);
  } catch (loadError) {
    error.value = loadError.message;
  }
}
watch(categoryId, loadFields, { immediate: true });

// Recalculated on every edit or removal, so the inline errors always describe the current batch.
const reviews = computed(() => drafts.value ? drafts.value.map(draft => reviewItemDraft(draft, fields.value)) : []);
const invalidCount = computed(() => reviews.value.filter(hasDraftErrors).length);
const summary = computed(() => {
  const count = t('batchItems.count', drafts.value.length);
  if (!invalidCount.value) return t('batchItems.summary', { count });
  return t('batchItems.summaryInvalid', { count, invalid: t('batchItems.invalid', invalidCount.value) });
});

function preview() {
  error.value = '';
  try {
    drafts.value = parseItemImportDocument(source.value, { categoryName: category.value.name, fields: fields.value });
  } catch (parseError) {
    drafts.value = null;
    error.value = parseError.message;
  }
}
function insertTemplate() {
  const current = source.value.trim();
  if (current && !confirm(t('batchItems.confirmReplace'))) return;
  source.value = JSON.stringify(itemImportTemplate(category.value, fields.value), null, 2);
  nextTick(() => editor.value?.focus());
}
// The original document stays available, so it can be corrected and previewed again.
function backToInput() {
  drafts.value = null;
  error.value = '';
  nextTick(() => editor.value?.focus());
}
// Removing a proposed item only changes this draft; nothing has been written yet.
const removeDraft = index => drafts.value.splice(index, 1);

async function create() {
  saving.value = true;
  error.value = '';
  try {
    const created = await api('/api/items/batch', jsonOptions('POST', {
      categoryId: category.value.id,
      document: itemImportDocument(category.value.name, drafts.value)
    }));
    emit('created', { items: created, category: category.value });
  } catch (requestError) {
    error.value = requestError.message;
  } finally {
    saving.value = false;
  }
}

const inputId = (index, name) => `batch-item-${index}-${name}`;

const onKeydown = event => { if (event.key === 'Escape') emit('close'); };
onMounted(() => {
  document.body.classList.add('modal-open');
  document.addEventListener('keydown', onKeydown);
});
onBeforeUnmount(() => {
  document.body.classList.remove('modal-open');
  document.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <!-- Bootstrap's modal markup driven by Vue state, like the About dialog: no Bootstrap JavaScript. -->
  <div
    class="modal modal-blur d-block"
    role="dialog"
    aria-modal="true"
    aria-labelledby="batch-items-title"
    @click.self="emit('close')"
  >
    <div class="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable">
      <div class="modal-content">
        <div class="modal-header">
          <h2
            id="batch-items-title"
            class="modal-title"
          >
            {{ $t('batchItems.title') }}
            <span
              v-if="category"
              class="text-secondary"
            >{{ $t('batchFields.forCategory', { name: category.name }) }}</span>
          </h2>
          <button
            type="button"
            class="btn-close"
            :aria-label="$t('batchItems.close')"
            @click="emit('close')"
          />
        </div>
        <div class="modal-body">
          <div
            v-if="error"
            class="alert alert-danger"
            role="alert"
          >
            {{ error }}
          </div>
          <template v-if="!drafts">
            <div class="mb-3">
              <label
                class="form-label"
                for="batch-items-category"
              >{{ $t('items.fields.category') }}</label>
              <select
                id="batch-items-category"
                v-model="categoryId"
                class="form-select"
              >
                <option
                  value=""
                  disabled
                >
                  {{ $t('common.selectCategory') }}
                </option>
                <option
                  v-for="c in categories"
                  :key="c.id"
                  :value="c.id"
                >
                  {{ c.name }}
                </option>
              </select>
            </div>
            <p class="text-secondary">
              {{ $t('batchItems.intro', { max: MAX_BATCH_ITEMS }) }}
            </p>
            <textarea
              ref="editor"
              v-model="source"
              class="form-control font-monospace"
              rows="14"
              :aria-label="$t('batchItems.json')"
              spellcheck="false"
              :disabled="!category"
            />
            <div class="mt-2">
              <button
                type="button"
                class="btn btn-link link-secondary p-0"
                :disabled="!category"
                @click="insertTemplate"
              >
                {{ $t('common.insertTemplate') }}
              </button>
            </div>
          </template>
          <template v-else>
            <p
              class="mb-3"
              :class="invalidCount ? 'text-danger' : 'text-secondary'"
              aria-live="polite"
            >
              {{ summary }}
            </p>
            <section
              v-for="(draft, index) in drafts"
              :key="index"
              class="card mb-3"
              :class="{ 'border-danger': hasDraftErrors(reviews[index]) }"
              :aria-label="$t('batchItems.proposed', { n: index + 1 })"
            >
              <div class="card-header">
                <h3 class="card-title">
                  {{ $t('batchItems.item', { n: index + 1 }) }}
                </h3>
                <div class="card-actions">
                  <button
                    type="button"
                    class="btn btn-outline-danger btn-sm"
                    :aria-label="$t('batchItems.removeOf', { n: index + 1 })"
                    @click="removeDraft(index)"
                  >
                    {{ $t('common.remove') }}
                  </button>
                </div>
              </div>
              <div class="card-body row g-3">
                <div class="col-md-6">
                  <label
                    class="form-label"
                    :for="inputId(index, 'name')"
                  >{{ $t('items.fields.name') }} *</label>
                  <input
                    :id="inputId(index, 'name')"
                    v-model="draft.name"
                    class="form-control"
                    :class="{ 'is-invalid': reviews[index].name }"
                  >
                  <div class="invalid-feedback">
                    {{ reviews[index].name }}
                  </div>
                </div>
                <div class="col-md-6">
                  <label
                    class="form-label"
                    :for="inputId(index, 'condition')"
                  >{{ $t('items.fields.condition') }}</label>
                  <input
                    :id="inputId(index, 'condition')"
                    v-model="draft.condition"
                    class="form-control"
                  >
                </div>
                <div class="col-md-6">
                  <label
                    class="form-label"
                    :for="inputId(index, 'location')"
                  >{{ $t('items.fields.location') }}</label>
                  <input
                    :id="inputId(index, 'location')"
                    v-model="draft.location"
                    class="form-control"
                  >
                </div>
                <div class="col-md-6">
                  <label
                    class="form-label"
                    :for="inputId(index, 'transferred-to')"
                  >{{ $t('items.fields.transferredTo') }}</label>
                  <input
                    :id="inputId(index, 'transferred-to')"
                    v-model="draft.transferredTo"
                    class="form-control"
                    :class="{ 'is-invalid': reviews[index].transferredTo }"
                  >
                  <div class="invalid-feedback">
                    {{ reviews[index].transferredTo }}
                  </div>
                </div>
                <div class="col-md-6">
                  <label
                    class="form-label"
                    :for="inputId(index, 'purchase-date')"
                  >{{ $t('items.fields.purchaseDate') }}</label>
                  <input
                    :id="inputId(index, 'purchase-date')"
                    v-model="draft.purchaseDate"
                    class="form-control"
                    :class="{ 'is-invalid': reviews[index].purchaseDate }"
                    type="date"
                  >
                  <div class="invalid-feedback">
                    {{ reviews[index].purchaseDate }}
                  </div>
                </div>
                <div class="col-md-6">
                  <label
                    class="form-label"
                    :for="inputId(index, 'serial-number')"
                  >{{ $t('items.fields.serialNumber') }}</label>
                  <input
                    :id="inputId(index, 'serial-number')"
                    v-model="draft.serialNumber"
                    class="form-control"
                    :class="{ 'is-invalid': reviews[index].serialNumber }"
                  >
                  <div class="invalid-feedback">
                    {{ reviews[index].serialNumber }}
                  </div>
                </div>
                <div class="col-md-6">
                  <label
                    class="form-label"
                    :for="inputId(index, 'purchase-price')"
                  >{{ $t('items.fields.purchasePrice') }}</label>
                  <div
                    class="input-group"
                    :class="{ 'has-validation': reviews[index].purchasePrice }"
                  >
                    <input
                      :id="inputId(index, 'purchase-price')"
                      v-model="draft.purchasePrice.amount"
                      class="form-control"
                      :class="{ 'is-invalid': reviews[index].purchasePrice }"
                      inputmode="decimal"
                      placeholder="0.00"
                    >
                    <select
                      v-model="draft.purchasePrice.currency"
                      class="form-select"
                      :class="{ 'is-invalid': reviews[index].purchasePrice }"
                      :aria-label="$t('batchItems.currencyOf', { n: index + 1 })"
                    >
                      <option value="" />
                      <option
                        v-if="draft.purchasePrice.currency && !currencies.includes(draft.purchasePrice.currency)"
                        :value="draft.purchasePrice.currency"
                      >
                        {{ draft.purchasePrice.currency }}
                      </option>
                      <option
                        v-for="currency in currencies"
                        :key="currency"
                        :value="currency"
                      >
                        {{ currency }}
                      </option>
                    </select>
                    <div class="invalid-feedback">
                      {{ reviews[index].purchasePrice }}
                    </div>
                  </div>
                </div>
                <div class="col-12">
                  <label
                    class="form-label"
                    :for="inputId(index, 'description')"
                  >{{ $t('items.fields.description') }}</label>
                  <textarea
                    :id="inputId(index, 'description')"
                    v-model="draft.description"
                    class="form-control"
                    rows="2"
                  />
                </div>
                <div
                  v-for="field in fields"
                  :key="field.id"
                  class="col-md-6"
                >
                  <label
                    class="form-label"
                    :for="inputId(index, `field-${field.id}`)"
                  >{{ field.name }}</label>
                  <select
                    v-if="field.type === 'boolean'"
                    :id="inputId(index, `field-${field.id}`)"
                    v-model="draft.customFields[field.name]"
                    class="form-select"
                    :class="{ 'is-invalid': reviews[index].customFields?.[field.name] }"
                  >
                    <option value="" />
                    <option
                      v-if="!['', '0', '1'].includes(draft.customFields[field.name])"
                      :value="draft.customFields[field.name]"
                    >
                      {{ draft.customFields[field.name] }}
                    </option>
                    <option value="1">
                      {{ $t('common.yes') }}
                    </option>
                    <option value="0">
                      {{ $t('common.no') }}
                    </option>
                  </select>
                  <input
                    v-else
                    :id="inputId(index, `field-${field.id}`)"
                    v-model="draft.customFields[field.name]"
                    class="form-control"
                    :class="{ 'is-invalid': reviews[index].customFields?.[field.name] }"
                    :type="field.type === 'date' ? 'date' : 'text'"
                    :inputmode="field.type === 'number' ? 'decimal' : undefined"
                  >
                  <div class="invalid-feedback">
                    {{ reviews[index].customFields?.[field.name] }}
                  </div>
                </div>
              </div>
            </section>
            <p
              v-if="!drafts.length"
              class="text-secondary"
            >
              {{ $t('batchItems.empty') }}
            </p>
          </template>
        </div>
        <div class="modal-footer">
          <button
            type="button"
            class="btn btn-link link-secondary"
            @click="emit('close')"
          >
            {{ $t('common.cancel') }}
          </button>
          <button
            v-if="!drafts"
            type="button"
            class="btn btn-primary"
            :disabled="!category || !source.trim()"
            @click="preview"
          >
            {{ $t('common.preview') }}
          </button>
          <template v-else>
            <button
              type="button"
              class="btn"
              @click="backToInput"
            >
              {{ $t('common.editJson') }}
            </button>
            <button
              type="button"
              class="btn btn-primary"
              :disabled="saving || !drafts.length || invalidCount > 0"
              @click="create"
            >
              {{ $t('batchItems.create', drafts.length) }}
            </button>
          </template>
        </div>
      </div>
    </div>
  </div>
  <div class="modal-backdrop show" />
</template>
