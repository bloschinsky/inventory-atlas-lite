<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { UPDATE_PHASES } from '../../../shared/updateSteps.js';
import {
  cancelUpdate, checkForUpdates, confirmUpdate, message, phase, progress, release, stage, startUpdate,
  startedAt, step, unreachableSince
} from '../update.js';

const { t } = useI18n();
const HINT_INTERVAL_MS = 4000;
// A restart takes seconds; a backend that stays silent this long deserves a word to the user.
const SILENCE_WARNING_MS = 3 * 60 * 1000;

// One clock for the elapsed time, the silence warning, and the rotating hints.
const now = ref(Date.now());
let ticker;
onMounted(() => { ticker = setInterval(() => { now.value = Date.now(); }, 1000); });
onBeforeUnmount(() => clearInterval(ticker));

const duration = since => {
  const seconds = Math.max(0, Math.floor((now.value - since) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};
const elapsed = computed(() => (startedAt.value ? duration(startedAt.value) : ''));
const silentFor = computed(() => (unreachableSince.value && now.value - unreachableSince.value >= SILENCE_WARNING_MS
  ? duration(unreachableSince.value)
  : ''));
const hint = computed(() => {
  const count = step.value?.hints?.length;
  return count ? t(`update.steps.${step.value.id}.hints.${Math.floor(now.value / HINT_INTERVAL_MS) % count}`) : '';
});
const messageText = computed(() => (message.value?.key ? t(message.value.key, message.value.params) : message.value?.text ?? ''));
// The shared phase names are identifiers such as "Back up"; their keys drop the space.
const phaseLabel = name => t(`update.phases.${name.toLowerCase().replace(/\s+/g, '')}`);

// Deployments that cannot update themselves say why, so the answer is not mistaken for a failure.
const unsupported = computed(() => t(release.value?.deploymentType === 'docker' ? 'update.unsupportedDocker' : 'update.unsupported'));
</script>

<template>
  <div class="app-about-update mt-3 pt-3">
    <template v-if="phase === 'idle' || phase === 'error'">
      <button
        type="button"
        class="btn btn-outline-primary w-100"
        @click="checkForUpdates()"
      >
        {{ $t('update.check') }}
      </button>
      <p
        v-if="phase === 'error'"
        class="text-danger mt-2 mb-0"
        role="alert"
      >
        {{ messageText }}
      </p>
    </template>

    <p
      v-else-if="phase === 'checking'"
      class="mb-0 text-secondary"
      role="status"
    >
      {{ $t('update.checking') }}
    </p>

    <p
      v-else-if="phase === 'current'"
      class="mb-0"
      role="status"
    >
      {{ $t('update.current') }}
    </p>

    <template v-else-if="phase === 'available'">
      <p class="mb-2">
        {{ $t('update.available', { version: release.latestVersion }) }}
      </p>
      <button
        v-if="release.canSelfUpdate"
        type="button"
        class="btn btn-primary w-100"
        @click="confirmUpdate()"
      >
        {{ $t('update.updateTo', { version: release.latestVersion }) }}
      </button>
      <template v-else>
        <p class="text-secondary mb-2">
          {{ unsupported }}
        </p>
        <a
          v-if="release.releaseUrl"
          class="btn btn-outline-secondary w-100"
          :href="release.releaseUrl"
          target="_blank"
          rel="noopener noreferrer"
        >
          {{ $t('update.viewRelease') }}
        </a>
      </template>
    </template>

    <!-- The confirmation step replaces the panel rather than stacking a second modal on this one. -->
    <template v-else-if="phase === 'confirm'">
      <p class="fw-bold mb-1">
        {{ $t('update.confirmTitle') }}
      </p>
      <p class="mb-2">
        {{ release.currentVersion }} &rarr; {{ release.latestVersion }}
      </p>
      <p class="text-secondary mb-3">
        {{ $t('update.confirmText') }}
      </p>
      <div class="btn-list justify-content-center">
        <button
          type="button"
          class="btn"
          @click="cancelUpdate()"
        >
          {{ $t('common.cancel') }}
        </button>
        <button
          type="button"
          class="btn btn-primary"
          @click="startUpdate()"
        >
          {{ $t('update.update') }}
        </button>
      </div>
    </template>

    <template v-else-if="phase === 'updating'">
      <ol
        class="steps steps-counter app-update-phases mb-3"
        :aria-label="$t('update.phasesLabel')"
      >
        <li
          v-for="name in UPDATE_PHASES"
          :key="name"
          class="step-item"
          :class="{ active: name === stage }"
          :aria-current="name === stage ? 'step' : undefined"
        >
          {{ phaseLabel(name) }}
        </li>
      </ol>
      <p
        class="mb-1"
        role="status"
      >
        {{ $t(progress) }}...
      </p>
      <p class="small text-secondary mb-2 app-update-hint">
        {{ hint }}
      </p>
      <div class="progress progress-sm mb-1">
        <div class="progress-bar progress-bar-indeterminate" />
      </div>
      <p class="small text-secondary text-end mb-2">
        {{ $t('update.elapsed', { time: elapsed }) }}
      </p>
      <p
        v-if="silentFor"
        class="small text-warning"
        role="alert"
      >
        {{ $t('update.silent', { time: silentFor }) }}
      </p>
      <p class="text-secondary mb-0">
        {{ $t('update.restartNotice') }}
      </p>
    </template>

    <template v-else-if="phase === 'done'">
      <p
        class="mb-1"
        role="status"
      >
        {{ $t('update.done') }}
      </p>
      <p class="text-secondary mb-0">
        {{ messageText }}
      </p>
    </template>

    <template v-else>
      <p
        class="text-danger mb-1"
        role="alert"
      >
        {{ $t('update.failed') }}
      </p>
      <p class="text-secondary">
        {{ messageText }}
      </p>
      <button
        type="button"
        class="btn w-100"
        @click="checkForUpdates()"
      >
        {{ $t('update.check') }}
      </button>
    </template>
  </div>
</template>
