<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { api, jsonOptions } from '../api.js';

/*
  Chooses one destination for the selected items and moves them there. The server reduces the
  selection to its roots and offers only destinations that cannot create a cycle; the move itself
  checks everything again. A failure keeps the dialog, the choice, and the selection as they were.
*/
const props = defineProps({
  uuids: { type: Array, required: true }
});
const emit = defineEmits(['close', 'moved']);

const summary = ref(null);
const candidates = ref([]);
const search = ref('');
const destination = ref(null);
const loading = ref(true);
const moving = ref(false);
const error = ref('');
const searchInput = ref(null);
let timer;
let request = 0;

async function loadCandidates() {
  const current = ++request;
  loading.value = true;
  try {
    const result = await api('/api/items/bulk-parent/preview', jsonOptions('POST', { item_ids: props.uuids, search: search.value }));
    // A slower answer to an earlier search never replaces the newer one.
    if (current !== request) return;
    summary.value = result;
    candidates.value = result.candidates;
  } catch (e) {
    if (current === request) error.value = e.message;
  } finally {
    if (current === request) loading.value = false;
  }
}
// Only a new search clears the message; a search answer arriving late never hides a failed move.
watch(search, () => {
  error.value = '';
  clearTimeout(timer);
  timer = setTimeout(loadCandidates, 250);
});

async function move() {
  moving.value = true; error.value = '';
  try {
    emit('moved', await api('/api/items/bulk-parent', jsonOptions('PATCH', { item_ids: props.uuids, parent_item_id: destination.value.id })));
  } catch (e) { error.value = e.message; } finally { moving.value = false; }
}

const onKeydown = event => { if (event.key === 'Escape' && !moving.value) emit('close'); };
onMounted(() => {
  document.body.classList.add('modal-open');
  document.addEventListener('keydown', onKeydown);
  nextTick(() => searchInput.value?.focus());
  loadCandidates();
});
onBeforeUnmount(() => {
  clearTimeout(timer);
  document.body.classList.remove('modal-open');
  document.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <div
    class="modal modal-blur d-block"
    role="dialog"
    aria-modal="true"
    aria-labelledby="bulk-move-title"
    @click.self="moving || emit('close')"
  >
    <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable">
      <form
        class="modal-content"
        @submit.prevent="move"
      >
        <div class="modal-header">
          <h2
            id="bulk-move-title"
            class="modal-title"
          >
            {{ $t('items.bulkMove.title') }}
          </h2>
          <button
            type="button"
            class="btn-close"
            :aria-label="$t('common.close')"
            :disabled="moving"
            @click="emit('close')"
          />
        </div>
        <div class="modal-body">
          <!-- The preserved structure is stated in words whenever the selection nests. -->
          <div
            v-if="summary"
            class="mb-3"
            aria-live="polite"
          >
            <p class="mb-1 fw-semibold">
              {{ $t('items.bulkMove.selectedCount', summary.selected_count) }}
            </p>
            <template v-if="summary.root_count !== summary.selected_count">
              <p class="mb-1">
                {{ $t('items.bulkMove.rootsSummary', summary.root_count) }}
              </p>
              <p class="meta-text mb-0">
                {{ $t('items.bulkMove.nestedStay') }}
              </p>
            </template>
          </div>
          <label
            class="form-label"
            for="bulk-move-search"
          >{{ $t('items.bulkMove.destination') }}</label>
          <input
            id="bulk-move-search"
            ref="searchInput"
            v-model="search"
            type="search"
            class="form-control mb-2"
            :placeholder="$t('items.bulkMove.searchPlaceholder')"
            @keydown.enter.prevent
          >
          <div
            v-if="loading && !summary"
            class="d-flex align-items-center gap-2 text-secondary"
          >
            <span
              class="spinner-border spinner-border-sm"
              aria-hidden="true"
            />
            {{ $t('items.bulkMove.loading') }}
          </div>
          <p
            v-else-if="summary && !candidates.length"
            class="text-secondary mb-0"
          >
            {{ $t('items.bulkMove.noCandidates') }}
          </p>
          <div
            v-else
            class="list-group"
            role="radiogroup"
            :aria-label="$t('items.bulkMove.destination')"
          >
            <label
              v-for="candidate in candidates"
              :key="candidate.id"
              class="list-group-item list-group-item-action d-flex align-items-center gap-2"
              :class="{ active: destination?.id === candidate.id }"
            >
              <!-- Compared by id: a new search returns new objects, and the choice survives it. -->
              <input
                type="radio"
                name="bulk-move-destination"
                class="form-check-input m-0 flex-shrink-0"
                :checked="destination?.id === candidate.id"
                @change="destination = candidate"
              >
              <span class="min-w-0 flex-grow-1">
                <span class="d-block text-break">{{ candidate.name }}</span>
                <small class="text-secondary text-break">
                  {{ candidate.category_name }}<template v-if="candidate.parent_name"> · {{ $t('items.bulkMove.candidateIn', { name: candidate.parent_name }) }}</template>
                </small>
              </span>
            </label>
          </div>
          <p
            v-if="destination"
            class="mt-3 mb-0 fw-semibold text-break"
          >
            {{ $t('items.bulkMove.confirm', { name: destination.name }) }}
          </p>
          <div
            v-if="error"
            class="alert alert-danger mt-3 mb-0"
            role="alert"
          >
            {{ error }}
          </div>
        </div>
        <div class="modal-footer">
          <button
            type="button"
            class="btn"
            :disabled="moving"
            @click="emit('close')"
          >
            {{ $t('common.cancel') }}
          </button>
          <button
            type="submit"
            class="btn btn-primary"
            :disabled="!destination || moving"
          >
            {{ moving ? $t('items.bulkMove.moving') : $t('items.bulkMove.move') }}
          </button>
        </div>
      </form>
    </div>
  </div>
  <div class="modal-backdrop show" />
</template>
