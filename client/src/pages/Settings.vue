<script setup>
import { onMounted, reactive, ref } from 'vue';
import { api, jsonOptions } from '../api.js';
import { setAiEnabled } from '../capabilities.js';
import PageHeader from '../components/PageHeader.vue';

defineOptions({ name: 'SettingsPage' });

const form = reactive({ enabled: false, provider: 'openai', model: 'gpt-5.6-luna', apiKey: '', clearApiKey: false });
const maskedKey = ref('');
const hasApiKey = ref(false);
const availableModels = ref([]);
const selectedModel = ref('custom');
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const modelError = ref('');
const modelsLoading = ref(false);
const saved = ref(false);

function syncSelectedModel() {
  selectedModel.value = availableModels.value.some(model => model.id === form.model) ? form.model : 'custom';
}

function applySettings(settings) {
  // The saved state is the source of truth for AI visibility, so an unsaved checkbox changes nothing.
  setAiEnabled(settings.enabled);
  form.enabled = settings.enabled;
  form.provider = settings.provider;
  form.model = settings.model;
  form.apiKey = '';
  form.clearApiKey = false;
  hasApiKey.value = settings.hasApiKey;
  maskedKey.value = settings.apiKeyMasked;
  syncSelectedModel();
}

function chooseModel() {
  if (selectedModel.value !== 'custom') form.model = selectedModel.value;
}

async function loadModels() {
  modelsLoading.value = true;
  modelError.value = '';
  try {
    availableModels.value = (await api('/api/ai/models')).models;
  } catch (caught) {
    availableModels.value = [];
    modelError.value = `Could not load available OpenAI models. ${caught.message} You can continue using the configured model or enter a custom model ID.`;
  } finally {
    syncSelectedModel();
    modelsLoading.value = false;
  }
}

async function save() {
  saving.value = true; error.value = ''; saved.value = false;
  const apiKeyChanged = Boolean(form.apiKey.trim()) || form.clearApiKey;
  try {
    const settings = await api('/api/settings/ai', jsonOptions('PUT', form));
    applySettings(settings);
    saved.value = true;
    if (apiKeyChanged) await loadModels();
  } catch (caught) { error.value = caught.message; } finally { saving.value = false; }
}

onMounted(async () => {
  try { applySettings(await api('/api/settings/ai')); } catch (caught) { error.value = caught.message; } finally { loading.value = false; }
  if (!error.value) await loadModels();
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
          <label class="form-check form-switch mb-3">
            <input
              v-model="form.enabled"
              class="form-check-input"
              type="checkbox"
            >
            <span class="form-check-label">Enable AI features</span>
          </label>
          <div class="mb-3">
            <label
              class="form-label"
              for="ai-provider"
            >Provider</label>
            <select
              id="ai-provider"
              v-model="form.provider"
              class="form-select"
            >
              <option value="openai">
                OpenAI
              </option>
            </select>
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
                {{ model.label }}
              </option>
              <option value="custom">
                Custom model...
              </option>
            </select>
            <div class="form-text d-flex align-items-center gap-2">
              <span v-if="modelsLoading">Loading available models…</span>
              <span v-else>Only models available to this API key are shown.</span>
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
              maxlength="100"
            >
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
              placeholder="Enter a new OpenAI API key"
            >
            <div class="form-text">
              <span v-if="hasApiKey">Saved key: {{ maskedKey }}. Leave this blank to keep it.</span>
              <span v-else>No API key is saved.</span>
              The key stays on the server and is never returned to the browser.
            </div>
          </div>
          <label
            v-if="hasApiKey"
            class="form-check"
          >
            <input
              v-model="form.clearApiKey"
              class="form-check-input"
              type="checkbox"
            >
            <span class="form-check-label">Remove the saved API key</span>
          </label>
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
