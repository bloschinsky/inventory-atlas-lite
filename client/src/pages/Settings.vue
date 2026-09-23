<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { api, jsonOptions } from '../api.js';
import { setAiCapabilities } from '../capabilities.js';
import PageHeader from '../components/PageHeader.vue';
import { AI_PROVIDERS, aiProvider, isLocalNetworkHost } from '../../../shared/aiProviders.js';

defineOptions({ name: 'SettingsPage' });

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
  return model.imageInput === false ? `${model.label} (text only)` : model.label;
}

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
    modelError.value = `Could not load the model list. ${caught.message} You can continue using the configured model or enter a custom model ID.`;
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
      title="Settings"
      subtitle="Configure optional integrations for this installation."
    />
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
      AI settings saved.
    </div>
    <form
      class="card"
      @submit.prevent="save"
    >
      <div class="card-header">
        <h2 class="card-title">
          AI
        </h2>
      </div>
      <div class="card-body">
        <div
          v-if="loading"
          class="text-secondary"
        >
          Loading settings…
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
              <span class="form-check-label">Enable AI features</span>
            </label>
            <div
              v-if="!keyAvailable"
              class="form-text"
            >
              Save an {{ preset.label }} API key below to enable AI features.
            </div>
          </div>
          <div class="mb-3">
            <label
              class="form-label"
              for="ai-provider"
            >Provider</label>
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
                {{ provider.label }}
              </option>
            </select>
            <div class="form-text">
              {{ preset.help }}
            </div>
          </div>
          <div
            v-if="form.provider === 'custom'"
            class="mb-3"
          >
            <label
              class="form-label"
              for="ai-display-name"
            >Display name</label>
            <input
              id="ai-display-name"
              v-model="form.displayName"
              class="form-control"
              maxlength="60"
              placeholder="For example: vLLM on the NAS"
            >
          </div>
          <div class="mb-3">
            <label
              class="form-label"
              for="ai-base-url"
            >Base URL</label>
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
              The Inventory Atlas server connects to this address, not your browser, so
              <code>localhost</code> means the machine or container running Inventory Atlas. For a
              model server on another computer, use its LAN address, for example
              <code>http://192.168.1.50:11434/v1</code>.
            </div>
            <div
              v-if="insecureRemote"
              class="alert alert-warning mt-2 mb-0"
              role="alert"
            >
              This remote address uses plain HTTP, so the API key and your inventory data are sent
              unencrypted. Prefer HTTPS outside your local network.
            </div>
          </div>
          <div class="mb-3">
            <label
              class="form-label"
              for="ai-api-key"
            >API key</label>
            <input
              id="ai-api-key"
              v-model="form.apiKey"
              class="form-control"
              type="password"
              autocomplete="new-password"
              :placeholder="`Enter a new ${preset.label} API key`"
            >
            <div class="form-text">
              <span v-if="!preset.apiKeyRequired">Optional for this provider. </span>
              <span v-if="keyBelongsHere">Saved key: {{ maskedKey }}. Leave this blank to keep it.</span>
              <span v-else-if="hasApiKey">The saved key belongs to the previous provider or base URL and is removed when you save, unless you enter it again.</span>
              <span v-else>No API key is saved.</span>
              The key stays on the server and is never returned to the browser.
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
            <span class="form-check-label">Remove the saved API key</span>
          </label>
          <div class="mb-3">
            <button
              class="btn btn-outline-secondary"
              type="button"
              :disabled="testing"
              @click="testConnection"
            >
              {{ testing ? 'Testing…' : 'Test connection' }}
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
            >Model</label>
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
                Custom model...
              </option>
            </select>
            <div class="form-text d-flex align-items-center gap-2">
              <span v-if="modelsLoading">Loading available models…</span>
              <span v-else>Models reported by the provider for this connection are shown.</span>
              <button
                class="btn btn-link btn-sm p-0"
                type="button"
                :disabled="modelsLoading"
                @click="loadModels"
              >
                Refresh models
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
            >Custom model ID</label>
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
            >Image input</label>
            <select
              id="ai-image-input"
              v-model="form.imageInput"
              class="form-select"
            >
              <option value="auto">
                Detect automatically
              </option>
              <option value="supported">
                Supported by this model
              </option>
              <option value="unsupported">
                Not supported (text only)
              </option>
            </select>
            <div class="form-text">
              AI Add Item needs a vision model to read photos. Automatic detection uses the provider's
              model information where it exists; otherwise the photo is sent and a refusal is reported.
              Choose "Not supported" for a text-only model to hide the photo option.
            </div>
          </div>
        </template>
      </div>
      <div class="card-footer d-flex justify-content-end">
        <button
          class="btn btn-primary"
          :disabled="loading || saving"
        >
          {{ saving ? 'Saving…' : 'Save settings' }}
        </button>
      </div>
    </form>
  </div>
</template>
