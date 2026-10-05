<script setup>
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

/*
  The OAuth app credentials of one cloud storage provider. The saved secret is never sent back by the
  server: the form only knows whether one exists and its last four characters, and a blank secret
  field keeps it.
*/
const props = defineProps({
  provider: { type: Object, required: true },
  busy: { type: Boolean, default: false }
});
const emit = defineEmits(['save', 'remove']);
const { t } = useI18n();

const clientId = ref('');
const clientSecret = ref('');
const app = computed(() => props.provider.app);
const idChanged = computed(() => clientId.value.trim() !== app.value.clientId);
const savedSecretApplies = computed(() => app.value.hasClientSecret && !idChanged.value);
const fieldId = name => `cloud-${props.provider.id}-${name}`;
// The server names the two credentials the way each provider does ("app key", "client ID"); the
// interface shows them through translation keys chosen by provider.
const idLabel = computed(() => t(`cloud.apps.${props.provider.id}.id`));
const secretLabel = computed(() => t(`cloud.apps.${props.provider.id}.secret`));

watch(app, value => {
  clientId.value = value.clientId;
  clientSecret.value = '';
}, { immediate: true });

const save = () => emit('save', { clientId: clientId.value.trim(), clientSecret: clientSecret.value.trim() });
</script>

<template>
  <p
    v-if="app.source === 'environment'"
    class="meta-text mb-0"
  >
    <i18n-t
      keypath="cloud.fromEnvironment"
      scope="global"
    >
      <template #settings>
        <code>{{ provider.requiredSettings.join(', ') }}</code>
      </template>
    </i18n-t>
    {{ provider.label }} {{ idLabel }}: <code class="text-break">{{ app.clientId }}</code>.
  </p>
  <form
    v-else
    @submit.prevent="save"
  >
    <div class="mb-2">
      <label
        class="form-label"
        :for="fieldId('client-id')"
      >{{ provider.label }} {{ idLabel }}</label>
      <input
        :id="fieldId('client-id')"
        v-model="clientId"
        class="form-control"
        required
        maxlength="200"
        autocomplete="off"
        spellcheck="false"
        :disabled="provider.connected"
      >
      <div
        v-if="provider.connected"
        class="form-text"
      >
        {{ $t('cloud.disconnectToChange', { provider: provider.label }) }}
      </div>
    </div>
    <div class="mb-3">
      <label
        class="form-label"
        :for="fieldId('client-secret')"
      >{{ provider.label }} {{ secretLabel }}</label>
      <input
        :id="fieldId('client-secret')"
        v-model="clientSecret"
        class="form-control"
        type="password"
        maxlength="200"
        autocomplete="new-password"
        :placeholder="$t('cloud.secretPlaceholder', { secret: secretLabel })"
      >
      <div class="form-text">
        <span v-if="savedSecretApplies">{{ $t('cloud.secretSaved', { secret: secretLabel, masked: app.clientSecretMasked }) }}</span>
        <span v-else-if="app.hasClientSecret">{{ $t('cloud.secretStale', { secret: secretLabel, id: idLabel }) }}</span>
        <span v-else-if="!app.secretRequired">{{ $t('cloud.secretOptional', { provider: provider.label }) }}</span>
        <span v-else>{{ $t('cloud.secretNone', { secret: secretLabel }) }}</span>
        {{ $t('cloud.secretPrivacy') }}
      </div>
    </div>
    <div class="d-flex flex-wrap gap-2">
      <button
        class="btn btn-outline-primary"
        :disabled="busy"
        :aria-label="$t('cloud.saveAppFor', { provider: provider.label })"
      >
        {{ $t('cloud.saveApp') }}
      </button>
      <button
        v-if="app.source === 'settings'"
        class="btn btn-outline-danger"
        type="button"
        :disabled="busy || provider.connected"
        :aria-label="$t('cloud.removeAppFor', { provider: provider.label })"
        @click="emit('remove')"
      >
        {{ $t('cloud.remove') }}
      </button>
    </div>
  </form>
</template>
