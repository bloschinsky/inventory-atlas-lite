<script setup>
import { computed, nextTick, onBeforeUnmount, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { IconCheck, IconLanguage } from '@tabler/icons-vue';
import { SUPPORTED_LOCALES } from '../../client/src/i18n/core.js';
import { setLocale } from './i18n.js';

/*
  The language dropdown of the navigation: a menu button with one radio item per supported locale,
  named in its own language as in the application's settings, so it grows with the locale list. It
  follows the menu button pattern: Enter, Space, or the arrow keys open it on the chosen language,
  the arrow keys, Home, and End move between languages, Escape closes it back onto the button, and
  Tab or a click elsewhere closes it.
*/
const { locale, t } = useI18n();
const current = computed(() => SUPPORTED_LOCALES.find(option => option.code === locale.value));
const open = ref(false);
const root = ref(null);
const button = ref(null);
const options = ref([]);

function focusOption(index) {
  const count = SUPPORTED_LOCALES.length;
  options.value[(index + count) % count]?.focus();
}
const focusedIndex = () => options.value.indexOf(document.activeElement);

async function show(index = SUPPORTED_LOCALES.indexOf(current.value)) {
  open.value = true;
  document.addEventListener('pointerdown', onOutside);
  await nextTick();
  focusOption(index);
}
function hide(returnFocus = false) {
  open.value = false;
  document.removeEventListener('pointerdown', onOutside);
  if (returnFocus) button.value.focus();
}
const onOutside = event => { if (!root.value.contains(event.target)) hide(); };
onBeforeUnmount(() => document.removeEventListener('pointerdown', onOutside));

function onButtonKeydown(event) {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    show(event.key === 'ArrowUp' ? SUPPORTED_LOCALES.length - 1 : undefined);
  }
}

function onMenuKeydown(event) {
  const moves = { ArrowDown: focusedIndex() + 1, ArrowUp: focusedIndex() - 1, Home: 0, End: SUPPORTED_LOCALES.length - 1 };
  if (event.key in moves) {
    event.preventDefault();
    focusOption(moves[event.key]);
  } else if (event.key === 'Escape') {
    event.preventDefault();
    hide(true);
  } else if (event.key === 'Tab') {
    hide();
  }
}

function choose(code) {
  setLocale(code);
  hide(true);
}
</script>

<template>
  <div
    ref="root"
    class="dropdown"
  >
    <button
      ref="button"
      type="button"
      class="btn btn-outline-secondary"
      aria-haspopup="menu"
      :aria-expanded="String(open)"
      aria-controls="landing-language-menu"
      :aria-label="t('nav.languageCurrent', { language: current.name })"
      @click="open ? hide() : show()"
      @keydown="onButtonKeydown"
    >
      <IconLanguage
        class="icon"
        aria-hidden="true"
      />
      <span
        class="landing-language-name"
        :lang="current.code"
      >{{ current.name }}</span>
    </button>
    <div
      v-show="open"
      id="landing-language-menu"
      class="dropdown-menu dropdown-menu-end show"
      data-bs-popper="static"
      role="menu"
      :aria-label="t('nav.language')"
      @keydown="onMenuKeydown"
    >
      <button
        v-for="option in SUPPORTED_LOCALES"
        :key="option.code"
        ref="options"
        type="button"
        class="dropdown-item d-flex align-items-center gap-2"
        :class="{ active: option.code === locale }"
        role="menuitemradio"
        :aria-checked="String(option.code === locale)"
        :lang="option.code"
        tabindex="-1"
        @click="choose(option.code)"
      >
        <IconCheck
          class="icon"
          :class="{ invisible: option.code !== locale }"
          aria-hidden="true"
        />
        {{ option.name }}
      </button>
    </div>
  </div>
</template>
