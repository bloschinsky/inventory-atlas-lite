<script setup>
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { TOKEN_EXPIRY_DAYS, TOKEN_NAME_MAX_LENGTH } from '../../../../shared/accounts.js';
import { api, jsonOptions } from '../../api.js';
import { formatDateTime } from '../../i18n/index.js';

/*
  Security & Access → API Access: scoped tokens for scripts and other machine clients. A new token
  is shown once, right after it is created; afterwards only its masked identifier is ever shown.
  Read-only is the default, and writing items is a deliberate choice. Tokens never manage settings,
  backups, accounts, or other tokens.
*/
const { t } = useI18n();
const tokens = ref(null);
const error = ref('');
const busy = ref(false);
const draft = ref({ name: '', access: 'read', expiresInDays: 90 });
// The one-time display of a just created token.
const created = ref(null);
const copied = ref(false);

const scopeLabel = scopes => t(scopes.includes('items:write') ? 'security.tokens.accessWrite' : 'security.tokens.accessRead');
const expiryLabel = days => (days ? t('security.tokens.expiresInDays', days) : t('security.tokens.noExpiry'));

async function load() {
  try { tokens.value = await api('/api/security/tokens'); } catch (caught) { error.value = caught.message; }
}

async function create() {
  busy.value = true; error.value = ''; copied.value = false;
  try {
    const scopes = draft.value.access === 'write' ? ['inventory:read', 'items:write'] : ['inventory:read'];
    created.value = await api('/api/security/tokens', jsonOptions('POST', { name: draft.value.name, scopes, expiresInDays: draft.value.expiresInDays }));
    draft.value = { name: '', access: 'read', expiresInDays: 90 };
    await load();
  } catch (caught) { error.value = caught.message; } finally { busy.value = false; }
}

async function copy() {
  try {
    await navigator.clipboard.writeText(created.value.token);
    copied.value = true;
  } catch { error.value = t('security.tokens.copyFailed'); }
}

async function revoke(token) {
  if (!confirm(t('security.tokens.confirmRevoke', { name: token.name }))) return;
  busy.value = true; error.value = '';
  try {
    await api(`/api/security/tokens/${token.id}`, { method: 'DELETE' });
    await load();
  } catch (caught) { error.value = caught.message; } finally { busy.value = false; }
}

onMounted(load);
</script>

<template>
  <section
    class="card mb-3"
    aria-labelledby="tokens-settings-title"
  >
    <div class="card-header">
      <h2
        id="tokens-settings-title"
        class="card-title"
      >
        {{ $t('security.tokens.title') }}
      </h2>
    </div>
    <div class="card-body">
      <p class="text-secondary">
        {{ $t('security.tokens.help') }}
      </p>
      <div
        v-if="error"
        class="alert alert-danger"
        role="alert"
      >
        {{ error }}
      </div>
      <div
        v-if="created"
        class="alert alert-warning"
        role="status"
      >
        <h3 class="alert-title">
          {{ $t('security.tokens.createdTitle', { name: created.apiToken.name }) }}
        </h3>
        <p>{{ $t('security.tokens.createdHelp') }}</p>
        <label
          class="form-label"
          for="token-created-value"
        >{{ $t('security.tokens.value') }}</label>
        <div class="input-group mb-2">
          <input
            id="token-created-value"
            class="form-control font-monospace"
            :value="created.token"
            readonly
            @focus="$event.target.select()"
          >
          <button
            type="button"
            class="btn"
            @click="copy"
          >
            {{ copied ? $t('security.tokens.copied') : $t('security.tokens.copy') }}
          </button>
        </div>
        <button
          type="button"
          class="btn btn-sm"
          @click="created = null"
        >
          {{ $t('security.tokens.done') }}
        </button>
      </div>
      <div
        v-if="!tokens && !error"
        class="text-secondary"
      >
        {{ $t('settings.loading') }}
      </div>
      <p
        v-else-if="tokens && !tokens.length"
        class="text-secondary mb-0"
      >
        {{ $t('security.tokens.empty') }}
      </p>
      <div
        v-else-if="tokens"
        class="table-responsive"
      >
        <table class="table table-vcenter card-table">
          <thead>
            <tr>
              <th>{{ $t('security.tokens.name') }}</th>
              <th>{{ $t('security.tokens.access') }}</th>
              <th>{{ $t('security.users.status') }}</th>
              <th>{{ $t('security.tokens.lastUsed') }}</th>
              <th>{{ $t('security.tokens.expires') }}</th>
              <th><span class="visually-hidden">{{ $t('common.actions') }}</span></th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="token in tokens"
              :key="token.id"
            >
              <td>
                <div class="text-break">
                  {{ token.name }}
                </div>
                <div class="text-secondary small font-monospace">
                  {{ token.maskedToken }}
                </div>
                <div class="text-secondary small">
                  {{ $t('security.tokens.createdBy', { name: token.owner, date: formatDateTime(token.createdAt) }) }}
                </div>
              </td>
              <td>{{ scopeLabel(token.scopes) }}</td>
              <td>
                <span
                  class="badge"
                  :class="token.status === 'active' ? 'bg-green-lt' : 'bg-secondary-lt'"
                >{{ $t(`security.tokens.status.${token.status}`) }}</span>
              </td>
              <td>{{ token.lastUsedAt ? formatDateTime(token.lastUsedAt) : $t('common.never') }}</td>
              <td>{{ token.expiresAt ? formatDateTime(token.expiresAt) : $t('security.tokens.noExpiry') }}</td>
              <td class="text-end">
                <button
                  v-if="token.status === 'active'"
                  type="button"
                  class="btn btn-sm btn-outline-danger"
                  :disabled="busy"
                  :aria-label="$t('security.tokens.revokeFor', { name: token.name })"
                  @click="revoke(token)"
                >
                  {{ $t('security.tokens.revoke') }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>

  <section
    class="card"
    aria-labelledby="tokens-add-title"
  >
    <div class="card-header">
      <h2
        id="tokens-add-title"
        class="card-title"
      >
        {{ $t('security.tokens.add') }}
      </h2>
    </div>
    <form
      class="card-body"
      @submit.prevent="create"
    >
      <div class="mb-3">
        <label
          class="form-label"
          for="token-new-name"
        >{{ $t('security.tokens.name') }}</label>
        <input
          id="token-new-name"
          v-model="draft.name"
          class="form-control"
          :maxlength="TOKEN_NAME_MAX_LENGTH"
          :placeholder="$t('security.tokens.namePlaceholder')"
          required
        >
      </div>
      <fieldset class="mb-3">
        <legend class="form-label">
          {{ $t('security.tokens.access') }}
        </legend>
        <label class="form-check">
          <input
            v-model="draft.access"
            class="form-check-input"
            type="radio"
            name="token-access"
            value="read"
          >
          <span class="form-check-label">{{ $t('security.tokens.accessRead') }}</span>
          <span class="form-check-description">{{ $t('security.tokens.accessReadHelp') }}</span>
        </label>
        <label class="form-check">
          <input
            v-model="draft.access"
            class="form-check-input"
            type="radio"
            name="token-access"
            value="write"
          >
          <span class="form-check-label">{{ $t('security.tokens.accessWrite') }}</span>
          <span class="form-check-description">{{ $t('security.tokens.accessWriteHelp') }}</span>
        </label>
      </fieldset>
      <div class="mb-3">
        <label
          class="form-label"
          for="token-new-expiry"
        >{{ $t('security.tokens.expiry') }}</label>
        <select
          id="token-new-expiry"
          v-model="draft.expiresInDays"
          class="form-select"
        >
          <option
            v-for="days in TOKEN_EXPIRY_DAYS"
            :key="String(days)"
            :value="days"
          >
            {{ expiryLabel(days) }}
          </option>
        </select>
      </div>
      <button
        type="submit"
        class="btn btn-primary"
        :disabled="busy || !draft.name.trim()"
      >
        {{ $t('security.tokens.create') }}
      </button>
    </form>
  </section>
</template>
