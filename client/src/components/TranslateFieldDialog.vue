<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { api, jsonOptions } from '../api.js';
import { activeDatabase, loadActiveDatabase } from '../activeDatabase.js';
import { translateError } from '../i18n/index.js';
import LanguageSelect from './LanguageSelect.vue';
import { AUTO_DETECT, contentLanguageName, normalizeContentLanguage } from '../../../shared/languages.js';

/*
  Translate one text field of the unsaved item form. Nothing is sent until the user presses Translate,
  and nothing is saved: Use translation hands the reviewed text back to the form, and Save item stays
  the only way it reaches the database. `read` returns the field's current form value. A translation
  of a text that has changed since it was requested is never offered: the user has to translate the
  current text again.
*/
const props = defineProps({
  field: { type: Object, required: true },
  categoryId: { type: [Number, String], default: null },
  read: { type: Function, required: true }
});
const emit = defineEmits(['apply', 'close']);
const { locale, t } = useI18n();

const source = ref(AUTO_DETECT);
// The database's Preferred Content Language, or the interface language while none is saved.
const target = ref(normalizeContentLanguage(activeDatabase.metadata?.content_language) ?? normalizeContentLanguage(locale.value) ?? 'en');
const current = computed(() => String(props.read() ?? ''));
const sent = ref(null);
const result = ref(null);
const translation = ref('');
const pending = ref(false);
const error = ref('');
let latest = 0;

const stale = computed(() => sent.value !== null && current.value !== sent.value);
const detected = computed(() => (result.value && result.value.sourceLanguage === AUTO_DETECT && result.value.field.detectedLanguage
  ? t('translation.detected', { language: contentLanguageName(result.value.field.detectedLanguage, locale.value) }) : ''));
const warnings = computed(() => [...(result.value?.field.warnings ?? []), ...(result.value?.warnings ?? [])]);

async function translate() {
  const request = ++latest;
  const text = current.value;
  pending.value = true; error.value = ''; result.value = null; translation.value = ''; sent.value = text;
  try {
    const response = await api('/api/ai/translate', jsonOptions('POST', {
      targetLanguage: target.value,
      sourceLanguage: source.value,
      categoryId: props.categoryId || null,
      fields: [{ key: props.field.key, text }]
    }));
    if (request !== latest) return;
    const [field] = response.fields;
    result.value = { sourceLanguage: response.sourceLanguage, field, warnings: response.warnings };
    translation.value = field.translation ?? '';
  } catch (caught) {
    if (request === latest) { error.value = caught.message; sent.value = null; }
  } finally {
    if (request === latest) pending.value = false;
  }
}

function use() {
  if (stale.value || !translation.value.trim()) return;
  emit('apply', translation.value.trim());
}

function close() {
  // A response that arrives after closing is ignored.
  latest++;
  emit('close');
}

const onKeydown = event => { if (event.key === 'Escape') close(); };
onMounted(async () => {
  document.body.classList.add('modal-open');
  document.addEventListener('keydown', onKeydown);
  nextTick(() => document.getElementById('translate-submit')?.focus());
  // Settings → Database may not have been opened yet; without a saved preference the default stays.
  if (!activeDatabase.metadata) {
    try {
      const saved = normalizeContentLanguage((await loadActiveDatabase()).content_language);
      if (saved && sent.value === null) target.value = saved;
    } catch { /* the interface language stays the default */ }
  }
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
    aria-labelledby="translate-dialog-title"
    @click.self="close"
  >
    <div class="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable modal-fullscreen-sm-down">
      <form
        class="modal-content"
        @submit.prevent="translate"
      >
        <div class="modal-header">
          <h2
            id="translate-dialog-title"
            class="modal-title text-break"
          >
            {{ $t('translation.title', { field: field.label }) }}
          </h2>
          <button
            type="button"
            class="btn-close"
            :aria-label="$t('common.close')"
            @click="close"
          />
        </div>
        <div class="modal-body">
          <div class="mb-3">
            <label
              class="form-label"
              for="translate-original"
            >{{ $t('translation.original') }}</label>
            <textarea
              id="translate-original"
              class="form-control"
              :value="current"
              rows="3"
              readonly
            />
          </div>
          <div class="row">
            <div class="col-sm-6 mb-3">
              <label
                class="form-label"
                for="translate-source"
              >{{ $t('translation.source') }}</label>
              <LanguageSelect
                id="translate-source"
                v-model="source"
                :label="$t('translation.source')"
                auto
              />
            </div>
            <div class="col-sm-6 mb-3">
              <label
                class="form-label"
                for="translate-target"
              >{{ $t('translation.target') }}</label>
              <LanguageSelect
                id="translate-target"
                v-model="target"
                :label="$t('translation.target')"
              />
            </div>
          </div>
          <p class="form-text mt-0">
            {{ $t('translation.privacy') }}
          </p>
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
          <div
            v-if="result && stale"
            class="alert alert-warning"
            role="alert"
          >
            {{ $t('translation.conflict') }}
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
          <div
            v-if="result && result.field.translation !== null"
            class="mb-0"
          >
            <label
              class="form-label"
              for="translate-result"
            >{{ $t('translation.result') }}</label>
            <textarea
              id="translate-result"
              v-model="translation"
              class="form-control"
              rows="3"
              aria-describedby="translate-result-help"
            />
            <div
              id="translate-result-help"
              class="form-text"
            >
              <span
                v-if="detected"
                class="d-block"
              >{{ detected }}</span>
              {{ $t('translation.resultHelp') }}
            </div>
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
          <button
            id="translate-submit"
            type="submit"
            class="btn"
            :class="result ? '' : 'btn-primary'"
            :disabled="pending || !current.trim()"
          >
            {{ pending ? $t('translation.translating') : result ? $t('translation.translateAgain') : $t('translation.translate') }}
          </button>
          <button
            v-if="result"
            type="button"
            class="btn btn-primary"
            :disabled="stale || !translation.trim()"
            @click="use"
          >
            {{ $t('translation.use') }}
          </button>
        </div>
      </form>
    </div>
  </div>
  <div class="modal-backdrop show" />
</template>
