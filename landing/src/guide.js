import { createApp } from 'vue';
import '@tabler/core/dist/css/tabler.min.css';
import '@fontsource-variable/geist';
import './landing.css';
import GuidePage from './GuidePage.vue';
import { followLocale, i18n } from './i18n.js';

// The user guide page: the same stylesheet, typeface, and language as the product page.
followLocale('guide.meta');
createApp(GuidePage).use(i18n).mount('#app');
