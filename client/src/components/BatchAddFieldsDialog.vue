<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { api, jsonOptions } from '../api.js';
import {
  FIELD_TYPES, MAX_BATCH_FIELDS, STATUS_LABELS, blockingRows, creatableFields,
  fieldDefinitionDocument, fieldTypeLabel, parseFieldDefinitionDocument, reviewFieldDefinitions
} from '../../../shared/fieldDefinitions.js';

const props = defineProps({
  category: { type: Object, required: true },
  existingFields: { type: Array, required: true }
});
const emit = defineEmits(['close', 'created']);

const example = JSON.stringify(fieldDefinitionDocument([
  { name: 'Brand', type: 'text', required: false },
  { name: 'Model', type: 'text', required: false },
  { name: 'Release Year', type: 'number', required: false }
]), null, 2);

const source = ref('');
const drafts = ref(null);
const error = ref('');
const saving = ref(false);
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
    error.value = parseError.message;
  }
}
function backToJson() {
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
            Batch Add Fields <span class="text-secondary">for {{ category.name }}</span>
          </h2>
          <button
            type="button"
            class="btn-close"
            aria-label="Close batch add fields"
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
            <p class="text-secondary">
              Paste a field-definition document, then review every field before it is created.
              A batch accepts at most {{ MAX_BATCH_FIELDS }} fields.
            </p>
            <textarea
              ref="editor"
              v-model="source"
              class="form-control font-monospace"
              rows="12"
              aria-label="Field definition JSON"
              spellcheck="false"
              :placeholder="example"
            />
          </template>
          <div
            v-else
            class="table-responsive"
          >
            <table class="table table-vcenter">
              <thead>
                <tr>
                  <th>Field</th>
                  <th>Type</th>
                  <th>Status</th>
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
                      :aria-label="`Name of proposed field ${index + 1}`"
                    >
                  </td>
                  <td>
                    <select
                      v-model="draft.type"
                      class="form-select"
                      :aria-label="`Type of proposed field ${index + 1}`"
                    >
                      <option
                        v-if="!FIELD_TYPES.some(type => type.value === draft.type)"
                        :value="draft.type"
                      >
                        {{ fieldTypeLabel(draft.type) || 'Unsupported' }}
                      </option>
                      <option
                        v-for="type in FIELD_TYPES"
                        :key="type.value"
                        :value="type.value"
                      >
                        {{ type.label }}
                      </option>
                    </select>
                  </td>
                  <td>
                    <span
                      class="badge"
                      :class="rows[index].status === 'new' ? 'bg-green-lt' : 'bg-red-lt'"
                    >{{ STATUS_LABELS[rows[index].status] }}</span>
                    <small
                      v-if="rows[index].message"
                      class="d-block text-danger"
                    >{{ rows[index].message }}</small>
                  </td>
                  <td>
                    <button
                      type="button"
                      class="btn btn-outline-danger btn-sm"
                      :aria-label="`Remove proposed field ${index + 1} from the batch`"
                      @click="removeDraft(index)"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
                <tr v-if="!drafts.length">
                  <td
                    colspan="4"
                    class="text-secondary"
                  >
                    No fields left in this batch.
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
            Cancel
          </button>
          <button
            v-if="!drafts"
            type="button"
            class="btn btn-primary"
            :disabled="!source.trim()"
            @click="preview"
          >
            Preview
          </button>
          <template v-else>
            <button
              type="button"
              class="btn"
              @click="backToJson"
            >
              Edit JSON
            </button>
            <button
              type="button"
              class="btn btn-primary"
              :disabled="saving || !creatable.length || blocked.length > 0"
              @click="create"
            >
              Create {{ creatable.length }} {{ creatable.length === 1 ? 'Field' : 'Fields' }}
            </button>
          </template>
        </div>
      </div>
    </div>
  </div>
  <div class="modal-backdrop show" />
</template>
