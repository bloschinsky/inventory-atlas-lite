<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { api, jsonOptions } from '../api.js';
import { setAiCapabilities } from '../capabilities.js';
import { SUPPORTED_LOCALES, setLocale } from '../i18n/index.js';
import CloudBackupSettings from '../components/CloudBackupSettings.vue';
import PageHeader from '../components/PageHeader.vue';
import { AI_PROVIDERS, aiProvider, isLocalNetworkHost } from '../../../shared/aiProviders.js';

defineOptions({ name: 'SettingsPage' });
const { t, locale } = useI18n();

const form = reactive({
  enabled: false, provider: 'openai', displayName: '', baseUrl: '', model: 'gpt-5.6-luna', imageInput: 'auto', apiKey: '', clearApiKey: false
});
// The provider and base URL the saved key belongs to: the server drops the key when either changes.
const savedEndpoint = reactive({ provider: '', baseUrl: '' });
const maskedKey = ref('');
const hasApiKey = ref(false);
const availableModels = ref([]);
const selectedModel = ref('custom');
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const modelError = ref('');
const modelsLoading = ref(false);
const testing = ref(false);
const testResult = ref(null);
const saved = ref(false);

const preset = computed(() => aiProvider(form.provider));
const trimmedBaseUrl = computed(() => form.baseUrl.trim().replace(/\/+$/, ''));
const endpointChanged = computed(() => form.provider !== savedEndpoint.provider || trimmedBaseUrl.value !== savedEndpoint.baseUrl);
const keyBelongsHere = computed(() => hasApiKey.value && !endpointChanged.value);
const savedKeyApplies = computed(() => keyBelongsHere.value && !form.clearApiKey);

/*
  AI only works when it can connect, so the switch follows the key rather than the other way round:
  it counts a key typed in this form and the saved key while it still belongs to this endpoint.
*/
const keyAvailable = computed(() => !preset.value.apiKeyRequired || Boolean(form.apiKey.trim()) || savedKeyApplies.value);
watch(keyAvailable, available => { if (!available) form.enabled = false; });

// Plain HTTP is expected on a trusted LAN; anywhere else the key and inventory data travel unencrypted.
const insecureRemote = computed(() => {
  try {
    const url = new URL(trimmedBaseUrl.value);
    return url.protocol === 'http:' && !isLocalNetworkHost(url.hostname);
  } catch { return false; }
});

// The unsaved connection values the model list and the connection test are run against.
const connectionForm = () => ({ provider: form.provider, displayName: form.displayName, baseUrl: form.baseUrl, apiKey: form.apiKey });

function syncSelectedModel() {
  selectedModel.value = availableModels.value.some(model => model.id === form.model) ? form.model : 'custom';
}

function modelLabel(model) {
  return model.imageInput === false ? t('settings.ai.textOnlyModel', { model: model.label }) : model.label;
}

// Provider names are brands and stay as they are; only the generic custom entry is translated.
const providerLabel = provider => (provider.id === 'custom' ? t('settings.ai.providers.custom.label') : provider.label);

function applySettings(settings) {
  // The saved state is the source of truth for AI visibility, so an unsaved checkbox changes nothing.
  setAiCapabilities(settings);
  Object.assign(form, {
    enabled: settings.enabled, provider: settings.provider, displayName: settings.displayName, baseUrl: settings.baseUrl,
    model: settings.model, imageInput: settings.imageInput, apiKey: '', clearApiKey: false
  });
  savedEndpoint.provider = settings.provider;
  savedEndpoint.baseUrl = settings.baseUrl;
  hasApiKey.value = settings.hasApiKey;
  maskedKey.value = settings.apiKeyMasked;
  syncSelectedModel();
}

// A preset fills in its default address; the list of another provider's models no longer applies.
function chooseProvider() {
  form.baseUrl = preset.value.defaultBaseUrl;
  availableModels.value = [];
  modelError.value = '';
  testResult.value = null;
  syncSelectedModel();
}

function chooseModel() {
  if (selectedModel.value !== 'custom') form.model = selectedModel.value;
}

function showModels(models) {
  availableModels.value = models;
  syncSelectedModel();
}

async function loadModels() {
  modelsLoading.value = true;
  modelError.value = '';
  try {
    showModels((await api('/api/ai/models', jsonOptions('POST', connectionForm()))).models);
  } catch (caught) {
    showModels([]);
    modelError.value = t('settings.ai.modelsFailed', { reason: caught.message });
  } finally {
    modelsLoading.value = false;
  }
}

async function testConnection() {
  testing.value = true;
  testResult.value = null;
  try {
    const result = await api('/api/ai/test', jsonOptions('POST', connectionForm()));
    testResult.value = { ok: true, message: result.message };
    if (result.models.length) { modelError.value = ''; showModels(result.models); }
  } catch (caught) {
    testResult.value = { ok: false, message: caught.message };
  } finally {
    testing.value = false;
  }
}

async function save() {
  saving.value = true; error.value = ''; saved.value = false;
  const reloadModels = Boolean(form.apiKey.trim()) || form.clearApiKey || endpointChanged.value;
  try {
    const settings = await api('/api/settings/ai', jsonOptions('PUT', form));
    applySettings(settings);
    saved.value = true;
    if (reloadModels) await loadModels();
  } catch (caught) { error.value = caught.message; } finally { saving.value = false; }
}

onMounted(async () => {
  try { applySettings(await api('/api/settings/ai')); } catch (caught) { error.value = caught.message; } finally { loading.value = false; }
  if (!error.value && keyAvailable.value && form.baseUrl) await loadModels();
});
</script>

<template>
  <div class="form-card">
    <PageHeader
      :title="$t('settings.title')"
      :subtitle="$t('settings.subtitle')"
    />
    <section
      class="card mb-3"
      aria-labelledby="interface-settings-title"
    >
      <div class="card-header">
        <h2
          id="interface-settings-title"
          class="card-title"
        >
          {{ $t('settings.interface.title') }}
        </h2>
      </div>
      <div class="card-body">
        <label
          class="form-label"
          for="interface-language"
        >{{ $t('settings.interface.language') }}</label>
        <!-- The choice applies at once and is kept only in this browser, never on the server. -->
        <select
          id="interface-language"
          class="form-select"
          :value="locale"
          @change="setLocale($event.target.value)"
        >
          <option
            v-for="option in SUPPORTED_LOCALES"
            :key="option.code"
            :value="option.code"
            :lang="option.code"
          >
            {{ option.name }}
          </option>
        </select>
        <div class="form-text">
          {{ $t('settings.interface.languageHelp') }}
        </div>
      </div>
    </section>
    <div
      v-if="error"
      class="alert alert-danger"
      role="alert"
    >
      {{ error }}
    </div>
    <div
      v-if="saved"
      class="alert alert-success"
      role="status"
    >
      {{ $t('settings.ai.saved') }}
    </div>
    <form
      class="card"
      @submit.prevent="save"
    >
      <div class="card-header">
        <h2 class="card-title">
          {{ $t('settings.ai.title') }}
        </h2>
      </div>
      <div class="card-body">
        <div
          v-if="loading"
          class="text-secondary"
        >
          {{ $t('settings.loading') }}
        </div>
        <template v-else>
          <div class="mb-3">
            <label class="form-check form-switch mb-0">
              <input
                v-model="form.enabled"
                class="form-check-input"
                type="checkbox"
                :disabled="!keyAvailable"
              >
              <span class="form-check-label">{{ $t('settings.ai.enable') }}</span>
            </label>
            <div
              v-if="!keyAvailable"
              class="form-text"
            >
              {{ $t('settings.ai.keyNeeded', { provider: providerLabel(preset) }) }}
            </div>
          </div>
          <div class="mb-3">
            <label
              class="form-label"
              for="ai-provider"
            >{{ $t('settings.ai.provider') }}</label>
            <select
              id="ai-provider"
              v-model="form.provider"
              class="form-select"
              @change="chooseProvider"
            >
              <option
                v-for="provider in AI_PROVIDERS"
                :key="provider.id"
                :value="provider.id"
              >
                {{ providerLabel(provider) }}
              </option>
            </select>
            <div class="form-text">
              {{ $t(`settings.ai.providers.${preset.id}.help`) }}
            </div>
          </div>
          <div
            v-if="form.provider === 'custom'"
            class="mb-3"
          >
            <label
              class="form-label"
              for="ai-display-name"
            >{{ $t('settings.ai.displayName') }}</label>
            <input
              id="ai-display-name"
              v-model="form.displayName"
              class="form-control"
              maxlength="60"
              :placeholder="$t('settings.ai.displayNamePlaceholder')"
            >
          </div>
          <div class="mb-3">
            <label
              class="form-label"
              for="ai-base-url"
            >{{ $t('settings.ai.baseUrl') }}</label>
            <input
              id="ai-base-url"
              v-model="form.baseUrl"
              class="form-control"
              type="url"
              required
              maxlength="500"
              :placeholder="preset.defaultBaseUrl || 'http://192.168.1.50:8000/v1'"
            >
            <div class="form-text">
              <i18n-t
                keypath="settings.ai.baseUrlHelp"
                scope="global"
              >
                <template #localhost>
                  <code>localhost</code>
                </template>
                <template #example>
                  <code>http://192.168.1.50:11434/v1</code>
                </template>
              </i18n-t>
            </div>
            <div
              v-if="insecureRemote"
              class="alert alert-warning mt-2 mb-0"
              role="alert"
            >
              {{ $t('settings.ai.insecure') }}
            </div>
          </div>
          <div class="mb-3">
            <label
              class="form-label"
              for="ai-api-key"
            >{{ $t('settings.ai.apiKey') }}</label>
            <input
              id="ai-api-key"
              v-model="form.apiKey"
              class="form-control"
              type="password"
              autocomplete="new-password"
              :placeholder="$t('settings.ai.apiKeyPlaceholder', { provider: providerLabel(preset) })"
            >
            <div class="form-text">
              <span v-if="!preset.apiKeyRequired">{{ $t('settings.ai.keyOptional') }} </span>
              <span v-if="keyBelongsHere">{{ $t('settings.ai.keySaved', { key: maskedKey }) }}</span>
              <span v-else-if="hasApiKey">{{ $t('settings.ai.keyStale') }}</span>
              <span v-else>{{ $t('settings.ai.keyNone') }}</span>
              {{ $t('settings.ai.keyPrivacy') }}
            </div>
          </div>
          <label
            v-if="keyBelongsHere"
            class="form-check mb-3"
          >
            <input
              v-model="form.clearApiKey"
              class="form-check-input"
              type="checkbox"
            >
            <span class="form-check-label">{{ $t('settings.ai.removeKey') }}</span>
          </label>
          <div class="mb-3">
            <button
              class="btn btn-outline-secondary"
              type="button"
              :disabled="testing"
              @click="testConnection"
            >
              {{ testing ? $t('common.testing') : $t('common.testConnection') }}
            </button>
            <div
              v-if="testResult"
              class="alert mt-2 mb-0"
              :class="testResult.ok ? 'alert-success' : 'alert-danger'"
              role="alert"
            >
              {{ testResult.message }}
            </div>
          </div>
          <div class="mb-3">
            <label
              class="form-label"
              for="ai-model"
            >{{ $t('settings.ai.model') }}</label>
            <select
              id="ai-model"
              v-model="selectedModel"
              class="form-select"
              @change="chooseModel"
            >
              <option
                v-for="model in availableModels"
                :key="model.id"
                :value="model.id"
              >
                {{ modelLabel(model) }}
              </option>
              <option value="custom">
                {{ $t('settings.ai.customModelOption') }}
              </option>
            </select>
            <div class="form-text d-flex align-items-center gap-2">
              <span v-if="modelsLoading">{{ $t('settings.ai.modelsLoading') }}</span>
              <span v-else>{{ $t('settings.ai.modelsHelp') }}</span>
              <button
                class="btn btn-link btn-sm p-0"
                type="button"
                :disabled="modelsLoading"
                @click="loadModels"
              >
                {{ $t('settings.ai.refreshModels') }}
              </button>
            </div>
            <div
              v-if="modelError"
              class="alert alert-warning mt-2 mb-0"
              role="alert"
            >
              {{ modelError }}
            </div>
          </div>
          <div
            v-if="selectedModel === 'custom'"
            class="mb-3"
          >
            <label
              class="form-label"
              for="ai-custom-model"
            >{{ $t('settings.ai.customModel') }}</label>
            <input
              id="ai-custom-model"
              v-model="form.model"
              class="form-control"
              required
              maxlength="200"
            >
          </div>
          <div class="mb-3">
            <label
              class="form-label"
              for="ai-image-input"
            >{{ $t('settings.ai.imageInput') }}</label>
            <select
              id="ai-image-input"
              v-model="form.imageInput"
              class="form-select"
            >
              <option value="auto">
                {{ $t('settings.ai.imageAuto') }}
              </option>
              <option value="supported">
                {{ $t('settings.ai.imageSupported') }}
              </option>
              <option value="unsupported">
                {{ $t('settings.ai.imageUnsupported') }}
              </option>
            </select>
            <div class="form-text">
              {{ $t('settings.ai.imageHelp') }}
            </div>
          </div>
        </template>
      </div>
      <div class="card-footer d-flex justify-content-end">
        <button
          class="btn btn-primary"
          :disabled="loading || saving"
        >
          {{ saving ? $t('common.saving') : $t('settings.save') }}
        </button>
      </div>
    </form>
    <CloudBackupSettings />
  </div>
</template>
