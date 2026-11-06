<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { IconDatabase } from '@tabler/icons-vue';
import { activeDatabase } from '../activeDatabase.js';
import { capabilities } from '../capabilities.js';
import { can } from '../auth.js';
import { PERMISSIONS } from '../../../shared/permissions.js';

const { t } = useI18n();
const canOpen = can(PERMISSIONS.settingsManage);
// The name is user data: shown as text exactly as stored, never translated.
const name = computed(() => activeDatabase.metadata?.name ?? '');
const placeholder = computed(() => t(activeDatabase.status === 'error' ? 'databaseIndicator.unavailable' : 'databaseIndicator.loading'));
// The tooltip discloses a name the chrome had to truncate.
const tooltip = computed(() => [
  name.value || placeholder.value,
  capabilities.instanceLabel && t('databaseIndicator.instance', { label: capabilities.instanceLabel }),
  canOpen && t('databaseIndicator.open')
].filter(Boolean).join(' · '));
</script>

<template>
  <!-- Opens the existing Settings → Database dialog over the current page, for those who may change it. -->
  <component
    :is="canOpen ? 'RouterLink' : 'span'"
    :to="canOpen ? '/settings/database' : undefined"
    class="app-database-indicator"
    :title="tooltip"
  >
    <IconDatabase
      class="app-database-icon"
      :size="16"
      :stroke-width="1.75"
      aria-hidden="true"
    />
    <span class="visually-hidden">{{ $t('databaseIndicator.label') }}</span>
    <span
      v-if="name"
      class="app-database-name"
    >{{ name }}</span>
    <span
      v-else
      class="app-database-name text-secondary fst-italic"
    >{{ placeholder }}</span>
    <!-- Deployment configuration, not database data: it names the running instance. -->
    <span
      v-if="capabilities.instanceLabel"
      class="badge app-instance-label"
    >
      <span class="visually-hidden">{{ $t('databaseIndicator.instanceLabel') }}</span>
      {{ capabilities.instanceLabel }}
    </span>
  </component>
</template>
