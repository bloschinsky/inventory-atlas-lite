<script setup>
import { appInfo } from '../build-info.js';

// Stands in for a feature the public demo cannot offer, because it needs the self-hosted server.
</script>

<template>
  <section
    class="card mb-3"
    aria-labelledby="demo-unavailable-title"
  >
    <div class="card-body">
      <h2
        id="demo-unavailable-title"
        class="card-title"
      >
        {{ $t('demo.unavailableTitle') }}
      </h2>
      <p class="meta-text">
        {{ $t('demo.unavailableText') }}
      </p>
      <a
        class="btn btn-primary"
        :href="appInfo.repositoryUrl"
      >{{ $t('demo.get') }}</a>
    </div>
  </section>
</template>
