<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { api, jsonOptions } from '../api.js';

const emit = defineEmits(['close', 'reset']);

const CONFIRMATION = 'RESET INVENTORY';

const prepared = ref(null);
const acknowledged = ref(false);
const confirmation = ref('');
const loading = ref(false);
const resetting = ref(false);
const error = ref('');
const closeButton = ref(null);

// The phrase is compared exactly, as the server does: no trimming and no case folding.
const canReset = computed(() => Boolean(prepared.value) && acknowledged.value && confirmation.value === CONFIRMATION && !resetting.value);
const busy = computed(() => loading.value || resetting.value);

const plural = (count, singular, pluralForm = `${singular}s`) => `${count} ${count === 1 ? singular : pluralForm}`;
const impact = computed(() => {
  const counts = prepared.value?.counts;
  if (!counts) return [];
  return [
    plural(counts.items, 'item'),
    plural(counts.categories, 'category', 'categories'),
    plural(counts.fields, 'custom field'),
    plural(counts.fieldValues, 'custom field value'),
    plural(counts.photos, 'photo')
  ];
});

// Every opening asks the server for fresh counts and a new single-use token, so the dialog never
// acts on stale state. A failed reset consumes its token, so trying again starts here too.
async function prepare() {
  loading.value = true;
  prepared.value = null;
  acknowledged.value = false;
  confirmation.value = '';
  error.value = '';
  try {
    prepared.value = await api('/api/database/reset/prepare', jsonOptions('POST', {}));
  } catch (caught) {
    error.value = caught.message;
  } finally {
    loading.value = false;
  }
}

async function reset() {
  if (!canReset.value) return;
  resetting.value = true;
  error.value = '';
  try {
    const result = await api('/api/database/reset/apply', jsonOptions('POST', {
      resetToken: prepared.value.resetToken,
      confirmation: confirmation.value
    }));
    emit('reset', result);
  } catch (caught) {
    error.value = caught.message;
    prepared.value = null;
  } finally {
    resetting.value = false;
  }
}

const close = () => { if (!resetting.value) emit('close'); };
const onKeydown = event => { if (event.key === 'Escape') close(); };
onMounted(() => {
  document.body.classList.add('modal-open');
  document.addEventListener('keydown', onKeydown);
  nextTick(() => closeButton.value?.focus());
  prepare();
});
onBeforeUnmount(() => {
  document.body.classList.remove('modal-open');
  document.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <!-- Bootstrap's modal markup driven by Vue state, like the other dialogs: no Bootstrap JavaScript. -->
  <div
    class="modal modal-blur d-block"
    role="dialog"
    aria-modal="true"
    aria-labelledby="reset-database-title"
    @click.self="close"
  >
    <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable">
      <div class="modal-content">
        <div class="modal-status bg-danger" />
        <div class="modal-header">
          <h2
            id="reset-database-title"
            class="modal-title"
          >
            Reset Inventory Database
          </h2>
          <button
            ref="closeButton"
            type="button"
            class="btn-close"
            aria-label="Close reset dialog"
            :disabled="resetting"
            @click="close"
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

          <p
            v-if="loading"
            class="meta-text mb-0"
          >
            <span
              class="spinner-border spinner-border-sm me-1"
              aria-hidden="true"
            />
            Counting the current inventory…
          </p>

          <template v-if="prepared">
            <p class="mb-2">
              This permanently removes the whole current inventory:
            </p>
            <ul
              class="mb-3"
              aria-label="Data that will be removed"
            >
              <li
                v-for="line in impact"
                :key="line"
              >
                <strong>{{ line }}</strong>
              </li>
            </ul>
            <p class="meta-text">
              Application settings, including the AI settings and API key, are preserved. A safety backup of
              the current database is written to <code>pre-reset-backups</code> on the server before anything
              is removed, and the reset stops if that backup cannot be created and verified.
            </p>

            <label class="form-check mb-3">
              <input
                v-model="acknowledged"
                class="form-check-input"
                type="checkbox"
                :disabled="resetting"
              >
              <span class="form-check-label">I understand that all inventory data will be permanently removed.</span>
            </label>

            <div class="mb-1">
              <label
                class="form-label"
                for="reset-confirmation"
              >Type <code>{{ CONFIRMATION }}</code> to confirm</label>
              <input
                id="reset-confirmation"
                v-model="confirmation"
                class="form-control"
                type="text"
                autocomplete="off"
                spellcheck="false"
                :disabled="resetting"
              >
            </div>
            <p class="form-text mb-0">
              This confirmation is valid for {{ Math.round(prepared.expiresInSeconds / 60) }} minutes.
            </p>
          </template>
        </div>
        <div class="modal-footer">
          <button
            type="button"
            class="btn"
            :disabled="resetting"
            @click="close"
          >
            Cancel
          </button>
          <button
            v-if="!prepared && !loading"
            type="button"
            class="btn btn-outline-danger"
            @click="prepare"
          >
            Try again
          </button>
          <button
            v-else
            type="button"
            class="btn btn-danger"
            :disabled="!canReset || busy"
            @click="reset"
          >
            <span
              v-if="resetting"
              class="spinner-border spinner-border-sm me-1"
              aria-hidden="true"
            />
            {{ resetting ? 'Resetting…' : 'Reset Database' }}
          </button>
        </div>
      </div>
    </div>
  </div>
  <div class="modal-backdrop show" />
</template>
