<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { api, jsonOptions } from '../api.js';

/*
  Restore to inventory: the retired item, with everything stored in it, becomes active again. It is
  never put back into its former container on its own: the user chooses to keep it on its own at a
  saved location (prefilled with the location it already has) or to put it inside an active container.
*/
const props = defineProps({ item: { type: Object, required: true } });
const emit = defineEmits(['close', 'restored']);

const placement = ref('own');
const location = ref(props.item.location ?? '');
const search = ref('');
const candidates = ref([]);
const destination = ref(null);
const saving = ref(false);
const error = ref('');
const placementChoice = ref(null);
let timer;
let request = 0;

const retirement = computed(() => props.item.retirement);
// What else comes back with the item: the retired contents keep their nesting inside it.
const contentCount = computed(() => props.item.descendant_count);

async function loadCandidates() {
  const current = ++request;
  try {
    const result = await api(`/api/items/parent-candidates?${new URLSearchParams({ search: search.value })}`);
    if (current === request) candidates.value = result;
  } catch (e) { if (current === request) error.value = e.message; }
}
watch(search, () => { clearTimeout(timer); timer = setTimeout(loadCandidates, 250); });
watch(placement, value => { if (value === 'container' && !candidates.value.length) loadCandidates(); });

async function submit() {
  saving.value = true; error.value = '';
  const body = placement.value === 'container'
    ? { status: 'active', parent_item_id: destination.value.id }
    : { status: 'active', parent_item_id: null, location: location.value };
  try {
    emit('restored', await api(`/api/items/${props.item.id}/lifecycle`, jsonOptions('PATCH', body)));
  } catch (e) { error.value = e.message; } finally { saving.value = false; }
}

const onKeydown = event => { if (event.key === 'Escape' && !saving.value) emit('close'); };
onMounted(() => {
  document.body.classList.add('modal-open');
  document.addEventListener('keydown', onKeydown);
  nextTick(() => placementChoice.value?.querySelector('input')?.focus());
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
    aria-labelledby="restore-item-title"
    @click.self="saving || emit('close')"
  >
    <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable">
      <form
        class="modal-content"
        @submit.prevent="submit"
      >
        <div class="modal-header">
          <h2
            id="restore-item-title"
            class="modal-title text-break"
          >
            {{ $t('lifecycle.restore.title', { name: item.name }) }}
          </h2>
          <button
            type="button"
            class="btn-close"
            :aria-label="$t('common.close')"
            :disabled="saving"
            @click="emit('close')"
          />
        </div>
        <div class="modal-body">
          <p class="text-secondary">
            {{ $t('lifecycle.restore.intro') }}
          </p>
          <p
            v-if="contentCount"
            class="fw-semibold"
          >
            {{ $t('lifecycle.restore.contents', contentCount) }}
          </p>
          <p
            v-if="retirement?.last_location || retirement?.former_parent"
            class="meta-text text-break"
          >
            {{ $t('lifecycle.restore.before', {
              location: retirement.last_location || $t('lifecycle.noLocation'),
              container: retirement.former_parent?.name || $t('lifecycle.noContainer')
            }) }}
          </p>
          <fieldset
            ref="placementChoice"
            class="mb-3"
          >
            <legend class="form-label">
              {{ $t('lifecycle.restore.placement') }}
            </legend>
            <label
              v-for="option in ['own', 'container']"
              :key="option"
              class="form-check"
            >
              <input
                v-model="placement"
                class="form-check-input"
                type="radio"
                name="restore-placement"
                :value="option"
              >
              <span class="form-check-label">{{ $t(`lifecycle.restore.placements.${option}`) }}</span>
            </label>
          </fieldset>
          <div v-if="placement === 'own'">
            <label
              class="form-label"
              for="restore-location"
            >{{ $t('items.fields.location') }}</label>
            <input
              id="restore-location"
              v-model="location"
              type="text"
              class="form-control"
            >
            <small class="form-hint">{{ $t('lifecycle.restore.locationHelp') }}</small>
          </div>
          <template v-else>
            <label
              class="form-label"
              for="restore-search"
            >{{ $t('items.fields.storedInside') }}</label>
            <input
              id="restore-search"
              v-model="search"
              type="search"
              class="form-control mb-2"
              :placeholder="$t('items.bulkMove.searchPlaceholder')"
              @keydown.enter.prevent
            >
            <p
              v-if="!candidates.length"
              class="text-secondary mb-0"
            >
              {{ $t('lifecycle.restore.noCandidates') }}
            </p>
            <div
              v-else
              class="list-group"
              role="radiogroup"
              :aria-label="$t('items.fields.storedInside')"
            >
              <label
                v-for="candidate in candidates"
                :key="candidate.id"
                class="list-group-item list-group-item-action d-flex align-items-center gap-2"
                :class="{ active: destination?.id === candidate.id }"
              >
                <input
                  type="radio"
                  name="restore-destination"
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
          </template>
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
            :disabled="saving"
            @click="emit('close')"
          >
            {{ $t('common.cancel') }}
          </button>
          <button
            type="submit"
            class="btn btn-primary"
            :disabled="saving || (placement === 'container' && !destination)"
          >
            {{ saving ? $t('lifecycle.restore.saving') : $t('lifecycle.restore.action') }}
          </button>
        </div>
      </form>
    </div>
  </div>
  <div class="modal-backdrop show" />
</template>
