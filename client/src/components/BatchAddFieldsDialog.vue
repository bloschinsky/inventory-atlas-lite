<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { api, jsonOptions } from '../api.js';
import { translateError } from '../i18n/index.js';
import {
  FIELD_TYPES, MAX_BATCH_FIELDS, blockingRows, creatableFields,
  fieldDefinitionDocument, parseFieldDefinitionDocument, readFieldDefinitionDocument,
  reviewFieldDefinitions
} from '../../../shared/fieldDefinitions.js';

const props = defineProps({
  category: { type: Object, required: true },
  existingFields: { type: Array, required: true },
  // 'json' pastes a document, 'ai' asks the configured AI provider for one; both end in the same review below.
  mode: { type: String, default: 'json' }
});
const emit = defineEmits(['close', 'created']);
const { t } = useI18n();

const example = JSON.stringify(fieldDefinitionDocument([
  { name: 'Brand', type: 'text', required: false },
  { name: 'Model', type: 'text', required: false },
  { name: 'Release Year', type: 'number', required: false }
]), null, 2);

const ai = computed(() => props.mode === 'ai');
const title = computed(() => t(ai.value ? 'batchFields.aiTitle' : 'batchFields.title'));

const source = ref('');
const description = ref('');
const drafts = ref(null);
const error = ref('');
const saving = ref(false);
const generating = ref(false);
const editor = ref(null);

// Recalculated on every edit or removal, so the statuses always describe the current batch.
const rows = computed(() => drafts.value ? reviewFieldDefinitions(drafts.value, props.existingFields.map(field => field.name)) : []);
const blocked = computed(() => blockingRows(rows.value));
const creatable = computed(() => creatableFields(rows.value));

function preview() {
  error.value = '';
  try {
    drafts.value = parseFieldDefinitionDocument(source.value);
  } catch (parseError) {
    drafts.value = null;
    error.value = translateError(parseError);
  }
}
// The AI answer is untrusted input: it is read with the same reader the pasted document uses.
async function generate() {
  generating.value = true;
  error.value = '';
  try {
    const document = await api(`/api/categories/${props.category.id}/fields/ai`, jsonOptions('POST', { description: description.value.trim() }));
    drafts.value = readFieldDefinitionDocument(document);
  } catch (generateError) {
    drafts.value = null;
    // An API refusal is already translated; a document the shared reader rejects is translated here.
    error.value = generateError.name === 'ApiError' ? generateError.message : translateError(generateError);
  } finally {
    generating.value = false;
  }
}
// The placeholder example is also the inserted template, so both can never drift apart.
function insertTemplate() {
  const current = source.value.trim();
  if (current && current !== example.trim() && !confirm(t('batchFields.confirmReplace'))) return;
  source.value = example;
  nextTick(() => editor.value?.focus());
}
// The original prompt or document stays available, so a failed attempt can be retried or corrected.
function backToInput() {
  drafts.value = null;
  error.value = '';
  nextTick(() => editor.value?.focus());
}
// Removing a proposed field only changes this draft; the category fields stay untouched.
const removeDraft = index => drafts.value.splice(index, 1);

async function create() {
  saving.value = true;
  error.value = '';
  try {
    const created = await api(`/api/categories/${props.category.id}/fields/batch`, jsonOptions('POST', fieldDefinitionDocument(creatable.value)));
    emit('created', created);
  } catch (requestError) {
    error.value = requestError.message;
  } finally {
    saving.value = false;
  }
}

const onKeydown = event => { if (event.key === 'Escape') emit('close'); };
onMounted(() => {
  document.body.classList.add('modal-open');
  document.addEventListener('keydown', onKeydown);
  nextTick(() => editor.value?.focus());
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
    aria-labelledby="batch-fields-title"
    @click.self="emit('close')"
  >
    <div class="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
      <div class="modal-content">
        <div class="modal-header">
          <h2
            id="batch-fields-title"
            class="modal-title"
          >
            {{ title }} <span class="text-secondary">{{ $t('batchFields.forCategory', { name: category.name }) }}</span>
          </h2>
          <button
            type="button"
            class="btn-close"
            :aria-label="$t(ai ? 'batchFields.closeAi' : 'batchFields.close')"
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
          <template v-if="!drafts && ai">
            <p class="text-secondary">
              {{ $t('batchFields.aiIntro', { max: MAX_BATCH_FIELDS }) }}
            </p>
            <textarea
              ref="editor"
              v-model="description"
              class="form-control"
              rows="6"
              :aria-label="$t('batchFields.description')"
              :disabled="generating"
              :placeholder="$t('batchFields.descriptionPlaceholder')"
            />
            <p
              v-if="generating"
              class="text-secondary mt-2 mb-0"
            >
              {{ $t('batchFields.generatingFields') }}
            </p>
          </template>
          <template v-else-if="!drafts">
            <p class="text-secondary">
              {{ $t('batchFields.intro', { max: MAX_BATCH_FIELDS }) }}
            </p>
            <textarea
              ref="editor"
              v-model="source"
              class="form-control font-monospace"
              rows="12"
              :aria-label="$t('batchFields.json')"
              spellcheck="false"
              :placeholder="example"
            />
            <div class="mt-2">
              <button
                type="button"
                class="btn btn-link link-secondary p-0"
                @click="insertTemplate"
              >
                {{ $t('common.insertTemplate') }}
              </button>
            </div>
          </template>
          <div
            v-else
            class="table-responsive"
          >
            <table class="table table-vcenter">
              <thead>
                <tr>
                  <th>{{ $t('batchFields.field') }}</th>
                  <th>{{ $t('batchFields.type') }}</th>
                  <th>{{ $t('batchFields.status') }}</th>
                  <th class="w-1" />
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="(draft, index) in drafts"
                  :key="index"
                  :class="{ 'bg-red-lt': rows[index].status !== 'new' }"
                >
                  <td>
                    <input
                      v-model="draft.name"
                      class="form-control"
                      :aria-label="$t('batchFields.nameOf', { n: index + 1 })"
                    >
                  </td>
                  <td>
                    <select
                      v-model="draft.type"
                      class="form-select"
                      :aria-label="$t('batchFields.typeOf', { n: index + 1 })"
                    >
                      <option
                        v-if="!FIELD_TYPES.some(type => type.value === draft.type)"
                        :value="draft.type"
                      >
                        {{ draft.type || $t('batchFields.unsupported') }}
                      </option>
                      <option
                        v-for="type in FIELD_TYPES"
                        :key="type.value"
                        :value="type.value"
                      >
                        {{ $t(`fieldTypes.${type.value}`) }}
                      </option>
                    </select>
                  </td>
                  <td>
                    <span
                      class="badge"
                      :class="rows[index].status === 'new' ? 'bg-green-lt' : 'bg-red-lt'"
                    >{{ $t(`batchFields.statuses.${rows[index].status}`) }}</span>
                    <small
                      v-if="rows[index].error"
                      class="d-block text-danger"
                    >{{ translateError(rows[index].error) }}</small>
                  </td>
                  <td>
                    <button
                      type="button"
                      class="btn btn-outline-danger btn-sm"
                      :aria-label="$t('batchFields.removeOf', { n: index + 1 })"
                      @click="removeDraft(index)"
                    >
                      {{ $t('common.remove') }}
                    </button>
                  </td>
                </tr>
                <tr v-if="!drafts.length">
                  <td
                    colspan="4"
                    class="text-secondary"
                  >
                    {{ $t('batchFields.empty') }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
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
            v-if="!drafts && ai"
            type="button"
            class="btn btn-primary"
            :disabled="generating || !description.trim()"
            @click="generate"
          >
            {{ generating ? $t('batchFields.generating') : $t('batchFields.generate') }}
          </button>
          <button
            v-else-if="!drafts"
            type="button"
            class="btn btn-primary"
            :disabled="!source.trim()"
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
              {{ ai ? $t('batchFields.editDescription') : $t('common.editJson') }}
            </button>
            <button
              type="button"
              class="btn btn-primary"
              :disabled="saving || !creatable.length || blocked.length > 0"
              @click="create"
            >
              {{ $t('batchFields.create', creatable.length) }}
            </button>
          </template>
        </div>
      </div>
    </div>
  </div>
  <div class="modal-backdrop show" />
</template>
