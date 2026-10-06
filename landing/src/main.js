import { createApp } from 'vue';
import '@tabler/core/dist/css/tabler.min.css';
// The landing typeface, bundled from npm with the page; the application keeps Tabler's system fonts.
import '@fontsource-variable/geist';
import './landing.css';
import App from './App.vue';
import { followLocale, i18n } from './i18n.js';

followLocale('meta');
createApp(App).use(i18n).mount('#app');
