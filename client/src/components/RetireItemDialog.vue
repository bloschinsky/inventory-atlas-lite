<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { api, jsonOptions } from '../api.js';
import { MAX_RETIREMENT_NOTE, MAX_RETIREMENT_RECIPIENT, RETIREMENT_REASONS } from '../../../shared/itemLifecycle.js';

/*
  Retire item: the reason (required), when it happened (now by default), and an optional recipient or
  context and note. A container with contents first asks how to handle them: retire everything it
  holds as well, or move the contents out first, which closes the dialog without retiring anything.
*/
const props = defineProps({ item: { type: Object, required: true } });
const emit = defineEmits(['close', 'retired', 'move-contents']);

// The value of a datetime-local input in the browser's own time zone.
const localDateTime = date => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
const now = localDateTime(new Date());

const reason = ref('');
const retiredAt = ref(now);
const recipient = ref('');
const note = ref('');
const contents = ref('retire');
const saving = ref(false);
const error = ref('');
const reasonSelect = ref(null);
const contentCount = computed(() => props.item.descendant_count);
const moving = computed(() => contentCount.value > 0 && contents.value === 'move');

async function submit() {
  if (moving.value) {
    emit('move-contents');
    return;
  }
  saving.value = true; error.value = '';
  try {
    emit('retired', await api(`/api/items/${props.item.id}/lifecycle`, jsonOptions('PATCH', {
      status: 'retired',
      reason: reason.value,
      retired_at: retiredAt.value ? new Date(retiredAt.value).toISOString() : null,
      recipient: recipient.value,
      note: note.value,
      include_contents: contentCount.value > 0
    })));
  } catch (e) { error.value = e.message; } finally { saving.value = false; }
}

const onKeydown = event => { if (event.key === 'Escape' && !saving.value) emit('close'); };
onMounted(() => {
  document.body.classList.add('modal-open');
  document.addEventListener('keydown', onKeydown);
  nextTick(() => reasonSelect.value?.focus());
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
    aria-labelledby="retire-item-title"
    @click.self="saving || emit('close')"
  >
    <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable">
      <form
        class="modal-content"
        @submit.prevent="submit"
      >
        <div class="modal-header">
          <h2
            id="retire-item-title"
            class="modal-title text-break"
          >
            {{ $t('lifecycle.retire.title', { name: item.name }) }}
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
            {{ $t('lifecycle.retire.intro') }}
          </p>
          <fieldset
            v-if="contentCount"
            class="mb-3"
          >
            <legend class="form-label">
              {{ $t('lifecycle.retire.contents', contentCount) }}
            </legend>
            <label
              v-for="option in ['retire', 'move']"
              :key="option"
              class="form-check"
            >
              <input
                v-model="contents"
                class="form-check-input"
                type="radio"
                name="retire-contents"
                :value="option"
              >
              <span class="form-check-label">{{ $t(`lifecycle.retire.contentOptions.${option}`, contentCount) }}</span>
              <span class="form-check-description">{{ $t(`lifecycle.retire.contentHelp.${option}`) }}</span>
            </label>
          </fieldset>
          <template v-if="!moving">
            <div class="mb-3">
              <label
                class="form-label required"
                for="retire-reason"
              >{{ $t('lifecycle.fields.reason') }}</label>
              <select
                id="retire-reason"
                ref="reasonSelect"
                v-model="reason"
                class="form-select"
                required
              >
                <option
                  value=""
                  disabled
                >
                  {{ $t('lifecycle.retire.chooseReason') }}
                </option>
                <option
                  v-for="key in RETIREMENT_REASONS"
                  :key="key"
                  :value="key"
                >
                  {{ $t(`lifecycle.reasons.${key}`) }}
                </option>
              </select>
            </div>
            <div class="mb-3">
              <label
                class="form-label"
                for="retire-date"
              >{{ $t('lifecycle.fields.retiredAt') }}</label>
              <input
                id="retire-date"
                v-model="retiredAt"
                type="datetime-local"
                class="form-control"
                :max="now"
              >
            </div>
            <div class="mb-3">
              <label
                class="form-label"
                for="retire-recipient"
              >{{ $t('lifecycle.fields.recipient') }}</label>
              <input
                id="retire-recipient"
                v-model="recipient"
                type="text"
                class="form-control"
                :maxlength="MAX_RETIREMENT_RECIPIENT"
                :placeholder="$t('lifecycle.retire.recipientPlaceholder')"
              >
            </div>
            <div class="mb-0">
              <label
                class="form-label"
                for="retire-note"
              >{{ $t('lifecycle.fields.note') }}</label>
              <textarea
                id="retire-note"
                v-model="note"
                class="form-control"
                rows="3"
                :maxlength="MAX_RETIREMENT_NOTE"
              />
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
            :disabled="saving"
          >
            {{ moving ? $t('lifecycle.retire.moveFirst') : saving ? $t('lifecycle.retire.saving') : $t('lifecycle.retire.confirm') }}
          </button>
        </div>
      </form>
    </div>
  </div>
  <div class="modal-backdrop show" />
</template>
