<script setup>
import { useI18n } from 'vue-i18n';
import { SUPPORTED_LOCALES, setLocale } from '../../i18n/index.js';

const { locale } = useI18n();
</script>

<template>
  <section
    class="card"
    aria-labelledby="interface-settings-title"
  >
    <div class="card-header">
      <h2
        id="interface-settings-title"
        class="card-title"
      >
        {{ $t('settings.interface.title') }}
      </h2>
    </div>
    <div class="card-body">
      <label
        class="form-label"
        for="interface-language"
      >{{ $t('settings.interface.language') }}</label>
      <!-- The choice applies at once and is kept only in this browser, never on the server. -->
      <select
        id="interface-language"
        class="form-select"
        :value="locale"
        @change="setLocale($event.target.value)"
      >
        <option
          v-for="option in SUPPORTED_LOCALES"
          :key="option.code"
          :value="option.code"
          :lang="option.code"
        >
          {{ option.name }}
        </option>
      </select>
      <div class="form-text">
        {{ $t('settings.interface.languageHelp') }}
      </div>
    </div>
  </section>
</template>
