<script setup>
import { IconCheck, IconCopy, IconHelpCircle } from '@tabler/icons-vue';
import { computed, ref, useId } from 'vue';

/*
  Collapsed, in-context help on the sign-in pages: the account command to run on the server ('init'
  for setup, 'recover' for a recovery code) or how to allow sign-in when the server refused plain HTTP
  ('https'). The person chooses their installation; nothing about the server is detected or asked
  from it. The choice is a v-model, so both help panels of one page show the same installation.
*/
const props = defineProps({ topic: { type: String, required: true } });
const deployment = defineModel('deployment', { type: String, default: 'proxmox' });
const id = useId();
const open = ref(false);
const copied = ref(null);
const copyFailed = ref(false);

const DEPLOYMENTS = ['proxmox', 'docker', 'manual'];
const ONE_TIME_CODE_MINUTES = 30;
// Shown as typed in the commands; messages take them as parameters, because vue-i18n reads <…> as HTML.
const PLACEHOLDERS = { ctid: '<CTID>', container: '<container>', username: '<username>' };

const steps = computed(() => {
  if (props.topic === 'https') {
    return {
      proxmox: [
        ['proxmoxEnter', 'pct enter <CTID>'],
        ['proxmoxEnv', 'ATLAS_ALLOW_HTTP=true'],
        ['proxmoxRestart', 'systemctl restart inventory-atlas-lite']
      ],
      // Never a bare `docker rm`: the image declares VOLUME /data, and a container started without
      // -v keeps the inventory in an anonymous volume that a new container would not reuse.
      docker: [
        ['dockerInspect', "docker inspect -f '{{json .Mounts}}' <container>"],
        ['dockerBackup', 'docker exec <container> node server/src/cli/backup.js /data/inventory-backup.sqlite'],
        ['dockerCopy', 'docker cp <container>:/data/inventory-backup.sqlite ./inventory-backup.sqlite'],
        ['dockerRecreate', '-e ATLAS_ALLOW_HTTP=true']
      ],
      manual: [
        ['manualShell', 'ATLAS_ALLOW_HTTP=true npm start'],
        ['manualPowerShell', "$env:ATLAS_ALLOW_HTTP='true'; npm start"]
      ]
    }[deployment.value];
  }
  const action = props.topic === 'recover' ? 'recover <username>' : 'init';
  return {
    proxmox: [
      ['proxmoxList', 'pct list'],
      ['proxmoxHost', `pct exec <CTID> -- /usr/local/sbin/inventory-atlas-auth ${action}`],
      ['proxmoxInside', `inventory-atlas-auth ${action}`]
    ],
    docker: [['dockerHost', `docker exec <container> node server/src/cli/auth.js ${action}`]],
    manual: [['manualRun', `npm run auth -- ${action}`]]
  }[deployment.value];
});
const helpKey = computed(() => (props.topic === 'https' ? 'auth.httpsHelp' : 'auth.commandHelp'));

async function copy(command, event) {
  copyFailed.value = false;
  try {
    await navigator.clipboard.writeText(command);
    copied.value = command;
  } catch {
    // Plain-HTTP pages have no clipboard access: select the command so it can be copied by hand.
    copied.value = null;
    copyFailed.value = true;
    const code = event.currentTarget.closest('.app-sign-in-command').querySelector('code');
    getSelection().selectAllChildren(code);
  }
}
</script>

<template>
  <div class="mb-3">
    <button
      type="button"
      class="btn btn-link p-0 text-decoration-none"
      :aria-expanded="open ? 'true' : 'false'"
      :aria-controls="`${id}-panel`"
      @click="open = !open"
    >
      <IconHelpCircle
        class="icon me-1"
        aria-hidden="true"
      />
      {{ $t(`auth.helpToggle.${topic}`) }}
    </button>
    <div
      v-if="open"
      :id="`${id}-panel`"
      class="app-sign-in-help border rounded p-3 mt-2"
    >
      <template v-if="topic === 'https'">
        <p class="mb-2">
          {{ $t('auth.httpsHelp.proxy') }}
        </p>
        <div
          class="alert alert-warning py-2 mb-3"
          role="note"
        >
          {{ $t('auth.httpsHelp.warning') }}
        </div>
      </template>
      <div
        class="btn-group w-100 mb-3"
        role="radiogroup"
        :aria-label="$t('auth.deployment.label')"
      >
        <template
          v-for="option in DEPLOYMENTS"
          :key="option"
        >
          <input
            :id="`${id}-${option}`"
            v-model="deployment"
            type="radio"
            class="btn-check"
            :name="`${id}-deployment`"
            :value="option"
          >
          <label
            class="btn btn-sm"
            :for="`${id}-${option}`"
          >{{ $t(`auth.deployment.${option}`) }}</label>
        </template>
      </div>
      <template
        v-for="[step, command] in steps"
        :key="step"
      >
        <p class="mb-1">
          {{ $t(`${helpKey}.${step}`, PLACEHOLDERS) }}
        </p>
        <div class="app-sign-in-command d-flex align-items-start gap-2 mb-3">
          <code class="flex-grow-1">{{ command }}</code>
          <button
            type="button"
            class="btn btn-sm btn-ghost-secondary flex-shrink-0"
            :aria-label="$t('auth.copyCommand', { command })"
            @click="copy(command, $event)"
          >
            <component
              :is="copied === command ? IconCheck : IconCopy"
              class="icon me-1"
              aria-hidden="true"
            />
            {{ copied === command ? $t('common.copied') : $t('common.copy') }}
          </button>
        </div>
      </template>
      <p
        class="form-hint mb-0"
        aria-live="polite"
      >
        <template v-if="copyFailed">
          {{ $t('auth.copyFailed') }}
        </template>
        <template v-else-if="copied">
          {{ $t('auth.copiedCommand') }}
        </template>
      </p>
      <p
        v-if="$te(`${helpKey}.${deployment}Note`)"
        class="form-hint mb-0"
      >
        {{ $t(`${helpKey}.${deployment}Note`) }}
      </p>
      <p
        v-if="topic === 'recover'"
        class="form-hint mb-0"
      >
        {{ $t('auth.commandHelp.usernameNote', PLACEHOLDERS) }}
      </p>
      <p
        v-if="topic !== 'https'"
        class="form-hint mt-2 mb-0"
      >
        {{ $t('auth.commandHelp.codeNote', { minutes: ONE_TIME_CODE_MINUTES }) }}
      </p>
    </div>
  </div>
</template>
