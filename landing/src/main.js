import { createApp } from 'vue';
import '@tabler/core/dist/css/tabler.min.css';
// The landing typeface, bundled from npm with the page; the application keeps Tabler's system fonts.
import '@fontsource-variable/geist';
import './landing.css';
import App from './App.vue';

createApp(App).mount('#app');
