<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { api, jsonOptions } from '../api.js';

const emit = defineEmits(['close', 'reset']);
const { t } = useI18n();

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

const impact = computed(() => {
  const counts = prepared.value?.counts;
  if (!counts) return [];
  return [
    t('counts.items', counts.items),
    t('counts.categories', counts.categories),
    t('counts.fields', counts.fields),
    t('counts.fieldValues', counts.fieldValues),
    t('counts.photos', counts.photos)
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
            {{ $t('reset.title') }}
          </h2>
          <button
            ref="closeButton"
            type="button"
            class="btn-close"
            :aria-label="$t('reset.close')"
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
            {{ $t('reset.counting') }}
          </p>

          <template v-if="prepared">
            <p class="mb-2">
              {{ $t('reset.impact') }}
            </p>
            <ul
              class="mb-3"
              :aria-label="$t('reset.impactLabel')"
            >
              <li
                v-for="line in impact"
                :key="line"
              >
                <strong>{{ line }}</strong>
              </li>
            </ul>
            <i18n-t
              keypath="reset.safetyText"
              tag="p"
              class="meta-text"
              scope="global"
            >
              <template #dir>
                <code>pre-reset-backups</code>
              </template>
            </i18n-t>

            <label class="form-check mb-3">
              <input
                v-model="acknowledged"
                class="form-check-input"
                type="checkbox"
                :disabled="resetting"
              >
              <span class="form-check-label">{{ $t('reset.acknowledge') }}</span>
            </label>

            <div class="mb-1">
              <label
                class="form-label"
                for="reset-confirmation"
              ><i18n-t
                keypath="common.typeToConfirm"
                scope="global"
              ><template #phrase><code>{{ CONFIRMATION }}</code></template></i18n-t></label>
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
              {{ $t('reset.expires', Math.round(prepared.expiresInSeconds / 60)) }}
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
            {{ $t('common.cancel') }}
          </button>
          <button
            v-if="!prepared && !loading"
            type="button"
            class="btn btn-outline-danger"
            @click="prepare"
          >
            {{ $t('common.tryAgain') }}
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
            {{ resetting ? $t('reset.resetting') : $t('reset.reset') }}
          </button>
        </div>
      </div>
    </div>
  </div>
  <div class="modal-backdrop show" />
</template>
