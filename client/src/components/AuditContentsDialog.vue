<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api, jsonOptions } from '../api.js';

// Audit contents of one container: the scope choice and the start of its verification run.
const props = defineProps({ item: { type: Object, required: true } });
const emit = defineEmits(['close']);

const router = useRouter();
const closeButton = ref(null);
const scope = ref('direct');
const starting = ref(false);
const error = ref('');

const counts = computed(() => ({ direct: props.item.children.length, nested: props.item.descendant_count }));
// Without anything below the direct children both scopes would check the same items.
const hasNested = computed(() => counts.value.nested > counts.value.direct);

// The server copies the contents as they are now; the run page takes over from there.
async function start() {
  starting.value = true; error.value = '';
  try {
    const run = await api(`/api/items/${props.item.id}/audits`, jsonOptions('POST', { scope: scope.value }));
    router.push(`/checklists/runs/${run.id}`);
  } catch (e) { error.value = e.message; starting.value = false; }
}

const onKeydown = event => { if (event.key === 'Escape') emit('close'); };
onMounted(() => {
  document.body.classList.add('modal-open');
  document.addEventListener('keydown', onKeydown);
  nextTick(() => closeButton.value?.focus());
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
    aria-labelledby="audit-contents-title"
    @click.self="emit('close')"
  >
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-header">
          <h2
            id="audit-contents-title"
            class="modal-title text-break"
          >
            {{ $t('checklists.audit.dialogTitle', { name: item.name }) }}
          </h2>
          <button
            ref="closeButton"
            type="button"
            class="btn-close"
            :aria-label="$t('common.close')"
            @click="emit('close')"
          />
        </div>
        <div class="modal-body">
          <p class="text-secondary">
            {{ $t('checklists.audit.intro') }}
          </p>
          <fieldset v-if="hasNested">
            <legend class="form-label">
              {{ $t('checklists.audit.scope') }}
            </legend>
            <label
              v-for="option in ['direct', 'nested']"
              :key="option"
              class="form-check"
            >
              <input
                v-model="scope"
                class="form-check-input"
                type="radio"
                name="audit-scope"
                :value="option"
              >
              <span class="form-check-label">{{ $t(`checklists.audit.scopes.${option}`) }}</span>
              <span class="form-check-description">{{ $t('counts.items', counts[option]) }}</span>
            </label>
          </fieldset>
          <p class="fw-semibold mb-0">
            {{ $t('checklists.audit.expected', counts[scope]) }}
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
            @click="emit('close')"
          >
            {{ $t('common.cancel') }}
          </button>
          <button
            type="button"
            class="btn btn-primary"
            :disabled="starting"
            @click="start"
          >
            {{ starting ? $t('checklists.audit.starting') : $t('checklists.audit.start') }}
          </button>
        </div>
      </div>
    </div>
  </div>
  <div class="modal-backdrop show" />
</template>
