<script setup>
import { computed, ref, watch } from 'vue';

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

const clientId = ref('');
const clientSecret = ref('');
const app = computed(() => props.provider.app);
const idChanged = computed(() => clientId.value.trim() !== app.value.clientId);
const savedSecretApplies = computed(() => app.value.hasClientSecret && !idChanged.value);
const fieldId = name => `cloud-${props.provider.id}-${name}`;

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
    The app credentials come from the server environment
    (<code>{{ provider.requiredSettings.join(', ') }}</code>) and can only be changed there.
    {{ provider.label }} {{ app.idLabel }}: <code class="text-break">{{ app.clientId }}</code>.
  </p>
  <form
    v-else
    @submit.prevent="save"
  >
    <div class="mb-2">
      <label
        class="form-label"
        :for="fieldId('client-id')"
      >{{ provider.label }} {{ app.idLabel }}</label>
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
        Disconnect {{ provider.label }} to use another app.
      </div>
    </div>
    <div class="mb-3">
      <label
        class="form-label"
        :for="fieldId('client-secret')"
      >{{ provider.label }} {{ app.secretLabel }}</label>
      <input
        :id="fieldId('client-secret')"
        v-model="clientSecret"
        class="form-control"
        type="password"
        maxlength="200"
        autocomplete="new-password"
        :placeholder="`Enter a new ${app.secretLabel}`"
      >
      <div class="form-text">
        <span v-if="savedSecretApplies">Saved {{ app.secretLabel }}: {{ app.clientSecretMasked }}. Leave this blank to keep it.</span>
        <span v-else-if="app.hasClientSecret">The saved {{ app.secretLabel }} belongs to the previous {{ app.idLabel }} and is removed when you save, unless you enter it again.</span>
        <span v-else-if="!app.secretRequired">Optional for {{ provider.label }}.</span>
        <span v-else>No {{ app.secretLabel }} is saved.</span>
        It stays on the server and is never returned to the browser.
      </div>
    </div>
    <div class="d-flex flex-wrap gap-2">
      <button
        class="btn btn-outline-primary"
        :disabled="busy"
        :aria-label="`Save ${provider.label} app credentials`"
      >
        Save app credentials
      </button>
      <button
        v-if="app.source === 'settings'"
        class="btn btn-outline-danger"
        type="button"
        :disabled="busy || provider.connected"
        :aria-label="`Remove ${provider.label} app credentials`"
        @click="emit('remove')"
      >
        Remove
      </button>
    </div>
  </form>
</template>
