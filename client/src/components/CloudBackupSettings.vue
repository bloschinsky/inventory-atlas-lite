<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { IconBrandDropbox, IconBrandGoogleDrive } from '@tabler/icons-vue';
import { api, jsonOptions } from '../api.js';
import { formatDateTime, translateError, translateNotice } from '../i18n/index.js';
import CloudAppCredentials from './CloudAppCredentials.vue';

const route = useRoute();
const router = useRouter();
const { t, locale } = useI18n();

const icons = { dropbox: IconBrandDropbox, 'google-drive': IconBrandGoogleDrive };
// Sunday first, matching the weekday numbers the schedule stores; names come from the active locale.
const weekdays = computed(() => Array.from({ length: 7 }, (_, index) =>
  new Intl.DateTimeFormat(locale.value, { weekday: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2023, 0, 1 + index)))));

const overview = ref(null);
const loading = ref(true);
// The action in progress, such as "backup:dropbox"; every other action waits for it.
const busy = ref('');
const notice = ref('');
const error = ref('');
const form = reactive({ enabled: false, provider: '', frequency: 'daily', weekday: 0, time: '03:00', retentionMode: 'all', keep: 10 });

const providers = computed(() => overview.value?.providers ?? []);
const connected = computed(() => providers.value.filter(provider => provider.connected));
const status = computed(() => overview.value?.status ?? {});
const label = id => providers.value.find(provider => provider.id === id)?.label ?? id;
// Unless the server has a fixed callback URL, the provider returns to the address this page was opened at.
const redirectUri = provider => provider.redirectUri || `${window.location.origin}${overview.value.callbackPath}`;

// Every time is shown in the server's time zone, the one the schedule is entered in.
const formatTime = value => (value ? formatDateTime(value, overview.value.timezone) : t('common.never'));

function show(data) {
  overview.value = data;
  const { schedule, retention } = data.settings;
  Object.assign(form, {
    enabled: schedule.enabled,
    provider: schedule.provider && data.providers.some(provider => provider.id === schedule.provider && provider.connected)
      ? schedule.provider
      : (data.providers.find(provider => provider.connected)?.id ?? ''),
    frequency: schedule.frequency, weekday: schedule.weekday, time: schedule.time, retentionMode: retention.mode, keep: retention.keep
  });
}

async function load() {
  show(await api('/api/cloud-backup'));
}

async function act(key, work) {
  busy.value = key;
  notice.value = '';
  error.value = '';
  try {
    notice.value = await work();
  } catch (caught) {
    error.value = caught.message;
  } finally {
    busy.value = '';
    // The status and history change after every action, including a failed one.
    await load().catch(() => {});
  }
}

// The browser goes to the provider and comes back through the server's OAuth callback.
async function connect(provider) {
  busy.value = `connect:${provider.id}`;
  error.value = '';
  notice.value = '';
  try {
    const { authorizationUrl } = await api(`/api/cloud-backup/providers/${provider.id}/connect`, { method: 'POST' });
    window.location.assign(authorizationUrl);
  } catch (caught) {
    error.value = caught.message;
    busy.value = '';
  }
}

const backupNow = provider => act(`backup:${provider.id}`, async () => {
  const result = await api(`/api/cloud-backup/providers/${provider.id}/backup`, { method: 'POST' });
  const cleanup = result.cleanup && !result.cleanup.ok ? ` ${t('cloud.cleanupFailed', { reason: translateError(result.cleanup.error) })}` : '';
  return t('cloud.uploaded', { provider: provider.label, file: result.file }) + cleanup;
});

const testConnection = provider => act(`test:${provider.id}`, async () =>
  translateNotice((await api(`/api/cloud-backup/providers/${provider.id}/test`, { method: 'POST' })).notice));

const disconnect = provider => act(`disconnect:${provider.id}`, async () => {
  await api(`/api/cloud-backup/providers/${provider.id}`, { method: 'DELETE' });
  return t('cloud.disconnected', { provider: provider.label });
});

const saveApp = (provider, credentials) => act(`app:${provider.id}`, async () => {
  await api(`/api/cloud-backup/providers/${provider.id}/app`, jsonOptions('PUT', credentials));
  return t('cloud.appSaved', { provider: provider.label });
});

const removeApp = provider => act(`app:${provider.id}`, async () => {
  await api(`/api/cloud-backup/providers/${provider.id}/app`, { method: 'DELETE' });
  return t('cloud.appRemoved', { provider: provider.label });
});

const saveSchedule = () => act('schedule', async () => {
  await api('/api/cloud-backup/settings', jsonOptions('PUT', {
    schedule: { enabled: form.enabled, provider: form.provider || null, frequency: form.frequency, weekday: Number(form.weekday), time: form.time },
    retention: { mode: form.retentionMode, keep: Number(form.keep) }
  }));
  return t('cloud.scheduleSaved');
});

onMounted(async () => {
  try { await load(); } catch (caught) { error.value = caught.message; } finally { loading.value = false; }
  // The OAuth callback reports only the outcome; the reason for a failure comes from the server status.
  const outcome = route.query.cloud;
  if (outcome === 'connected') notice.value = t('cloud.connectedNotice', { provider: label(route.query.provider) });
  const connectError = status.value.connectError?.error;
  if (outcome === 'error') error.value = connectError ? translateError(connectError) : t('cloud.connectFailed');
  if (outcome) router.replace({ query: {} });
});
</script>

<template>
  <section
    class="card mt-3"
    aria-labelledby="cloud-backup-title"
  >
    <div class="card-header">
      <h2
        id="cloud-backup-title"
        class="card-title"
      >
        {{ $t('cloud.title') }}
      </h2>
    </div>
    <div class="card-body">
      <p class="text-secondary">
        <i18n-t
          keypath="cloud.intro"
          scope="global"
        >
          <template #download>
            <strong>{{ $t('backup.download') }}</strong>
          </template>
        </i18n-t>
      </p>
      <div
        v-if="notice"
        class="alert alert-success"
        role="status"
      >
        {{ notice }}
      </div>
      <div
        v-if="error"
        class="alert alert-danger"
        role="alert"
      >
        {{ error }}
      </div>
      <div
        v-if="loading"
        class="text-secondary"
      >
        {{ $t('cloud.loading') }}
      </div>
      <template v-else-if="overview">
        <div class="row g-3 mb-4">
          <div
            v-for="provider in providers"
            :key="provider.id"
            class="col-md-6"
          >
            <article
              class="card h-100"
              :aria-labelledby="`cloud-${provider.id}-title`"
            >
              <div class="card-header">
                <component
                  :is="icons[provider.id]"
                  class="icon me-2"
                  aria-hidden="true"
                />
                <h3
                  :id="`cloud-${provider.id}-title`"
                  class="card-title"
                >
                  {{ provider.label }}
                </h3>
                <span
                  class="badge ms-auto"
                  :class="provider.connected ? 'bg-green-lt' : 'bg-secondary-lt'"
                >
                  {{ $t(provider.connected ? 'cloud.connected' : (provider.configured ? 'cloud.notConnected' : 'cloud.notConfigured')) }}
                </span>
              </div>
              <div class="card-body">
                <template v-if="!provider.configured">
                  <i18n-t
                    keypath="cloud.enterCredentials"
                    tag="p"
                    class="mb-2"
                    scope="global"
                  >
                    <template #provider>
                      {{ provider.label }}
                    </template>
                    <template #settings>
                      <code
                        v-for="(setting, index) in provider.requiredSettings"
                        :key="setting"
                      >{{ setting }}{{ index < provider.requiredSettings.length - 1 ? ' ' : '' }}</code>
                    </template>
                  </i18n-t>
                  <p class="meta-text mb-0">
                    {{ $t('cloud.registerRedirect') }} <code class="text-break">{{ redirectUri(provider) }}</code>
                  </p>
                </template>
                <template v-else-if="!provider.connected">
                  <i18n-t
                    keypath="cloud.willGoTo"
                    tag="p"
                    class="mb-2"
                    scope="global"
                  >
                    <template #destination>
                      <strong>{{ provider.destination }}</strong>
                    </template>
                  </i18n-t>
                  <p class="meta-text">
                    {{ $t('cloud.registeredRedirect') }} <code class="text-break">{{ redirectUri(provider) }}</code>
                  </p>
                  <button
                    class="btn btn-primary"
                    type="button"
                    :disabled="Boolean(busy)"
                    @click="connect(provider)"
                  >
                    {{ busy === `connect:${provider.id}` ? $t('cloud.connecting') : $t('cloud.connect', { provider: provider.label }) }}
                  </button>
                </template>
                <template v-else>
                  <dl class="row mb-3">
                    <dt class="col-sm-4">
                      {{ $t('cloud.account') }}
                    </dt>
                    <dd class="col-sm-8 text-break">
                      {{ provider.account }}
                    </dd>
                    <dt class="col-sm-4">
                      {{ $t('cloud.connectedOn') }}
                    </dt>
                    <dd class="col-sm-8">
                      {{ formatTime(provider.connectedAt) }}
                    </dd>
                    <dt class="col-sm-4">
                      {{ $t('cloud.folder') }}
                    </dt>
                    <dd class="col-sm-8 mb-0">
                      {{ provider.destination }}
                    </dd>
                  </dl>
                  <div class="d-flex flex-wrap gap-2">
                    <button
                      class="btn btn-primary"
                      type="button"
                      :disabled="Boolean(busy)"
                      :aria-label="$t('cloud.backupTo', { provider: provider.label })"
                      @click="backupNow(provider)"
                    >
                      {{ busy === `backup:${provider.id}` ? $t('cloud.backingUp') : $t('cloud.backupNow') }}
                    </button>
                    <button
                      class="btn btn-outline-secondary"
                      type="button"
                      :disabled="Boolean(busy)"
                      :aria-label="$t('cloud.testProvider', { provider: provider.label })"
                      @click="testConnection(provider)"
                    >
                      {{ busy === `test:${provider.id}` ? $t('common.testing') : $t('common.testConnection') }}
                    </button>
                    <button
                      class="btn btn-outline-danger"
                      type="button"
                      :disabled="Boolean(busy)"
                      :aria-label="$t('cloud.disconnectProvider', { provider: provider.label })"
                      @click="disconnect(provider)"
                    >
                      {{ $t('cloud.disconnect') }}
                    </button>
                  </div>
                </template>
                <details
                  class="mt-3"
                  :open="!provider.configured"
                >
                  <summary class="mb-2">
                    {{ $t('cloud.appCredentials') }}
                  </summary>
                  <CloudAppCredentials
                    :provider="provider"
                    :busy="Boolean(busy)"
                    @save="credentials => saveApp(provider, credentials)"
                    @remove="removeApp(provider)"
                  />
                </details>
              </div>
            </article>
          </div>
        </div>

        <form
          class="mb-4"
          @submit.prevent="saveSchedule"
        >
          <h3>{{ $t('cloud.automatic') }}</h3>
          <label class="form-check form-switch mb-3">
            <input
              v-model="form.enabled"
              class="form-check-input"
              type="checkbox"
              :disabled="!connected.length"
            >
            <span class="form-check-label">{{ $t('cloud.enableAutomatic') }}</span>
          </label>
          <div class="row g-3 mb-3">
            <div class="col-sm-6 col-lg-3">
              <label
                class="form-label"
                for="cloud-destination"
              >{{ $t('cloud.destination') }}</label>
              <select
                id="cloud-destination"
                v-model="form.provider"
                class="form-select"
                :disabled="!connected.length"
              >
                <option
                  v-if="!connected.length"
                  value=""
                >
                  {{ $t('cloud.connectFirst') }}
                </option>
                <option
                  v-for="provider in connected"
                  :key="provider.id"
                  :value="provider.id"
                >
                  {{ provider.label }}
                </option>
              </select>
            </div>
            <div class="col-sm-6 col-lg-3">
              <label
                class="form-label"
                for="cloud-frequency"
              >{{ $t('cloud.frequency') }}</label>
              <select
                id="cloud-frequency"
                v-model="form.frequency"
                class="form-select"
              >
                <option value="daily">
                  {{ $t('cloud.daily') }}
                </option>
                <option value="weekly">
                  {{ $t('cloud.weekly') }}
                </option>
              </select>
            </div>
            <div
              v-if="form.frequency === 'weekly'"
              class="col-sm-6 col-lg-3"
            >
              <label
                class="form-label"
                for="cloud-weekday"
              >{{ $t('cloud.weekday') }}</label>
              <select
                id="cloud-weekday"
                v-model.number="form.weekday"
                class="form-select"
              >
                <option
                  v-for="(day, index) in weekdays"
                  :key="index"
                  :value="index"
                >
                  {{ day }}
                </option>
              </select>
            </div>
            <div class="col-sm-6 col-lg-3">
              <label
                class="form-label"
                for="cloud-time"
              >{{ $t('cloud.time') }}</label>
              <input
                id="cloud-time"
                v-model="form.time"
                class="form-control"
                type="time"
                required
              >
            </div>
          </div>
          <div class="form-text mb-3">
            <i18n-t
              keypath="cloud.timezoneHelp"
              scope="global"
            >
              <template #timezone>
                <strong>{{ overview.timezone }}</strong>
              </template>
            </i18n-t>
          </div>
          <div class="row g-3 mb-3">
            <div class="col-sm-6">
              <label
                class="form-label"
                for="cloud-retention"
              >{{ $t('cloud.retention') }}</label>
              <select
                id="cloud-retention"
                v-model="form.retentionMode"
                class="form-select"
              >
                <option value="all">
                  {{ $t('cloud.keepAll') }}
                </option>
                <option value="last">
                  {{ $t('cloud.keepNewest') }}
                </option>
              </select>
            </div>
            <div
              v-if="form.retentionMode === 'last'"
              class="col-sm-6"
            >
              <label
                class="form-label"
                for="cloud-keep"
              >{{ $t('cloud.keep') }}</label>
              <input
                id="cloud-keep"
                v-model.number="form.keep"
                class="form-control"
                type="number"
                min="1"
                max="365"
                required
              >
            </div>
          </div>
          <div class="form-text mb-3">
            <i18n-t
              keypath="cloud.retentionHelp"
              scope="global"
            >
              <template #files>
                <code>inventory-atlas-lite-…Z.sqlite</code>
              </template>
            </i18n-t>
          </div>
          <button
            class="btn btn-primary"
            :disabled="Boolean(busy)"
          >
            {{ busy === 'schedule' ? $t('common.saving') : $t('cloud.saveSchedule') }}
          </button>
        </form>

        <h3>{{ $t('cloud.status') }}</h3>
        <dl
          class="row mb-0"
          :aria-label="$t('cloud.statusLabel')"
        >
          <dt class="col-sm-4">
            {{ $t('cloud.lastSuccess') }}
          </dt>
          <dd class="col-sm-8">
            <template v-if="status.lastSuccess">
              {{ $t('cloud.successTo', { time: formatTime(status.lastSuccess.at), provider: label(status.lastSuccess.provider) }) }}
              <span class="text-secondary text-break">({{ status.lastSuccess.file }})</span>
            </template>
            <template v-else>
              {{ $t('common.never') }}
            </template>
          </dd>
          <dt class="col-sm-4">
            {{ $t('cloud.lastAttempt') }}
          </dt>
          <dd class="col-sm-8">
            <template v-if="status.running">
              {{ $t('cloud.running', { provider: label(status.running.provider) }) }}
            </template>
            <template v-else-if="status.lastAttempt">
              {{ formatTime(status.lastAttempt.at) }}, {{ $t(`cloud.triggers.${status.lastAttempt.trigger}`) }},
              {{ $t(status.lastAttempt.ok ? 'cloud.succeeded' : 'cloud.failed') }}
            </template>
            <template v-else>
              {{ $t('common.never') }}
            </template>
          </dd>
          <dt class="col-sm-4">
            {{ $t('cloud.service') }}
          </dt>
          <dd class="col-sm-8">
            {{ status.lastAttempt ? label(status.lastAttempt.provider) : '—' }}
          </dd>
          <dt class="col-sm-4">
            {{ $t('cloud.lastError') }}
          </dt>
          <dd
            class="col-sm-8"
            :class="{ 'text-danger': status.lastAttempt?.error }"
          >
            {{ status.lastAttempt?.error ? translateError(status.lastAttempt.error) : $t('common.none') }}
          </dd>
          <template v-if="status.lastAttempt?.cleanup">
            <dt class="col-sm-4">
              {{ $t('cloud.cleanup') }}
            </dt>
            <dd
              class="col-sm-8"
              :class="{ 'text-warning': !status.lastAttempt.cleanup.ok }"
            >
              {{ status.lastAttempt.cleanup.ok
                ? $t('cloud.cleanupRemoved', status.lastAttempt.cleanup.deleted)
                : $t('cloud.cleanupError', { reason: translateError(status.lastAttempt.cleanup.error) }) }}
            </dd>
          </template>
          <dt class="col-sm-4">
            {{ $t('cloud.nextRun') }}
          </dt>
          <dd class="col-sm-8 mb-0">
            {{ status.nextRunAt ? `${formatTime(status.nextRunAt)} (${overview.timezone})` : $t('cloud.notScheduled') }}
          </dd>
        </dl>
      </template>
    </div>
  </section>
</template>
