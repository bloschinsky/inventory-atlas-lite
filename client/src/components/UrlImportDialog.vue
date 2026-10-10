<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { api, apiBlob, jsonOptions } from '../api.js';
import { capabilities } from '../capabilities.js';
import { formatMoney, translateError } from '../i18n/index.js';
import { matchCustomFields, productAttributes } from '../../../shared/productImport.js';
import ColorValue from './ColorValue.vue';

/*
  Smart URL import over the item form: the server reads a public product page, and this dialog shows
  what it found next to what the form holds now (Current → Found). Only the rows the user leaves
  checked are applied, and only into the form: nothing is saved until the form itself is saved, so
  the item's identity, container, photos, and lifecycle stay exactly as they are. A filled value is
  unchecked by default; an empty one is offered checked. The page price is a suggestion and is never
  copied into Purchase Price unless "Use page price as Purchase Price" is checked. Product images are
  previewed through the server and imported only when selected.

  When AI is on, "Enhance with AI" asks the server to map the same page facts with the configured
  provider. It runs only on that click, and its suggestions join the same rows: a field the page did
  not fill gets an AI row, and a field it did fill keeps the page value, with the AI value offered as
  an alternative. AI values can be edited before they are applied, low-confidence ones start
  unchecked, and choices the user already made are never changed by a later AI answer. A failed
  request leaves the page values as they were.
*/
const props = defineProps({
  form: { type: Object, required: true },
  categories: { type: Array, required: true },
  fields: { type: Array, required: true },
  editing: { type: Boolean, default: false },
  // How many more photos the form can upload with its next save.
  photoSlots: { type: Number, default: 10 }
});
const emit = defineEmits(['close', 'apply']);
const { t } = useI18n();

const url = ref(props.form.source_url || '');
const loading = ref(false);
const error = ref('');
const preview = ref(null);
const urlInput = ref(null);
const dialog = ref(null);

const SOURCE_KEYS = { 'json-ld': 'jsonLd', 'open-graph': 'openGraph', meta: 'meta', html: 'html', page: 'page', ai: 'ai' };
const sourceLabel = source => t(`urlImport.sources.${SOURCE_KEYS[source] ?? 'page'}`);

// A new item may take the suggested category; an existing item always keeps its own.
const categoryId = ref(props.form.category_id || '');
const targetFields = ref(props.fields);
watch(categoryId, async id => {
  if (String(id) === String(props.form.category_id)) targetFields.value = props.fields;
  else targetFields.value = id ? await api(`/api/categories/${id}/fields`) : [];
});

const isEmpty = value => value === null || value === undefined || String(value).trim() === '';
const same = (first, second) => String(first ?? '').trim() === String(second ?? '').trim();

const matched = computed(() => (preview.value
  ? matchCustomFields(productAttributes(preview.value.product, preview.value.provenance), targetFields.value)
  : { matches: [], ambiguous: [] }));

// The AI answer, and its suggestions that apply to the category chosen now, by row key.
const aiResult = ref(null);
const aiLoading = ref(false);
const aiError = ref('');
const aiSuggestions = computed(() => {
  const result = aiResult.value;
  if (!result) return {};
  const entries = Object.entries(result.baseFields).filter(([, value]) => !isEmpty(value)).map(([key, value]) => [key, { value, confidence: null, evidence: null }]);
  if (String(result.categoryId) === String(categoryId.value)) {
    const known = new Set(targetFields.value.map(field => field.id));
    for (const field of result.fields) if (known.has(field.fieldId)) entries.push([`field-${field.fieldId}`, field]);
  }
  return Object.fromEntries(entries);
});

// Every proposed change; values equal to what the form already holds are left out.
const rows = computed(() => {
  if (!preview.value) return [];
  const { baseFields, provenance } = preview.value;
  const sameCategory = String(categoryId.value) === String(props.form.category_id);
  const current = fieldId => (sameCategory ? props.form.field_values[fieldId] : '');
  const base = [
    { key: 'name', label: t('items.fields.name'), current: props.form.name, found: baseFields.name, source: provenance.name },
    { key: 'description', label: t('items.fields.description'), current: props.form.description, found: baseFields.description, source: provenance.description, long: true },
    { key: 'source_url', label: t('items.fields.sourceUrl'), current: props.form.source_url, found: baseFields.source_url, source: 'page' }
  ];
  const custom = matched.value.matches.map(match => ({
    key: `field-${match.fieldId}`, fieldId: match.fieldId, type: match.type, label: match.name,
    current: current(match.fieldId), found: match.value, source: match.source, attribute: match.attribute
  }));
  const all = [...base, ...custom];
  const ai = aiSuggestions.value;
  for (const field of aiResult.value?.fields ?? []) {
    const key = `field-${field.fieldId}`;
    if (ai[key] && !all.some(row => row.key === key)) {
      all.push({ key, fieldId: field.fieldId, type: field.type, label: field.name, current: current(field.fieldId), found: '', source: 'ai' });
    }
  }
  return all.map(row => {
    const suggestion = ai[row.key];
    const pageNew = !isEmpty(row.found) && !same(row.current, row.found);
    const aiNew = suggestion && !same(row.current, suggestion.value) && !same(row.found, suggestion.value);
    return { ...row, pageNew, ai: aiNew ? suggestion : null, aiAgrees: Boolean(suggestion) && same(row.found, suggestion.value) };
  }).filter(row => row.pageNew || row.ai);
});

/*
  A row with both a page value and an AI value keeps the page value until the user picks the AI one
  or edits it. Low-confidence AI rows start unchecked, and a row the user has already seen keeps
  its checkbox whatever a later AI answer says.
*/
const selected = reactive({});
const choice = reactive({});
const edits = reactive({});
watch(rows, list => {
  for (const row of list) if (!(row.key in selected)) selected[row.key] = isEmpty(row.current) && (row.pageNew || row.ai.confidence !== 'low');
});
const choiceOf = row => (row.ai ? choice[row.key] ?? (row.pageNew ? 'page' : 'ai') : 'page');
const valueOf = row => (choiceOf(row) === 'ai' ? edits[row.key] ?? row.ai.value : row.found);
const editable = row => row.ai && !['color', 'boolean'].includes(row.type);
function editAi(row, value) {
  edits[row.key] = value;
  choice[row.key] = 'ai';
}
const aiRowCount = computed(() => rows.value.filter(row => row.ai).length);

// Product details that no field takes; they are shown so nothing found is hidden, but never saved.
const otherDetails = computed(() => {
  if (!preview.value) return [];
  const used = new Set(matched.value.matches.map(match => match.attribute.toLowerCase()));
  return productAttributes(preview.value.product, preview.value.provenance).filter(attribute => !used.has(attribute.name.toLowerCase()));
});
const warnings = computed(() => [
  ...(preview.value?.warnings ?? []).filter(warning => warning.code !== 'URL_IMPORT_WARNING_FIELD_AMBIGUOUS'),
  ...matched.value.ambiguous.map(field => ({ code: 'URL_IMPORT_WARNING_FIELD_AMBIGUOUS', params: { field } }))
]);

// The page price: a clear single reading is preselected for display, but copying it is a separate opt-in.
const priceIndex = ref(null);
const usePrice = ref(false);
const prices = computed(() => preview.value?.price.candidates ?? []);
const currentPrice = computed(() => (isEmpty(props.form.purchase_price?.amount) ? null : props.form.purchase_price));

const images = ref([]);
const selectedImages = computed(() => images.value.filter(image => image.selected));

const displayValue = row => (row.key !== 'source_url' && row.type === 'boolean' ? t(row.value === '1' ? 'common.yes' : 'common.no') : row.value);

async function loadImages(token, candidates) {
  images.value = candidates.map(candidate => ({ ...candidate, status: 'loading', previewUrl: '', blob: null, selected: false }));
  // One at a time: the server limits how many remote reads run together.
  for (const image of images.value) {
    if (!preview.value || preview.value.token !== token) return;
    try {
      image.blob = await apiBlob(`/api/items/import-url/${encodeURIComponent(token)}/images/${image.index}`);
      image.previewUrl = URL.createObjectURL(image.blob);
      image.status = 'ready';
    } catch {
      image.status = 'failed';
    }
  }
}

async function read() {
  loading.value = true; error.value = ''; preview.value = null;
  try {
    const body = { url: url.value };
    if (props.form.category_id) body.categoryId = props.form.category_id;
    const result = await api('/api/items/import-url/preview', jsonOptions('POST', body));
    for (const key of Object.keys(selected)) delete selected[key];
    discardAi();
    preview.value = result;
    if (!props.editing && !props.form.category_id && result.suggestedCategoryId) categoryId.value = result.suggestedCategoryId;
    const current = result.price.candidates.findIndex(candidate => candidate.kind !== 'regular');
    priceIndex.value = result.price.ambiguous || current < 0 ? null : current;
    usePrice.value = false;
    await nextTick();
    dialog.value?.querySelector('[data-review-heading]')?.focus();
    loadImages(result.token, result.images);
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

/*
  Sends nothing but the preview token and, when it is settled, the category: the server enhances the
  facts it extracted itself. An existing item always keeps its category; a new one takes the AI's
  category only when none is chosen yet. The AI's choice among the page prices only preselects that
  price for display; copying it stays the separate "Use page price as Purchase Price" opt-in.
*/
async function enhance() {
  aiLoading.value = true; aiError.value = '';
  try {
    const body = {};
    const fixed = props.editing ? props.form.category_id : categoryId.value;
    if (fixed) body.categoryId = fixed;
    const token = preview.value.token;
    const result = await api(`/api/items/import-url/${encodeURIComponent(token)}/ai`, jsonOptions('POST', body));
    if (preview.value?.token !== token) return;
    aiResult.value = result;
    if (!props.editing && !categoryId.value && result.categoryId) categoryId.value = result.categoryId;
    if (priceIndex.value === null && result.offerPriceIndex !== null) priceIndex.value = result.offerPriceIndex;
  } catch (e) {
    aiError.value = e.message;
  } finally {
    aiLoading.value = false;
  }
}

// Rejects every AI suggestion; the rows fall back to the page values and their earlier choices.
function discardAi() {
  for (const row of rows.value) if (row.ai && !row.pageNew) delete selected[row.key];
  for (const key of Object.keys(choice)) delete choice[key];
  for (const key of Object.keys(edits)) delete edits[key];
  aiResult.value = null;
  aiError.value = '';
}

function toggleImage(image) {
  if (!image.selected && selectedImages.value.length >= props.photoSlots) return;
  image.selected = !image.selected;
}

function apply() {
  const chosen = rows.value.filter(row => selected[row.key]);
  const extension = { 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
  emit('apply', {
    categoryId: !props.editing && categoryId.value && String(categoryId.value) !== String(props.form.category_id) ? categoryId.value : null,
    base: Object.fromEntries(chosen.filter(row => !row.fieldId).map(row => [row.key, valueOf(row)])),
    fieldValues: Object.fromEntries(chosen.filter(row => row.fieldId).map(row => [row.fieldId, valueOf(row)])),
    purchasePrice: usePrice.value && prices.value[priceIndex.value]
      ? { amount: prices.value[priceIndex.value].amount, currency: prices.value[priceIndex.value].currency } : null,
    photos: selectedImages.value.map(image => new File([image.blob], `product-image-${image.index + 1}.${extension[image.blob.type] ?? 'jpg'}`, { type: image.blob.type }))
  });
}

const onKeydown = event => { if (event.key === 'Escape') emit('close'); };
onMounted(() => {
  document.body.classList.add('modal-open');
  document.addEventListener('keydown', onKeydown);
  nextTick(() => urlInput.value?.focus());
});
onBeforeUnmount(() => {
  document.body.classList.remove('modal-open');
  document.removeEventListener('keydown', onKeydown);
  for (const image of images.value) if (image.previewUrl) URL.revokeObjectURL(image.previewUrl);
});
</script>

<template>
  <div
    ref="dialog"
    class="modal modal-blur d-block"
    role="dialog"
    aria-modal="true"
    aria-labelledby="url-import-title"
    @click.self="emit('close')"
  >
    <div class="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable modal-fullscreen-sm-down">
      <div class="modal-content">
        <div class="modal-header">
          <h2
            id="url-import-title"
            class="modal-title"
          >
            {{ editing ? $t('urlImport.fillTitle') : $t('urlImport.newTitle') }}
          </h2>
          <button
            type="button"
            class="btn-close"
            :aria-label="$t('common.close')"
            @click="emit('close')"
          />
        </div>
        <div class="modal-body">
          <form
            class="mb-3"
            @submit.prevent="read"
          >
            <label
              class="form-label"
              for="url-import-address"
            >{{ $t('urlImport.address') }}</label>
            <div class="input-group">
              <input
                id="url-import-address"
                ref="urlInput"
                v-model="url"
                class="form-control"
                type="url"
                inputmode="url"
                maxlength="2048"
                placeholder="https://"
                required
              ><button
                class="btn btn-primary"
                :disabled="loading || !url.trim()"
              >
                <span
                  v-if="loading"
                  class="spinner-border spinner-border-sm me-1"
                  aria-hidden="true"
                />
                {{ loading ? $t('urlImport.reading') : $t('urlImport.read') }}
              </button>
            </div>
            <div class="form-text">
              {{ $t('urlImport.addressHelp') }}
            </div>
          </form>
          <div
            v-if="error"
            class="alert alert-danger"
            role="alert"
          >
            {{ error }}
          </div>

          <template v-if="preview">
            <h3
              class="h3 mb-2"
              tabindex="-1"
              data-review-heading
            >
              {{ $t('urlImport.reviewHeading') }}
            </h3>
            <p class="text-secondary">
              {{ editing ? $t('urlImport.reviewHelpEdit') : $t('urlImport.reviewHelpNew') }}
            </p>
            <div
              v-if="warnings.length"
              class="alert alert-warning"
              role="status"
            >
              <ul class="mb-0 ps-3">
                <li
                  v-for="warning in warnings"
                  :key="`${warning.code}-${warning.params.field ?? ''}`"
                >
                  {{ translateError(warning) }}
                </li>
              </ul>
            </div>

            <div
              v-if="!editing"
              class="mb-3"
            >
              <label
                class="form-label"
                for="url-import-category"
              >{{ $t('items.fields.category') }}</label>
              <select
                id="url-import-category"
                v-model="categoryId"
                class="form-select"
              >
                <option value="">
                  {{ $t('common.selectCategory') }}
                </option><option
                  v-for="category in categories"
                  :key="category.id"
                  :value="category.id"
                >
                  {{ category.name }}
                </option>
              </select>
              <div class="form-text">
                {{ preview.suggestedCategoryId && String(categoryId) === String(preview.suggestedCategoryId)
                  ? $t('urlImport.categorySuggested')
                  : aiResult?.categoryId && String(categoryId) === String(aiResult.categoryId)
                    ? $t('urlImport.ai.categorySuggested') : $t('urlImport.categoryHelp') }}
              </div>
            </div>

            <section
              v-if="capabilities.ai.enabled"
              class="card card-sm mb-3"
              aria-labelledby="url-import-ai-title"
            >
              <div class="card-body">
                <div class="d-flex flex-wrap align-items-start justify-content-between gap-2">
                  <div class="app-url-import-ai-text">
                    <h4
                      id="url-import-ai-title"
                      class="card-title mb-1"
                    >
                      {{ $t('urlImport.ai.title') }}
                    </h4>
                    <p class="text-secondary small mb-0">
                      {{ $t('urlImport.ai.help') }}
                    </p>
                  </div>
                  <button
                    type="button"
                    class="btn btn-outline-primary"
                    :disabled="aiLoading"
                    @click="enhance"
                  >
                    <span
                      v-if="aiLoading"
                      class="spinner-border spinner-border-sm me-1"
                      aria-hidden="true"
                    />
                    {{ aiLoading ? $t('urlImport.ai.running') : aiResult ? $t('urlImport.ai.again') : $t('urlImport.ai.action') }}
                  </button>
                </div>
                <div
                  v-if="aiError"
                  class="alert alert-danger mt-3 mb-0"
                  role="alert"
                >
                  {{ aiError }} {{ $t('urlImport.ai.failed') }}
                </div>
                <div
                  v-if="aiResult"
                  class="mt-3"
                  role="status"
                >
                  <div class="d-flex flex-wrap align-items-center justify-content-between gap-2">
                    <span>{{ aiRowCount ? $t('urlImport.ai.result', { n: aiRowCount }, aiRowCount) : $t('urlImport.ai.none') }}</span>
                    <button
                      type="button"
                      class="btn btn-sm btn-ghost-secondary"
                      @click="discardAi"
                    >
                      {{ $t('urlImport.ai.discard') }}
                    </button>
                  </div>
                  <p
                    v-if="aiRowCount"
                    class="form-text mb-0"
                  >
                    {{ $t('urlImport.ai.confidenceHelp') }}
                  </p>
                  <ul
                    v-if="aiResult.warnings.length"
                    class="text-warning small mt-2 mb-0 ps-3"
                  >
                    <li
                      v-for="warning in aiResult.warnings"
                      :key="`${warning.code}-${warning.params.field ?? ''}`"
                    >
                      {{ translateError(warning) }}
                    </li>
                  </ul>
                  <template v-if="aiResult.notes.length">
                    <div class="small fw-semibold mt-2">
                      {{ $t('urlImport.ai.notes') }}
                    </div>
                    <ul class="small text-secondary mb-0 ps-3">
                      <li
                        v-for="(note, index) in aiResult.notes"
                        :key="index"
                        class="text-break"
                      >
                        {{ note }}
                      </li>
                    </ul>
                  </template>
                </div>
              </div>
            </section>

            <fieldset class="mb-3">
              <legend class="form-label">
                {{ $t('urlImport.foundValues') }}
              </legend>
              <p
                v-if="!rows.length"
                class="text-secondary mb-0"
              >
                {{ $t('urlImport.nothingNew') }}
              </p>
              <ul
                v-else
                class="list-group"
              >
                <li
                  v-for="row in rows"
                  :key="row.key"
                  class="list-group-item"
                >
                  <label class="form-check mb-1">
                    <input
                      v-model="selected[row.key]"
                      class="form-check-input"
                      type="checkbox"
                    >
                    <span class="form-check-label fw-semibold text-break">{{ row.label }}</span>
                    <span
                      v-if="!isEmpty(row.current)"
                      class="badge bg-orange-lt ms-2"
                    >{{ $t('urlImport.conflict') }}</span>
                    <span
                      v-if="row.aiAgrees"
                      class="badge bg-green-lt ms-2"
                    >{{ $t('urlImport.ai.agrees') }}</span>
                  </label>
                  <div class="row g-2 small">
                    <div class="col-12 col-md-6">
                      <div class="text-secondary">
                        {{ $t('urlImport.current') }}
                      </div>
                      <ColorValue
                        v-if="row.type === 'color' && !isEmpty(row.current)"
                        :value="row.current"
                        show-hex
                      />
                      <div
                        v-else
                        class="text-break app-url-import-value"
                      >
                        {{ isEmpty(row.current) ? '—' : displayValue({ ...row, value: row.current }) }}
                      </div>
                    </div>
                    <div class="col-12 col-md-6">
                      <div
                        v-if="row.pageNew"
                        :class="{ 'mb-2': row.ai }"
                      >
                        <label
                          v-if="row.ai"
                          class="form-check mb-0"
                        >
                          <input
                            class="form-check-input"
                            type="radio"
                            :name="`url-import-choice-${row.key}`"
                            :checked="choiceOf(row) === 'page'"
                            @change="choice[row.key] = 'page'"
                          >
                          <span class="form-check-label text-secondary">{{ $t('urlImport.ai.choosePage') }}</span>
                        </label>
                        <div
                          v-else
                          class="text-secondary"
                        >
                          {{ $t('urlImport.found') }}
                          <span class="badge bg-secondary-lt ms-1">{{ sourceLabel(row.source) }}</span>
                        </div>
                        <ColorValue
                          v-if="row.type === 'color'"
                          :value="row.found"
                          show-hex
                        />
                        <div
                          v-else
                          class="text-break app-url-import-value"
                        >
                          {{ displayValue({ ...row, value: row.found }) }}
                        </div>
                        <div
                          v-if="row.attribute && row.attribute.toLowerCase() !== row.label.toLowerCase()"
                          class="text-secondary"
                        >
                          {{ $t('urlImport.fromAttribute', { name: row.attribute }) }}
                        </div>
                      </div>
                      <div v-if="row.ai">
                        <label
                          v-if="row.pageNew"
                          class="form-check mb-0"
                        >
                          <input
                            class="form-check-input"
                            type="radio"
                            :name="`url-import-choice-${row.key}`"
                            :checked="choiceOf(row) === 'ai'"
                            @change="choice[row.key] = 'ai'"
                          >
                          <span class="form-check-label text-secondary">{{ $t('urlImport.ai.chooseAi') }}</span>
                        </label>
                        <div
                          v-else
                          class="text-secondary"
                        >
                          {{ $t('urlImport.found') }}
                        </div>
                        <div class="mb-1">
                          <span class="badge bg-purple-lt">{{ sourceLabel('ai') }}</span>
                          <span
                            v-if="row.ai.confidence"
                            class="badge bg-secondary-lt ms-1"
                          >{{ $t(`urlImport.ai.confidence.${row.ai.confidence}`) }}</span>
                        </div>
                        <textarea
                          v-if="editable(row) && row.long"
                          class="form-control form-control-sm"
                          rows="3"
                          :aria-label="$t('urlImport.ai.edit', { field: row.label })"
                          :value="edits[row.key] ?? row.ai.value"
                          @input="editAi(row, $event.target.value)"
                        />
                        <input
                          v-else-if="editable(row)"
                          class="form-control form-control-sm"
                          :aria-label="$t('urlImport.ai.edit', { field: row.label })"
                          :value="edits[row.key] ?? row.ai.value"
                          @input="editAi(row, $event.target.value)"
                        >
                        <ColorValue
                          v-else-if="row.type === 'color'"
                          :value="row.ai.value"
                          show-hex
                        />
                        <div
                          v-else
                          class="text-break app-url-import-value"
                        >
                          {{ displayValue({ ...row, value: row.ai.value }) }}
                        </div>
                        <div
                          v-if="row.ai.evidence"
                          class="text-secondary text-break"
                        >
                          {{ $t('urlImport.ai.evidence', { text: row.ai.evidence }) }}
                        </div>
                      </div>
                    </div>
                  </div>
                </li>
              </ul>
            </fieldset>

            <fieldset class="mb-3">
              <legend class="form-label">
                {{ $t('urlImport.pagePrice') }}
              </legend>
              <p
                v-if="!prices.length"
                class="text-secondary mb-0"
              >
                {{ $t('urlImport.noPrice') }}
              </p>
              <template v-else>
                <p class="form-text mt-0">
                  {{ $t('urlImport.pagePriceHelp') }}
                </p>
                <label
                  v-for="(price, index) in prices"
                  :key="`${price.kind}-${price.amount}-${price.currency}`"
                  class="form-check"
                >
                  <input
                    v-model="priceIndex"
                    class="form-check-input"
                    type="radio"
                    name="url-import-price"
                    :value="index"
                  >
                  <span class="form-check-label">
                    {{ formatMoney(price.amount, price.currency) }}
                    <span class="badge bg-azure-lt ms-1">{{ $t(`urlImport.priceKinds.${price.kind}`) }}</span>
                    <span class="badge bg-secondary-lt ms-1">{{ sourceLabel(price.source) }}</span>
                    <span
                      v-if="aiResult?.offerPriceIndex === index"
                      class="badge bg-purple-lt ms-1"
                    >{{ $t('urlImport.ai.priceSuggested') }}</span>
                  </span>
                </label>
                <label class="form-check mt-2">
                  <input
                    v-model="usePrice"
                    class="form-check-input"
                    type="checkbox"
                    :disabled="priceIndex === null"
                  >
                  <span class="form-check-label">{{ $t('urlImport.usePrice') }}</span>
                </label>
                <div
                  v-if="currentPrice"
                  class="form-text text-warning"
                >
                  {{ $t('urlImport.priceConflict', { price: formatMoney(currentPrice.amount, currentPrice.currency) }) }}
                </div>
              </template>
            </fieldset>

            <fieldset
              v-if="images.length"
              class="mb-3"
            >
              <legend class="form-label">
                {{ $t('urlImport.images') }}
              </legend>
              <p class="form-text mt-0">
                {{ $t('urlImport.imagesHelp', { n: photoSlots }, photoSlots) }}
              </p>
              <ul class="list-unstyled d-flex flex-wrap gap-3 mb-0">
                <li
                  v-for="image in images"
                  :key="image.index"
                  class="app-photo-tile app-url-import-image"
                >
                  <label class="d-block">
                    <span class="app-photo-tile-frame">
                      <img
                        v-if="image.status === 'ready'"
                        :src="image.previewUrl"
                        :alt="$t('urlImport.imageAlt', { n: image.index + 1 })"
                      >
                      <span
                        v-else-if="image.status === 'loading'"
                        class="spinner-border spinner-border-sm text-secondary"
                        role="status"
                        :aria-label="$t('urlImport.imageLoading')"
                      />
                      <span
                        v-else
                        class="small text-secondary text-center p-2"
                      >{{ $t('urlImport.imageFailed') }}</span>
                    </span>
                    <span class="form-check mt-1 mb-0">
                      <input
                        class="form-check-input"
                        type="checkbox"
                        :checked="image.selected"
                        :disabled="image.status !== 'ready' || (!image.selected && selectedImages.length >= photoSlots)"
                        @change="toggleImage(image)"
                      >
                      <span class="form-check-label small">{{ $t('urlImport.useImage', { n: image.index + 1 }) }}</span>
                    </span>
                  </label>
                </li>
              </ul>
            </fieldset>

            <details
              v-if="otherDetails.length"
              class="mb-0"
            >
              <summary class="form-label mb-2">
                {{ $t('urlImport.otherDetails', { n: otherDetails.length }, otherDetails.length) }}
              </summary>
              <p class="form-text mt-0">
                {{ $t('urlImport.otherDetailsHelp') }}
              </p>
              <dl class="row small mb-0">
                <template
                  v-for="attribute in otherDetails"
                  :key="attribute.name"
                >
                  <dt class="col-5 col-md-4 text-break">
                    {{ attribute.name }}
                  </dt>
                  <dd class="col-7 col-md-8 text-break">
                    {{ attribute.value }}
                  </dd>
                </template>
              </dl>
            </details>
          </template>
        </div>
        <div class="modal-footer">
          <button
            type="button"
            class="btn"
            @click="emit('close')"
          >
            {{ $t('common.cancel') }}
          </button>
          <button
            v-if="preview"
            type="button"
            class="btn btn-primary"
            @click="apply"
          >
            {{ editing ? $t('urlImport.applyEdit') : $t('urlImport.applyNew') }}
          </button>
        </div>
      </div>
    </div>
  </div>
  <div class="modal-backdrop show" />
</template>
