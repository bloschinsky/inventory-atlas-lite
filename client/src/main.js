import { createApp } from 'vue';
import { createRouter, createWebHistory } from 'vue-router';
import '@tabler/core/dist/css/tabler.min.css';
import './style.css';
import App from './App.vue';
import { i18n } from './i18n/index.js';
import { capabilities, loadCapabilities } from './capabilities.js';
import ItemsList from './pages/ItemsList.vue';
import ItemDetails from './pages/ItemDetails.vue';
import ItemForm from './pages/ItemForm.vue';
import Categories from './pages/Categories.vue';
import DataBackup from './pages/DataBackup.vue';
import Dashboard from './pages/Dashboard.vue';
import AIAddItem from './pages/AIAddItem.vue';
import Settings from './pages/Settings.vue';
import ScanQr from './pages/ScanQr.vue';
import PrintLabels from './pages/PrintLabels.vue';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/dashboard' },
    { path: '/dashboard', component: Dashboard },
    { path: '/items', component: ItemsList },
    { path: '/items/ai', component: AIAddItem },
    { path: '/items/new', component: ItemForm },
    { path: '/items/:id', component: ItemDetails },
    { path: '/items/:id/edit', component: ItemForm },
    { path: '/scan', component: ScanQr },
    { path: '/labels/print', component: PrintLabels },
    { path: '/categories', component: Categories },
    { path: '/data', component: DataBackup },
    { path: '/settings', component: Settings }
  ]
});

// Hidden buttons alone are not enough: the AI page must also be unreachable by typing its URL.
router.beforeEach(async to => {
  if (to.path !== '/items/ai') return true;
  await loadCapabilities();
  return capabilities.ai.enabled ? true : '/items';
});

loadCapabilities();
createApp(App).use(i18n).use(router).mount('#app');
