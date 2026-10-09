<script setup>
import { nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { api, jsonOptions } from '../api.js';
import FieldAutocomplete from './FieldAutocomplete.vue';

/*
  Starts a temporary loan of `item`, or, given its open `transfer`, marks that loan as returned. The
  date and time default to now in the browser's time zone and travel as an ISO moment, so the server
  never reads a local time as its own. Emits `saved` once the server accepted the change.
*/
const props = defineProps({
  item: { type: Object, required: true },
  transfer: { type: Object, default: null }
});
const emit = defineEmits(['close', 'saved']);

// The value of a datetime-local input for a moment, in the browser's time zone.
const localInput = date => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

// An untouched default is sent as no date, so the server records its own exact now.
const opened = localInput(new Date());
const form = reactive({ recipient: '', moment: opened, expected_return_on: '', note: '' });
const saving = ref(false);
const error = ref('');

async function save() {
  saving.value = true; error.value = '';
  const moment = form.moment && form.moment !== opened ? new Date(form.moment).toISOString() : null;
  try {
    if (props.transfer) {
      await api(`/api/items/${props.item.id}/transfers/${props.transfer.id}/return`, jsonOptions('POST', { returned_at: moment, note: form.note }));
    } else {
      await api(`/api/items/${props.item.id}/transfers`, jsonOptions('POST', {
        recipient: form.recipient, transferred_at: moment, expected_return_on: form.expected_return_on || null, note: form.note
      }));
    }
    emit('saved');
  } catch (e) { error.value = e.message; saving.value = false; }
}

const onKeydown = event => { if (event.key === 'Escape') emit('close'); };
onMounted(() => {
  document.body.classList.add('modal-open');
  document.addEventListener('keydown', onKeydown);
  nextTick(() => document.getElementById(props.transfer ? 'loan-moment' : 'loan-recipient')?.focus());
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
    aria-labelledby="loan-dialog-title"
    @click.self="emit('close')"
  >
    <div class="modal-dialog modal-dialog-centered">
      <form
        class="modal-content"
        @submit.prevent="save"
      >
        <div class="modal-header">
          <h2
            id="loan-dialog-title"
            class="modal-title text-break"
          >
            {{ transfer ? $t('transfer.returnTitle', { name: item.name }) : $t('transfer.title', { name: item.name }) }}
          </h2>
          <button
            type="button"
            class="btn-close"
            :aria-label="$t('common.close')"
            @click="emit('close')"
          />
        </div>
        <div class="modal-body">
          <p class="text-secondary">
            {{ transfer ? $t('transfer.returnIntro', { name: transfer.recipient }) : $t('transfer.intro') }}
          </p>
          <div
            v-if="!transfer"
            class="mb-3"
          >
            <label
              class="form-label required"
              for="loan-recipient"
            >{{ $t('transfer.recipient') }}</label>
            <FieldAutocomplete
              v-model="form.recipient"
              input-id="loan-recipient"
              source="/api/items/transferred-to-suggestions"
              maxlength="255"
              required
              :placeholder="$t('transfer.recipientPlaceholder')"
            />
          </div>
          <div class="row">
            <div
              class="mb-3"
              :class="transfer ? 'col-12' : 'col-sm-6'"
            >
              <label
                class="form-label"
                for="loan-moment"
              >{{ transfer ? $t('transfer.returnedAt') : $t('transfer.transferredAt') }}</label>
              <input
                id="loan-moment"
                v-model="form.moment"
                class="form-control"
                type="datetime-local"
                required
              >
            </div>
            <div
              v-if="!transfer"
              class="col-sm-6 mb-3"
            >
              <label
                class="form-label"
                for="loan-expected-return"
              >{{ $t('transfer.expectedReturn') }}</label>
              <input
                id="loan-expected-return"
                v-model="form.expected_return_on"
                class="form-control"
                type="date"
              >
            </div>
          </div>
          <div>
            <label
              class="form-label"
              for="loan-note"
            >{{ $t('transfer.note') }}</label>
            <textarea
              id="loan-note"
              v-model="form.note"
              class="form-control"
              rows="2"
              maxlength="1000"
            />
          </div>
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
            type="submit"
            class="btn btn-primary"
            :disabled="saving"
          >
            {{ saving ? $t('transfer.saving') : (transfer ? $t('transfer.markReturned') : $t('transfer.submit')) }}
          </button>
        </div>
      </form>
    </div>
  </div>
  <div class="modal-backdrop show" />
</template>
