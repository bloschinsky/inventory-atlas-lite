<script setup>
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../../../../shared/accounts.js';
import { api } from '../../api.js';
import { auth, changePassword, signOut } from '../../auth.js';
import { formatDateTime } from '../../i18n/index.js';
import { useUnsavedChanges } from '../../settingsOverlay.js';

/*
  Security & Access → Sessions, for every signed-in person: the browsers signed in to this account,
  signing one or all others out, and changing one's own password (which signs out everywhere else).
  The browser and system come from the User-Agent and are only a hint, never a device identity.
*/
const { t } = useI18n();
const sessions = ref(null);
const error = ref('');
const notice = ref('');
const busy = ref(false);
const form = ref({ current: '', next: '', confirm: '' });
useUnsavedChanges(() => Boolean(form.value.current || form.value.next));
const mismatch = computed(() => form.value.confirm !== '' && form.value.confirm !== form.value.next);
const others = computed(() => (sessions.value ?? []).filter(session => !session.current).length);

async function load() {
  try { sessions.value = await api('/api/auth/sessions'); } catch (caught) { error.value = caught.message; }
}

async function run(work, success) {
  busy.value = true; error.value = ''; notice.value = '';
  try {
    await work();
    notice.value = success;
    await load();
  } catch (caught) { error.value = caught.message; } finally { busy.value = false; }
}

async function revoke(session) {
  if (session.current) return signOut();
  await run(() => api(`/api/auth/sessions/${encodeURIComponent(session.id)}`, { method: 'DELETE' }), t('security.sessions.revoked'));
}
const revokeOthers = () => run(() => api('/api/auth/sessions/revoke-others', { method: 'POST' }), t('security.sessions.othersRevoked'));

async function savePassword() {
  if (mismatch.value) return;
  await run(async () => {
    await changePassword({ currentPassword: form.value.current, newPassword: form.value.next });
    form.value = { current: '', next: '', confirm: '' };
  }, t('security.sessions.passwordChanged'));
}

onMounted(load);
</script>

<template>
  <section
    class="card mb-3"
    aria-labelledby="sessions-settings-title"
  >
    <div class="card-header">
      <h2
        id="sessions-settings-title"
        class="card-title"
      >
        {{ $t('security.sessions.title') }}
      </h2>
    </div>
    <div class="card-body">
      <p class="text-secondary">
        {{ $t('security.sessions.help', { name: auth.user?.username }) }}
      </p>
      <div
        v-if="error"
        class="alert alert-danger"
        role="alert"
      >
        {{ error }}
      </div>
      <div
        v-if="notice"
        class="alert alert-success"
        role="status"
      >
        {{ notice }}
      </div>
      <div
        v-if="!sessions && !error"
        class="text-secondary"
      >
        {{ $t('settings.loading') }}
      </div>
      <ul
        v-if="sessions"
        class="list-group mb-3"
      >
        <li
          v-for="session in sessions"
          :key="session.id"
          class="list-group-item d-flex flex-wrap align-items-center gap-2"
        >
          <div class="flex-grow-1">
            <div class="fw-medium">
              {{ session.client || $t('security.sessions.unknownClient') }}
              <span
                v-if="session.current"
                class="badge bg-blue-lt ms-1"
              >{{ $t('security.sessions.current') }}</span>
            </div>
            <div class="text-secondary small">
              {{ $t('security.sessions.details', { address: session.ip || '—', created: formatDateTime(session.createdAt), seen: formatDateTime(session.lastSeenAt) }) }}
            </div>
          </div>
          <button
            type="button"
            class="btn btn-sm"
            :disabled="busy"
            @click="revoke(session)"
          >
            {{ session.current ? $t('auth.signOut') : $t('security.sessions.revoke') }}
          </button>
        </li>
      </ul>
      <button
        type="button"
        class="btn"
        :disabled="busy || !others"
        @click="revokeOthers"
      >
        {{ $t('security.sessions.revokeOthers') }}
      </button>
    </div>
  </section>

  <section
    class="card"
    aria-labelledby="password-settings-title"
  >
    <div class="card-header">
      <h2
        id="password-settings-title"
        class="card-title"
      >
        {{ $t('security.sessions.changePassword') }}
      </h2>
    </div>
    <form
      class="card-body"
      @submit.prevent="savePassword"
    >
      <p class="text-secondary">
        {{ $t('security.sessions.changePasswordHelp') }}
      </p>
      <input
        type="text"
        class="d-none"
        autocomplete="username"
        :value="auth.user?.username"
        readonly
        tabindex="-1"
        aria-hidden="true"
      >
      <div class="mb-3">
        <label
          class="form-label"
          for="password-current"
        >{{ $t('auth.currentPassword') }}</label>
        <input
          id="password-current"
          v-model="form.current"
          type="password"
          class="form-control"
          autocomplete="current-password"
          required
        >
      </div>
      <div class="mb-3">
        <label
          class="form-label"
          for="password-next"
        >{{ $t('auth.newPassword') }}</label>
        <input
          id="password-next"
          v-model="form.next"
          type="password"
          class="form-control"
          autocomplete="new-password"
          :minlength="PASSWORD_MIN_LENGTH"
          :maxlength="PASSWORD_MAX_LENGTH"
          required
        >
        <div class="form-hint">
          {{ $t('auth.passwordHint', { min: PASSWORD_MIN_LENGTH }) }}
        </div>
      </div>
      <div class="mb-3">
        <label
          class="form-label"
          for="password-confirm"
        >{{ $t('auth.confirmPassword') }}</label>
        <input
          id="password-confirm"
          v-model="form.confirm"
          type="password"
          class="form-control"
          :class="{ 'is-invalid': mismatch }"
          autocomplete="new-password"
          required
        >
        <div class="invalid-feedback">
          {{ $t('auth.passwordMismatch') }}
        </div>
      </div>
      <button
        type="submit"
        class="btn btn-primary"
        :disabled="busy || !form.current || !form.next || !form.confirm || mismatch"
      >
        {{ $t('security.sessions.savePassword') }}
      </button>
    </form>
  </section>
</template>
