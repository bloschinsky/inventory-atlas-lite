<script setup>
import { computed } from 'vue';
import {
  cancelUpdate, checkForUpdates, confirmUpdate, message, phase, progress, release, startUpdate
} from '../update.js';

// Deployments that cannot update themselves say why, so the answer is not mistaken for a failure.
const unsupported = computed(() => (release.value?.deploymentType === 'docker'
  ? 'This Docker installation cannot update itself automatically. Update the container from the Docker host.'
  : 'This installation cannot update itself automatically.'));
</script>

<template>
  <div class="app-about-update mt-3 pt-3">
    <template v-if="phase === 'idle' || phase === 'error'">
      <button
        type="button"
        class="btn btn-outline-primary w-100"
        @click="checkForUpdates()"
      >
        Check for updates
      </button>
      <p
        v-if="phase === 'error'"
        class="text-danger mt-2 mb-0"
        role="alert"
      >
        {{ message }}
      </p>
    </template>

    <p
      v-else-if="phase === 'checking'"
      class="mb-0 text-secondary"
      role="status"
    >
      Checking for updates...
    </p>

    <p
      v-else-if="phase === 'current'"
      class="mb-0"
      role="status"
    >
      Inventory Atlas Lite is up to date.
    </p>

    <template v-else-if="phase === 'available'">
      <p class="mb-2">
        New version available: {{ release.latestVersion }}
      </p>
      <button
        v-if="release.canSelfUpdate"
        type="button"
        class="btn btn-primary w-100"
        @click="confirmUpdate()"
      >
        Update to {{ release.latestVersion }}
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
          View release
        </a>
      </template>
    </template>

    <!-- The confirmation step replaces the panel rather than stacking a second modal on this one. -->
    <template v-else-if="phase === 'confirm'">
      <p class="fw-bold mb-1">
        Update Inventory Atlas Lite
      </p>
      <p class="mb-2">
        {{ release.currentVersion }} &rarr; {{ release.latestVersion }}
      </p>
      <p class="text-secondary mb-3">
        A database backup will be created automatically. The application may be temporarily
        unavailable.
      </p>
      <div class="btn-list justify-content-center">
        <button
          type="button"
          class="btn"
          @click="cancelUpdate()"
        >
          Cancel
        </button>
        <button
          type="button"
          class="btn btn-primary"
          @click="startUpdate()"
        >
          Update
        </button>
      </div>
    </template>

    <template v-else-if="phase === 'updating'">
      <p
        class="mb-2"
        role="status"
      >
        {{ progress }}...
      </p>
      <div class="progress progress-sm mb-2">
        <div class="progress-bar progress-bar-indeterminate" />
      </div>
      <p class="text-secondary mb-0">
        The application restarts during the update. This page waits for it.
      </p>
    </template>

    <template v-else-if="phase === 'done'">
      <p
        class="mb-1"
        role="status"
      >
        Update completed successfully.
      </p>
      <p class="text-secondary mb-0">
        {{ message }}
      </p>
    </template>

    <template v-else>
      <p
        class="text-danger mb-1"
        role="alert"
      >
        Update failed.
      </p>
      <p class="text-secondary">
        {{ message }}
      </p>
      <button
        type="button"
        class="btn w-100"
        @click="checkForUpdates()"
      >
        Check for updates
      </button>
    </template>
  </div>
</template>
