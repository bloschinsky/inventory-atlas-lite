<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { IconBrandDropbox, IconBrandGoogleDrive } from '@tabler/icons-vue';
import { api, jsonOptions } from '../api.js';
import CloudAppCredentials from './CloudAppCredentials.vue';

const route = useRoute();
const router = useRouter();

const icons = { dropbox: IconBrandDropbox, 'google-drive': IconBrandGoogleDrive };
const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

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
const formatTime = value => (value
  ? new Date(value).toLocaleString(undefined, { timeZone: overview.value.timezone, dateStyle: 'medium', timeStyle: 'short' })
  : 'Never');

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
  const cleanup = result.cleanup && !result.cleanup.ok ? ` Old backups could not be removed: ${result.cleanup.error}` : '';
  return `Backup uploaded to ${provider.label} as ${result.file}.${cleanup}`;
});

const testConnection = provider => act(`test:${provider.id}`, async () =>
  (await api(`/api/cloud-backup/providers/${provider.id}/test`, { method: 'POST' })).message);

const disconnect = provider => act(`disconnect:${provider.id}`, async () => {
  await api(`/api/cloud-backup/providers/${provider.id}`, { method: 'DELETE' });
  return `${provider.label} disconnected. Its stored access was removed from this server.`;
});

const saveApp = (provider, credentials) => act(`app:${provider.id}`, async () => {
  await api(`/api/cloud-backup/providers/${provider.id}/app`, jsonOptions('PUT', credentials));
  return `${provider.label} app credentials saved.`;
});

const removeApp = provider => act(`app:${provider.id}`, async () => {
  await api(`/api/cloud-backup/providers/${provider.id}/app`, { method: 'DELETE' });
  return `${provider.label} app credentials removed.`;
});

const saveSchedule = () => act('schedule', async () => {
  await api('/api/cloud-backup/settings', jsonOptions('PUT', {
    schedule: { enabled: form.enabled, provider: form.provider || null, frequency: form.frequency, weekday: Number(form.weekday), time: form.time },
    retention: { mode: form.retentionMode, keep: Number(form.keep) }
  }));
  return 'Backup schedule saved.';
});

onMounted(async () => {
  try { await load(); } catch (caught) { error.value = caught.message; } finally { loading.value = false; }
  // The OAuth callback reports only the outcome; the reason for a failure comes from the server status.
  const outcome = route.query.cloud;
  if (outcome === 'connected') notice.value = `${label(route.query.provider)} connected.`;
  if (outcome === 'error') error.value = status.value.connectError?.message || 'The cloud storage connection could not be completed.';
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
        Cloud Backup
      </h2>
    </div>
    <div class="card-body">
      <p class="text-secondary">
        Upload the same consistent snapshot as <strong>Download backup</strong> to Dropbox or Google Drive, right
        now or on a schedule. The access granted by the provider stays on this server and is never part of a backup.
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
        Loading cloud backup settings…
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
                  {{ provider.connected ? 'Connected' : (provider.configured ? 'Not connected' : 'Not configured') }}
                </span>
              </div>
              <div class="card-body">
                <template v-if="!provider.configured">
                  <p class="mb-2">
                    Enter the credentials of your {{ provider.label }} app below, or set
                    <code
                      v-for="(setting, index) in provider.requiredSettings"
                      :key="setting"
                    >{{ setting }}{{ index < provider.requiredSettings.length - 1 ? ' ' : '' }}</code>
                    on the server.
                  </p>
                  <p class="meta-text mb-0">
                    Register this redirect URI with the app: <code class="text-break">{{ redirectUri(provider) }}</code>
                  </p>
                </template>
                <template v-else-if="!provider.connected">
                  <p class="mb-2">
                    Not connected. Backups will go to <strong>{{ provider.destination }}</strong>.
                  </p>
                  <p class="meta-text">
                    Redirect URI registered with the app: <code class="text-break">{{ redirectUri(provider) }}</code>
                  </p>
                  <button
                    class="btn btn-primary"
                    type="button"
                    :disabled="Boolean(busy)"
                    @click="connect(provider)"
                  >
                    {{ busy === `connect:${provider.id}` ? 'Connecting…' : `Connect ${provider.label}` }}
                  </button>
                </template>
                <template v-else>
                  <dl class="row mb-3">
                    <dt class="col-sm-4">
                      Account
                    </dt>
                    <dd class="col-sm-8 text-break">
                      {{ provider.account }}
                    </dd>
                    <dt class="col-sm-4">
                      Connected on
                    </dt>
                    <dd class="col-sm-8">
                      {{ formatTime(provider.connectedAt) }}
                    </dd>
                    <dt class="col-sm-4">
                      Folder
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
                      :aria-label="`Back up to ${provider.label} now`"
                      @click="backupNow(provider)"
                    >
                      {{ busy === `backup:${provider.id}` ? 'Backing up…' : 'Backup now' }}
                    </button>
                    <button
                      class="btn btn-outline-secondary"
                      type="button"
                      :disabled="Boolean(busy)"
                      :aria-label="`Test ${provider.label} connection`"
                      @click="testConnection(provider)"
                    >
                      {{ busy === `test:${provider.id}` ? 'Testing…' : 'Test connection' }}
                    </button>
                    <button
                      class="btn btn-outline-danger"
                      type="button"
                      :disabled="Boolean(busy)"
                      :aria-label="`Disconnect ${provider.label}`"
                      @click="disconnect(provider)"
                    >
                      Disconnect
                    </button>
                  </div>
                </template>
                <details
                  class="mt-3"
                  :open="!provider.configured"
                >
                  <summary class="mb-2">
                    App credentials
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
          <h3>Automatic backups</h3>
          <label class="form-check form-switch mb-3">
            <input
              v-model="form.enabled"
              class="form-check-input"
              type="checkbox"
              :disabled="!connected.length"
            >
            <span class="form-check-label">Enable automatic backups</span>
          </label>
          <div class="row g-3 mb-3">
            <div class="col-sm-6 col-lg-3">
              <label
                class="form-label"
                for="cloud-destination"
              >Back up to</label>
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
                  Connect a service first
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
              >Frequency</label>
              <select
                id="cloud-frequency"
                v-model="form.frequency"
                class="form-select"
              >
                <option value="daily">
                  Daily
                </option>
                <option value="weekly">
                  Weekly
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
              >Day of week</label>
              <select
                id="cloud-weekday"
                v-model.number="form.weekday"
                class="form-select"
              >
                <option
                  v-for="(day, index) in weekdays"
                  :key="day"
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
              >Time of day</label>
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
            Times use the server time zone: <strong>{{ overview.timezone }}</strong>. The server runs the backup
            itself, so no browser needs to stay open. A backup missed while the server was off runs once shortly
            after it starts again.
          </div>
          <div class="row g-3 mb-3">
            <div class="col-sm-6">
              <label
                class="form-label"
                for="cloud-retention"
              >Retention</label>
              <select
                id="cloud-retention"
                v-model="form.retentionMode"
                class="form-select"
              >
                <option value="all">
                  Keep all backups
                </option>
                <option value="last">
                  Keep only the newest backups
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
              >Backups to keep</label>
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
            Retention applies after each successful cloud backup and only removes older
            <code>inventory-atlas-lite-…Z.sqlite</code> files in the application's own backup folder.
          </div>
          <button
            class="btn btn-primary"
            :disabled="Boolean(busy)"
          >
            {{ busy === 'schedule' ? 'Saving…' : 'Save schedule' }}
          </button>
        </form>

        <h3>Status</h3>
        <dl
          class="row mb-0"
          aria-label="Cloud backup status"
        >
          <dt class="col-sm-4">
            Last successful backup
          </dt>
          <dd class="col-sm-8">
            <template v-if="status.lastSuccess">
              {{ formatTime(status.lastSuccess.at) }} to {{ label(status.lastSuccess.provider) }}
              <span class="text-secondary text-break">({{ status.lastSuccess.file }})</span>
            </template>
            <template v-else>
              Never
            </template>
          </dd>
          <dt class="col-sm-4">
            Last attempt
          </dt>
          <dd class="col-sm-8">
            <template v-if="status.running">
              Running now ({{ label(status.running.provider) }})
            </template>
            <template v-else-if="status.lastAttempt">
              {{ formatTime(status.lastAttempt.at) }}, {{ status.lastAttempt.trigger }},
              {{ status.lastAttempt.ok ? 'succeeded' : 'failed' }}
            </template>
            <template v-else>
              Never
            </template>
          </dd>
          <dt class="col-sm-4">
            Service
          </dt>
          <dd class="col-sm-8">
            {{ status.lastAttempt ? label(status.lastAttempt.provider) : '—' }}
          </dd>
          <dt class="col-sm-4">
            Last error
          </dt>
          <dd
            class="col-sm-8"
            :class="{ 'text-danger': status.lastAttempt?.error }"
          >
            {{ status.lastAttempt?.error || 'None' }}
          </dd>
          <template v-if="status.lastAttempt?.cleanup">
            <dt class="col-sm-4">
              Retention cleanup
            </dt>
            <dd
              class="col-sm-8"
              :class="{ 'text-warning': !status.lastAttempt.cleanup.ok }"
            >
              {{ status.lastAttempt.cleanup.ok
                ? `Removed ${status.lastAttempt.cleanup.deleted} old backup(s).`
                : `Failed: ${status.lastAttempt.cleanup.error}` }}
            </dd>
          </template>
          <dt class="col-sm-4">
            Next scheduled run
          </dt>
          <dd class="col-sm-8 mb-0">
            {{ status.nextRunAt ? `${formatTime(status.nextRunAt)} (${overview.timezone})` : 'Not scheduled' }}
          </dd>
        </dl>
      </template>
    </div>
  </section>
</template>
