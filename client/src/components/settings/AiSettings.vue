<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { api, jsonOptions } from '../../api.js';
import { setAiCapabilities } from '../../capabilities.js';
import { formatDateTime, translateError, translateNotice } from '../../i18n/index.js';
import { AI_PROVIDERS, aiProvider, isLocalNetworkHost } from '../../../../shared/aiProviders.js';

const { t } = useI18n();

const form = reactive({
  enabled: false, provider: 'openai', displayName: '', baseUrl: '', model: 'gpt-5.6-luna', imageInput: 'auto', apiKey: '', clearApiKey: false
});
// The provider and base URL the saved key belongs to: the server drops the key when either changes.
const savedEndpoint = reactive({ provider: '', baseUrl: '' });
const maskedKey = ref('');
const hasApiKey = ref(false);
// The last model list and the connection it belongs to; it is shown only while that still matches.
const catalog = ref(null);
const customModel = ref(false);
const showAllModels = ref(false);
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
// The identity of a model list: another provider, address, or typed key never shows this list.
const connectionKey = () => JSON.stringify([form.provider, trimmedBaseUrl.value, form.apiKey.trim()]);

const currentCatalog = computed(() => (catalog.value?.key === connectionKey() ? catalog.value : null));
const models = computed(() => currentCatalog.value?.models ?? []);
// OpenAI lists arrive grouped; the other providers keep their single list.
const grouped = computed(() => models.value.some(model => model.group));
const modelsIn = group => models.value.filter(model => model.group === group);
const hiddenModels = computed(() => (grouped.value ? modelsIn('other') : []));
const noRecommended = computed(() => grouped.value && hiddenModels.value.length === models.value.length);
const modelGroups = computed(() => {
  if (!grouped.value) return [{ key: 'all', label: '', models: models.value }];
  const groups = [
    { key: 'recommended', label: t('settings.ai.groupRecommended'), models: modelsIn('recommended') },
    { key: 'previous', label: t('settings.ai.groupPrevious'), models: modelsIn('previous') }
  ];
  if (showAllModels.value || noRecommended.value) groups.push({ key: 'other', label: t('settings.ai.groupOther'), models: hiddenModels.value });
  return groups.filter(group => group.models.length);
});

// The configured model always stays selectable, even when the list omits or hides it.
const selectedListed = computed(() => models.value.find(model => model.id === form.model) ?? null);
const selectedShown = computed(() => modelGroups.value.some(group => group.models.some(model => model.id === form.model)));
const modelChoice = computed({
  get: () => (customModel.value ? 'custom' : form.model),
  set: value => {
    customModel.value = value === 'custom';
    if (value !== 'custom') form.model = value;
  }
});

function modelLabel(model) {
  const label = model.verified ? t('settings.ai.verifiedModel', { model: model.label }) : model.label;
  return model.imageInput === false ? t('settings.ai.textOnlyModel', { model: label }) : label;
}

const selectedLabel = computed(() => {
  if (selectedListed.value) return modelLabel(selectedListed.value);
  return currentCatalog.value?.models.length ? t('settings.ai.notListedModel', { model: form.model }) : form.model;
});

const capabilityText = value => t(value === true ? 'settings.ai.capabilitySupported' : value === false ? 'settings.ai.capabilityUnsupported' : 'settings.ai.capabilityUnknown');

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
  customModel.value = false;
}

// A preset fills in its default address; the list of another provider's models no longer applies.
function chooseProvider() {
  form.baseUrl = preset.value.defaultBaseUrl;
  catalog.value = null;
  showAllModels.value = false;
  modelError.value = '';
  testResult.value = null;
}

// A list never changes the chosen model: a refresh only changes what can be chosen.
function showModels(key, list) {
  catalog.value = {
    key,
    models: list.models,
    fetchedAt: list.fetchedAt ?? null,
    staleReason: list.stale ? translateError(list.error) : ''
  };
}

// `refresh` asks the server to bypass its cached list of this connection.
async function loadModels(refresh = false) {
  const key = connectionKey();
  modelsLoading.value = true;
  modelError.value = '';
  try {
    showModels(key, await api('/api/ai/models', jsonOptions('POST', { ...connectionForm(), refresh })));
  } catch (caught) {
    // A list already shown for this connection stays, marked as not refreshed.
    if (catalog.value?.key === key) catalog.value = { ...catalog.value, staleReason: caught.message };
    else modelError.value = t('settings.ai.modelsFailed', { reason: caught.message });
  } finally {
    modelsLoading.value = false;
  }
}

async function testConnection() {
  const key = connectionKey();
  testing.value = true;
  testResult.value = null;
  try {
    const result = await api('/api/ai/test', jsonOptions('POST', connectionForm()));
    testResult.value = { ok: true, message: translateNotice(result.notice) };
    if (result.models.length) { modelError.value = ''; showModels(key, result); }
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
  <!-- One form across the cards: a single Save keeps the switch, the connection, and the model consistent. -->
  <form
    aria-labelledby="ai-settings-title"
    @submit.prevent="save"
  >
    <h2
      id="ai-settings-title"
      class="mb-3"
    >
      {{ $t('settings.ai.title') }}
    </h2>
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
    <div
      v-if="loading"
      class="card mb-3"
    >
      <div class="card-body text-secondary">
        {{ $t('settings.loading') }}
      </div>
    </div>
    <template v-else>
      <section class="card mb-3">
        <div class="card-header">
          <h3 class="card-title">
            {{ $t('settings.ai.featuresTitle') }}
          </h3>
        </div>
        <div class="card-body">
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
      </section>
      <section class="card mb-3">
        <div class="card-header">
          <h3 class="card-title">
            {{ $t('settings.ai.connectionTitle') }}
          </h3>
        </div>
        <div class="card-body">
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
      </section>
      <section class="card mb-3">
        <div class="card-header">
          <h3 class="card-title">
            {{ $t('settings.ai.modelTitle') }}
          </h3>
        </div>
        <div class="card-body">
          <div class="mb-3">
            <label
              class="form-label"
              for="ai-model"
            >{{ $t('settings.ai.model') }}</label>
            <select
              id="ai-model"
              v-model="modelChoice"
              class="form-select"
              aria-describedby="ai-model-details ai-model-status"
            >
              <option
                v-if="!customModel && !selectedShown"
                :value="form.model"
              >
                {{ selectedLabel }}
              </option>
              <template
                v-for="group in modelGroups"
                :key="group.key"
              >
                <optgroup
                  v-if="group.label"
                  :label="group.label"
                >
                  <option
                    v-for="model in group.models"
                    :key="model.id"
                    :value="model.id"
                    :title="model.id"
                  >
                    {{ modelLabel(model) }}
                  </option>
                </optgroup>
                <template v-else>
                  <option
                    v-for="model in group.models"
                    :key="model.id"
                    :value="model.id"
                    :title="model.id"
                  >
                    {{ modelLabel(model) }}
                  </option>
                </template>
              </template>
              <option value="custom">
                {{ $t('settings.ai.customModelOption') }}
              </option>
            </select>
            <div
              v-if="!customModel"
              id="ai-model-details"
              class="form-text"
            >
              <div class="d-flex flex-wrap align-items-center gap-2">
                <i18n-t
                  keypath="settings.ai.modelId"
                  scope="global"
                  tag="span"
                  class="text-break"
                >
                  <template #id>
                    <code>{{ form.model }}</code>
                  </template>
                </i18n-t>
                <span
                  v-if="selectedListed?.verified"
                  class="badge bg-green-lt text-wrap text-start"
                >{{ $t('settings.ai.modelVerified') }}</span>
              </div>
              <div v-if="selectedListed">
                {{ $t('settings.ai.capabilityVision', { value: capabilityText(selectedListed.imageInput) }) }} ·
                {{ $t('settings.ai.capabilityStructured', { value: capabilityText(selectedListed.structuredOutput) }) }}
              </div>
              <div v-if="form.imageInput !== 'auto'">
                {{ $t('settings.ai.imageOverride') }}
              </div>
            </div>
            <div
              v-if="!customModel && !selectedListed && models.length"
              class="alert alert-warning py-2 mt-2 mb-0"
            >
              {{ $t('settings.ai.modelNotListed') }}
            </div>
            <div class="d-flex flex-wrap align-items-center gap-2 mt-2">
              <button
                v-if="hiddenModels.length && !noRecommended"
                class="btn btn-sm btn-outline-secondary"
                type="button"
                @click="showAllModels = !showAllModels"
              >
                {{ showAllModels ? $t('settings.ai.showFewerModels') : $t('settings.ai.showAllModels', { count: hiddenModels.length }) }}
              </button>
              <button
                class="btn btn-sm btn-outline-secondary"
                type="button"
                :disabled="modelsLoading"
                @click="loadModels(true)"
              >
                <span
                  v-if="modelsLoading"
                  class="spinner-border spinner-border-sm me-1"
                  aria-hidden="true"
                />
                {{ $t('settings.ai.refreshModels') }}
              </button>
            </div>
            <div
              id="ai-model-status"
              class="form-text"
              aria-live="polite"
            >
              <template v-if="modelsLoading">
                {{ $t('settings.ai.modelsLoading') }}
              </template>
              <template v-else-if="currentCatalog">
                <template v-if="currentCatalog.fetchedAt">
                  {{ $t('settings.ai.modelsChecked', { time: formatDateTime(currentCatalog.fetchedAt) }) }}
                </template>
                {{ $t('settings.ai.modelsOffered', models.length) }}
                <template v-if="!models.length">
                  {{ $t('settings.ai.modelsEmpty') }}
                </template>
                <template v-else-if="noRecommended">
                  {{ $t('settings.ai.modelsNoRecommended') }}
                </template>
              </template>
              <template v-else-if="catalog">
                {{ $t('settings.ai.modelsConnectionChanged') }}
              </template>
              <template v-else>
                {{ $t('settings.ai.modelsHelp') }}
              </template>
            </div>
            <div
              v-if="currentCatalog?.staleReason"
              class="alert alert-warning mt-2 mb-0"
              role="alert"
            >
              {{ $t('settings.ai.modelsStale', { reason: currentCatalog.staleReason, time: currentCatalog.fetchedAt ? formatDateTime(currentCatalog.fetchedAt) : '—' }) }}
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
            v-if="customModel"
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
              aria-describedby="ai-custom-model-help"
            >
            <div
              id="ai-custom-model-help"
              class="form-text"
            >
              {{ $t('settings.ai.customModelUnknown') }}
            </div>
          </div>
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
      </section>
    </template>
    <div class="d-flex justify-content-end">
      <button
        class="btn btn-primary"
        :disabled="loading || saving"
      >
        {{ saving ? $t('common.saving') : $t('settings.save') }}
      </button>
    </div>
  </form>
</template>
