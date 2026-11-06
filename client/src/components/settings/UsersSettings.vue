<script setup>
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../../../../shared/accounts.js';
import { api, jsonOptions } from '../../api.js';
import { auth } from '../../auth.js';
import { formatDateTime } from '../../i18n/index.js';
import { useUnsavedChanges } from '../../settingsOverlay.js';

/*
  Security & Access → Users: the accounts, a new account, and the changes an administrator may make
  to someone else's account. The server refuses disabling or demoting the last administrator and
  any change that would lock the acting administrator out; those buttons are simply not offered.
*/
const { t } = useI18n();
const users = ref(null);
const error = ref('');
const notice = ref('');
const busy = ref(false);
const blank = () => ({ username: '', role: 'viewer', password: '', confirm: '' });
const draft = ref(blank());
// The account whose password is being reset, and the new password typed for it.
const resetting = ref(null);
const resetPassword = ref('');
useUnsavedChanges(() => Boolean(draft.value.username || draft.value.password || resetPassword.value));

const mismatch = computed(() => draft.value.confirm !== '' && draft.value.confirm !== draft.value.password);
const roleLabel = role => t(role === 'admin' ? 'auth.roles.admin' : 'auth.roles.viewer');
const isSelf = user => user.id === auth.user?.id;

async function run(work, success) {
  busy.value = true; error.value = ''; notice.value = '';
  try {
    await work();
    users.value = await api('/api/security/users');
    if (success) notice.value = success;
    return true;
  } catch (caught) {
    error.value = caught.message;
    return false;
  } finally { busy.value = false; }
}

async function create() {
  if (mismatch.value) return;
  const { username, role, password } = draft.value;
  if (await run(() => api('/api/security/users', jsonOptions('POST', { username, role, password })), t('security.users.createdNotice', { name: username }))) {
    draft.value = blank();
  }
}
const update = (user, changes, message) => run(() => api(`/api/security/users/${user.id}`, jsonOptions('PATCH', changes)), message);
const toggleRole = user => update(user, { role: user.role === 'admin' ? 'viewer' : 'admin' }, t('security.users.roleChanged', { name: user.username }));
const toggleDisabled = user => update(user, { disabled: !user.disabled },
  t(user.disabled ? 'security.users.enabledNotice' : 'security.users.disabledNotice', { name: user.username }));

function startReset(user) {
  resetting.value = user;
  resetPassword.value = '';
}
async function saveReset() {
  const user = resetting.value;
  if (await run(() => api(`/api/security/users/${user.id}/password`, jsonOptions('POST', { password: resetPassword.value })),
    t('security.users.passwordResetNotice', { name: user.username }))) {
    resetting.value = null;
    resetPassword.value = '';
  }
}

onMounted(() => run(async () => {}));
</script>

<template>
  <section
    class="card mb-3"
    aria-labelledby="users-settings-title"
  >
    <div class="card-header">
      <h2
        id="users-settings-title"
        class="card-title"
      >
        {{ $t('security.users.title') }}
      </h2>
    </div>
    <div class="card-body">
      <p class="text-secondary">
        {{ $t('security.users.help') }}
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
        v-if="!users && !error"
        class="text-secondary"
      >
        {{ $t('settings.loading') }}
      </div>
      <div
        v-if="users"
        class="table-responsive"
      >
        <table class="table table-vcenter card-table">
          <thead>
            <tr>
              <th>{{ $t('auth.username') }}</th>
              <th>{{ $t('security.users.role') }}</th>
              <th>{{ $t('security.users.status') }}</th>
              <th><span class="visually-hidden">{{ $t('common.actions') }}</span></th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="user in users"
              :key="user.id"
            >
              <td class="text-break">
                {{ user.username }}
                <span
                  v-if="isSelf(user)"
                  class="badge bg-blue-lt ms-1"
                >{{ $t('security.users.you') }}</span>
                <!-- The creation time sits under the name, so the table fits the Settings pane without scrolling. -->
                <div class="text-secondary small">
                  {{ $t('security.users.createdOn', { date: formatDateTime(user.createdAt) }) }}
                </div>
              </td>
              <td>{{ roleLabel(user.role) }}</td>
              <td>
                <span
                  class="badge"
                  :class="user.disabled ? 'bg-secondary-lt' : 'bg-green-lt'"
                >{{ $t(user.disabled ? 'security.users.disabled' : 'security.users.active') }}</span>
              </td>
              <td class="text-end">
                <div
                  v-if="!isSelf(user)"
                  class="btn-list justify-content-end"
                >
                  <button
                    type="button"
                    class="btn btn-sm"
                    :disabled="busy"
                    :aria-label="$t(user.role === 'admin' ? 'security.users.makeViewerFor' : 'security.users.makeAdminFor', { name: user.username })"
                    @click="toggleRole(user)"
                  >
                    {{ $t(user.role === 'admin' ? 'security.users.makeViewer' : 'security.users.makeAdmin') }}
                  </button>
                  <button
                    type="button"
                    class="btn btn-sm"
                    :disabled="busy"
                    :aria-label="$t('security.users.resetPasswordFor', { name: user.username })"
                    @click="startReset(user)"
                  >
                    {{ $t('security.users.resetPassword') }}
                  </button>
                  <button
                    type="button"
                    class="btn btn-sm"
                    :class="user.disabled ? '' : 'btn-outline-danger'"
                    :disabled="busy"
                    :aria-label="$t(user.disabled ? 'security.users.enableFor' : 'security.users.disableFor', { name: user.username })"
                    @click="toggleDisabled(user)"
                  >
                    {{ $t(user.disabled ? 'security.users.enable' : 'security.users.disable') }}
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <form
        v-if="resetting"
        class="border rounded p-3 mt-3"
        @submit.prevent="saveReset"
      >
        <h3 class="h4">
          {{ $t('security.users.resetTitle', { name: resetting.username }) }}
        </h3>
        <p class="text-secondary">
          {{ $t('security.users.resetHelp') }}
        </p>
        <label
          class="form-label"
          for="user-reset-password"
        >{{ $t('auth.newPassword') }}</label>
        <input
          id="user-reset-password"
          v-model="resetPassword"
          type="password"
          class="form-control mb-1"
          autocomplete="new-password"
          :minlength="PASSWORD_MIN_LENGTH"
          :maxlength="PASSWORD_MAX_LENGTH"
          required
        >
        <div class="form-hint mb-3">
          {{ $t('auth.passwordHint', { min: PASSWORD_MIN_LENGTH }) }}
        </div>
        <div class="btn-list">
          <button
            type="submit"
            class="btn btn-primary"
            :disabled="busy || !resetPassword"
          >
            {{ $t('security.users.saveReset') }}
          </button>
          <button
            type="button"
            class="btn"
            @click="resetting = null; resetPassword = ''"
          >
            {{ $t('common.cancel') }}
          </button>
        </div>
      </form>
    </div>
  </section>

  <section
    class="card"
    aria-labelledby="users-add-title"
  >
    <div class="card-header">
      <h2
        id="users-add-title"
        class="card-title"
      >
        {{ $t('security.users.add') }}
      </h2>
    </div>
    <form
      class="card-body"
      @submit.prevent="create"
    >
      <div class="row g-3">
        <div class="col-md-6">
          <label
            class="form-label"
            for="user-new-name"
          >{{ $t('auth.username') }}</label>
          <input
            id="user-new-name"
            v-model="draft.username"
            class="form-control"
            autocomplete="off"
            autocapitalize="none"
            spellcheck="false"
            required
          >
          <div class="form-hint">
            {{ $t('auth.usernameHint') }}
          </div>
        </div>
        <div class="col-md-6">
          <label
            class="form-label"
            for="user-new-role"
          >{{ $t('security.users.role') }}</label>
          <select
            id="user-new-role"
            v-model="draft.role"
            class="form-select"
          >
            <option value="viewer">
              {{ $t('auth.roles.viewer') }}
            </option>
            <option value="admin">
              {{ $t('auth.roles.admin') }}
            </option>
          </select>
          <div class="form-hint">
            {{ $t(draft.role === 'admin' ? 'security.users.adminHint' : 'security.users.viewerHint') }}
          </div>
        </div>
        <div class="col-md-6">
          <label
            class="form-label"
            for="user-new-password"
          >{{ $t('auth.password') }}</label>
          <input
            id="user-new-password"
            v-model="draft.password"
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
        <div class="col-md-6">
          <label
            class="form-label"
            for="user-new-confirm"
          >{{ $t('auth.confirmPassword') }}</label>
          <input
            id="user-new-confirm"
            v-model="draft.confirm"
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
      </div>
      <button
        type="submit"
        class="btn btn-primary mt-3"
        :disabled="busy || !draft.username || !draft.password || !draft.confirm || mismatch"
      >
        {{ $t('security.users.create') }}
      </button>
    </form>
  </section>
</template>
