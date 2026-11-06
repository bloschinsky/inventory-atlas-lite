<script setup>
import { nextTick, ref, watch } from 'vue';
import { auth, confirmPassword, reauthPending, settleReauth } from '../auth.js';

/*
  Asks for the password again before a destructive administrative action (restore, reset, update,
  accounts, API tokens) when the last confirmation is older than the server's window. The request
  that needed it is sent again once the password is confirmed.
*/
const password = ref('');
const error = ref('');
const busy = ref(false);
const input = ref(null);
let opener = null;

watch(reauthPending, async pending => {
  if (!pending) {
    if (opener?.isConnected) opener.focus();
    opener = null;
    return;
  }
  opener = document.activeElement;
  password.value = '';
  error.value = '';
  await nextTick();
  input.value?.focus();
});

async function submit() {
  busy.value = true;
  error.value = '';
  try {
    await confirmPassword(password.value);
  } catch (caught) {
    error.value = caught.message;
  } finally {
    busy.value = false;
    password.value = '';
  }
}
const cancel = () => settleReauth(false);
</script>

<template>
  <template v-if="reauthPending">
    <div
      class="modal modal-blur d-block app-reauth-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reauth-dialog-title"
      @keydown.esc="cancel"
    >
      <div class="modal-dialog modal-sm modal-dialog-centered">
        <form
          class="modal-content"
          @submit.prevent="submit"
        >
          <div class="modal-header">
            <h2
              id="reauth-dialog-title"
              class="modal-title"
            >
              {{ $t('auth.reauth.title') }}
            </h2>
            <button
              type="button"
              class="btn-close"
              :aria-label="$t('common.cancel')"
              @click="cancel"
            />
          </div>
          <div class="modal-body">
            <p class="text-secondary">
              {{ $t('auth.reauth.help') }}
            </p>
            <div
              v-if="error"
              class="alert alert-danger"
              role="alert"
            >
              {{ error }}
            </div>
            <!-- The account name lets password managers offer the right entry. -->
            <input
              type="text"
              class="d-none"
              autocomplete="username"
              :value="auth.user?.username"
              readonly
              tabindex="-1"
              aria-hidden="true"
            >
            <label
              class="form-label"
              for="reauth-password"
            >{{ $t('auth.password') }}</label>
            <input
              id="reauth-password"
              ref="input"
              v-model="password"
              type="password"
              class="form-control"
              autocomplete="current-password"
              required
            >
          </div>
          <div class="modal-footer">
            <button
              type="button"
              class="btn"
              @click="cancel"
            >
              {{ $t('common.cancel') }}
            </button>
            <button
              type="submit"
              class="btn btn-primary"
              :disabled="busy || !password"
            >
              {{ $t('auth.reauth.confirm') }}
            </button>
          </div>
        </form>
      </div>
    </div>
    <div class="modal-backdrop show app-reauth-backdrop" />
  </template>
</template>
