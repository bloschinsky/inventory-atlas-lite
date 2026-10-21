<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { api, jsonOptions } from '../api.js';
import { activeDatabase, loadContentLanguage } from '../activeDatabase.js';
import { translateError } from '../i18n/index.js';
import { formValue, selectionProblem, translationCandidates } from '../itemTranslation.js';
import LanguageSelect from './LanguageSelect.vue';
import { AUTO_DETECT, contentLanguageName, normalizeContentLanguage } from '../../../shared/languages.js';

/*
  Translate Item with AI over the unsaved item form, in two steps. Select: the form's current texts
  with a checkbox each, and the two languages; Preview translation sends only the checked texts, in
  one request. Review: every requested field with its current text and its proposal, editable, and
  its own Apply checkbox, on only for a real translation. Apply selected translations emits the
  approved texts by key; the form owns the draft and Save item stays the only way anything is stored.
  A row whose form value or category changed after the preview can no longer be applied, and a
  response that arrives after a newer preview, Change selection, or closing is ignored.
*/
const props = defineProps({
  form: { type: Object, required: true },
  fields: { type: Array, required: true }
});
const emit = defineEmits(['apply', 'close']);
const { locale, t } = useI18n();

const source = ref(AUTO_DETECT);
// The database's Preferred Content Language, or the interface language while none is saved.
const target = ref(normalizeContentLanguage(activeDatabase.metadata?.content_language) ?? normalizeContentLanguage(locale.value) ?? 'en');
const candidates = computed(() => translationCandidates(props.form, props.fields, t));
// The user's choice per key; a key without one keeps its row's default.
const choices = reactive({});
const isChosen = row => !row.disabled && (choices[row.key] ?? row.selected);
const chosen = computed(() => candidates.value.filter(isChosen));
const problem = computed(() => selectionProblem(chosen.value));
const selectAll = value => { for (const row of candidates.value) if (!row.disabled) choices[row.key] = value; };

const step = ref('select');
const pending = ref(false);
const error = ref('');
const sent = ref(null);
const rows = ref([]);
const reviewHeading = ref(null);
let latest = 0;

const categoryChanged = computed(() => sent.value !== null && String(props.form.category_id) !== String(sent.value.categoryId));
const stale = row => formValue(props.form, row.key).trim() !== row.source || (row.key.startsWith('field:') && categoryChanged.value);
const approved = computed(() => rows.value.filter(row => row.apply && !stale(row) && row.translation.trim()));
const warnings = ref([]);

async function preview() {
  if (!chosen.value.length || problem.value) return;
  const request = ++latest;
  const entries = chosen.value.map(row => ({ key: row.key, text: row.text }));
  const labels = Object.fromEntries(chosen.value.map(row => [row.key, row]));
  const categoryId = props.form.category_id;
  pending.value = true; error.value = '';
  try {
    const response = await api('/api/ai/translate', jsonOptions('POST', {
      targetLanguage: target.value,
      sourceLanguage: source.value,
      categoryId: categoryId || null,
      fields: entries
    }));
    if (request !== latest) return;
    sent.value = { categoryId };
    rows.value = response.fields.map(field => ({
      ...field,
      label: labels[field.key].label,
      place: labels[field.key].note === 'place',
      translation: field.translation ?? '',
      offered: field.translation !== null,
      apply: field.status === 'translated',
      detected: response.sourceLanguage === AUTO_DETECT && field.detectedLanguage
        ? t('translation.detected', { language: contentLanguageName(field.detectedLanguage, locale.value) }) : ''
    }));
    warnings.value = response.warnings;
    step.value = 'review';
    await nextTick();
    reviewHeading.value?.focus();
  } catch (caught) {
    if (request === latest) error.value = caught.message;
  } finally {
    if (request === latest) pending.value = false;
  }
}

function back() {
  latest++;
  pending.value = false; error.value = ''; sent.value = null; rows.value = []; warnings.value = [];
  step.value = 'select';
}

function apply() {
  if (!approved.value.length) return;
  emit('apply', Object.fromEntries(approved.value.map(row => [row.key, row.translation.trim()])));
}

function close() {
  latest++;
  emit('close');
}

const onKeydown = event => { if (event.key === 'Escape') close(); };
onMounted(async () => {
  document.body.classList.add('modal-open');
  document.addEventListener('keydown', onKeydown);
  nextTick(() => document.getElementById('translate-item-title')?.focus());
  // Settings → Database may not have been opened yet; without a saved preference the default stays.
  const saved = await loadContentLanguage();
  if (saved && sent.value === null && !pending.value) target.value = saved;
});
onBeforeUnmount(() => {
  document.body.classList.remove('modal-open');
  document.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <div
    class="modal modal-blur d-block"
    role="dialog"
    aria-modal="true"
    aria-labelledby="translate-item-title"
    @click.self="close"
  >
    <div class="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable modal-fullscreen-md-down">
      <form
        class="modal-content"
        @submit.prevent="step === 'select' ? preview() : apply()"
      >
        <div class="modal-header">
          <h2
            id="translate-item-title"
            class="modal-title"
            tabindex="-1"
          >
            {{ $t('translateItem.title') }}
          </h2>
          <button
            type="button"
            class="btn-close"
            :aria-label="$t('common.close')"
            @click="close"
          />
        </div>
        <div class="modal-body">
          <template v-if="step === 'select'">
            <div class="row">
              <div class="col-sm-6 mb-3">
                <label
                  class="form-label"
                  for="translate-item-source"
                >{{ $t('translation.source') }}</label>
                <LanguageSelect
                  id="translate-item-source"
                  v-model="source"
                  :label="$t('translation.source')"
                  auto
                />
              </div>
              <div class="col-sm-6 mb-3">
                <label
                  class="form-label"
                  for="translate-item-target"
                >{{ $t('translation.target') }}</label>
                <LanguageSelect
                  id="translate-item-target"
                  v-model="target"
                  :label="$t('translation.target')"
                />
              </div>
            </div>
            <p
              v-if="!candidates.length"
              class="text-secondary"
            >
              {{ $t('translateItem.empty') }}
            </p>
            <fieldset
              v-else
              class="mb-3"
            >
              <legend class="form-label mb-1">
                {{ $t('translateItem.fieldsLegend') }}
              </legend>
              <div class="d-flex flex-wrap align-items-center gap-2 mb-2">
                <span
                  class="text-secondary small"
                  aria-live="polite"
                >{{ $t('translateItem.selectedCount', chosen.length) }}</span>
                <div class="ms-auto d-flex gap-2">
                  <button
                    type="button"
                    class="btn btn-sm"
                    @click="selectAll(true)"
                  >
                    {{ $t('translateItem.selectAll') }}
                  </button>
                  <button
                    type="button"
                    class="btn btn-sm"
                    @click="selectAll(false)"
                  >
                    {{ $t('translateItem.selectNone') }}
                  </button>
                </div>
              </div>
              <div class="list-group">
                <label
                  v-for="row in candidates"
                  :key="row.key"
                  class="list-group-item d-flex gap-2"
                  :class="{ 'text-secondary': row.disabled }"
                >
                  <input
                    class="form-check-input flex-shrink-0 mt-1"
                    type="checkbox"
                    :checked="isChosen(row)"
                    :disabled="row.disabled"
                    :aria-labelledby="`translate-item-${row.key}-name`"
                    :aria-describedby="`translate-item-${row.key}-text${row.note ? ` translate-item-${row.key}-note` : ''}`"
                    @change="choices[row.key] = $event.target.checked"
                  >
                  <span class="min-w-0">
                    <span
                      :id="`translate-item-${row.key}-name`"
                      class="d-block fw-medium"
                    >{{ row.label }}</span>
                    <span
                      :id="`translate-item-${row.key}-text`"
                      class="d-block text-secondary text-break app-translate-preview"
                    >{{ row.text }}</span>
                    <span
                      v-if="row.note"
                      :id="`translate-item-${row.key}-note`"
                      class="d-block small mt-1"
                    >{{ $t(`translateItem.notes.${row.note}`, { max: row.maxLength }) }}</span>
                  </span>
                </label>
              </div>
            </fieldset>
            <div
              v-if="problem"
              class="alert alert-warning"
              role="alert"
            >
              {{ translateError(problem) }} {{ $t('translateItem.reduceSelection') }}
            </div>
            <p class="form-text mt-0">
              {{ $t('translateItem.privacy') }}
            </p>
          </template>
          <template v-else>
            <h3
              ref="reviewHeading"
              class="mb-1"
              tabindex="-1"
            >
              {{ $t('translateItem.reviewHeading') }}
            </h3>
            <p class="text-secondary">
              {{ $t('translateItem.reviewHelp') }}
            </p>
            <div
              v-if="categoryChanged"
              class="alert alert-warning"
              role="alert"
            >
              {{ $t('translateItem.categoryChanged') }}
            </div>
            <div
              v-if="warnings.length"
              class="alert alert-warning"
              role="status"
            >
              <ul class="mb-0 ps-3">
                <li
                  v-for="warning in warnings"
                  :key="warning.code"
                >
                  {{ translateError(warning) }}
                </li>
              </ul>
            </div>
            <section
              v-for="row in rows"
              :key="row.key"
              class="border rounded p-3 mb-3"
              :aria-labelledby="`translate-item-${row.key}-label`"
            >
              <div class="d-flex flex-wrap align-items-center gap-2 mb-2">
                <h4
                  :id="`translate-item-${row.key}-label`"
                  class="mb-0 me-auto text-break"
                >
                  {{ row.label }}
                </h4>
                <label
                  v-if="row.offered"
                  class="form-check mb-0"
                >
                  <input
                    v-model="row.apply"
                    class="form-check-input"
                    type="checkbox"
                    :disabled="stale(row)"
                  >
                  <span class="form-check-label">{{ $t('translateItem.applyRow', { field: row.label }) }}</span>
                </label>
              </div>
              <div class="row g-2">
                <div class="col-md-6">
                  <div class="form-label small text-secondary mb-1">
                    {{ $t('translateItem.current') }}
                  </div>
                  <div
                    class="form-control-plaintext text-break app-translate-preview"
                  >
                    {{ row.source }}
                  </div>
                </div>
                <div class="col-md-6">
                  <template v-if="row.offered">
                    <label
                      class="form-label small text-secondary mb-1"
                      :for="`translate-item-${row.key}-result`"
                    >{{ $t('translateItem.translationOf', { field: row.label }) }}</label>
                    <textarea
                      :id="`translate-item-${row.key}-result`"
                      v-model="row.translation"
                      class="form-control"
                      rows="2"
                      :disabled="stale(row)"
                      @input="row.apply = true"
                    />
                  </template>
                  <span
                    v-if="row.detected"
                    class="d-block form-text"
                  >{{ row.detected }}</span>
                </div>
              </div>
              <ul
                v-if="row.warnings.length || row.place || stale(row)"
                class="list-unstyled small mb-0 mt-2"
              >
                <li
                  v-for="warning in row.warnings"
                  :key="warning.code"
                  :class="row.status === 'invalid' ? 'text-danger' : 'text-secondary'"
                >
                  {{ translateError(warning) }}
                </li>
                <li v-if="row.place && row.offered">
                  {{ $t('translateItem.verifyNames') }}
                </li>
                <li
                  v-if="stale(row)"
                  class="fw-medium"
                >
                  {{ $t('translateItem.stale') }}
                </li>
              </ul>
            </section>
          </template>
          <div
            v-if="error"
            class="alert alert-danger"
            role="alert"
          >
            {{ error }}
          </div>
          <div
            v-if="pending"
            class="text-secondary"
            role="status"
          >
            {{ $t('translation.translating') }}
          </div>
        </div>
        <div class="modal-footer">
          <button
            type="button"
            class="btn me-auto"
            @click="close"
          >
            {{ $t('common.cancel') }}
          </button>
          <template v-if="step === 'select'">
            <button
              type="submit"
              class="btn btn-primary"
              :disabled="pending || !chosen.length || Boolean(problem)"
            >
              {{ pending ? $t('translation.translating') : $t('translateItem.preview') }}
            </button>
          </template>
          <template v-else>
            <button
              type="button"
              class="btn"
              @click="back"
            >
              {{ $t('translateItem.back') }}
            </button>
            <button
              type="button"
              class="btn"
              :disabled="pending || !chosen.length || Boolean(problem)"
              @click="preview"
            >
              {{ pending ? $t('translation.translating') : $t('translateItem.previewAgain') }}
            </button>
            <button
              type="submit"
              class="btn btn-primary"
              :disabled="!approved.length"
            >
              {{ $t('translateItem.apply', approved.length) }}
            </button>
          </template>
        </div>
      </form>
    </div>
  </div>
  <div class="modal-backdrop show" />
</template>
