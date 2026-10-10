import { createApp } from 'vue';
import { createRouter, createWebHashHistory, createWebHistory } from 'vue-router';
import '@tabler/core/dist/css/tabler.min.css';
import './style.css';
import App from './App.vue';
import { i18n } from './i18n/index.js';
import { capabilities, loadCapabilities } from './capabilities.js';
import ItemsList from './pages/ItemsList.vue';
import ItemDetails from './pages/ItemDetails.vue';
import ItemForm from './pages/ItemForm.vue';
import ItemHistory from './pages/ItemHistory.vue';
import Hierarchy from './pages/Hierarchy.vue';
import Categories from './pages/Categories.vue';
import DataBackup from './pages/DataBackup.vue';
import Dashboard from './pages/Dashboard.vue';
import AIAddItem from './pages/AIAddItem.vue';
import Settings from './pages/Settings.vue';
import { defaultSettingsPath, settingsSections } from './settingsSections.js';
import { installSettingsOverlay } from './settingsOverlay.js';
import DemoUnavailable from './components/DemoUnavailable.vue';
import ScanQr from './pages/ScanQr.vue';
import PrintLabels from './pages/PrintLabels.vue';
import Templates from './pages/Templates.vue';
import TemplateForm from './pages/TemplateForm.vue';
import Checklists from './pages/Checklists.vue';
import ChecklistDetails from './pages/ChecklistDetails.vue';
import ChecklistForm from './pages/ChecklistForm.vue';
import ChecklistRun from './pages/ChecklistRun.vue';

const router = createRouter({
  // The static demo on GitHub Pages has no server to answer deep links, so its routes live in the hash.
  history: __DEMO__ ? createWebHashHistory() : createWebHistory(),
  routes: [
    { path: '/', redirect: '/dashboard' },
    { path: '/dashboard', component: Dashboard },
    { path: '/items', component: ItemsList },
    { path: '/items/ai', component: AIAddItem },
    { path: '/items/new', component: ItemForm },
    { path: '/items/:id', component: ItemDetails },
    { path: '/items/:id/edit', component: ItemForm },
    { path: '/items/:id/history', component: ItemHistory },
    { path: '/hierarchy', component: Hierarchy },
    { path: '/templates', component: Templates },
    { path: '/templates/new', component: TemplateForm },
    { path: '/templates/:id/edit', component: TemplateForm },
    { path: '/checklists', component: Checklists },
    { path: '/checklists/new', component: ChecklistForm },
    { path: '/checklists/runs/:runId', component: ChecklistRun },
    { path: '/checklists/:id', component: ChecklistDetails },
    { path: '/checklists/:id/edit', component: ChecklistForm },
    { path: '/scan', component: ScanQr },
    { path: '/labels/print', component: PrintLabels },
    { path: '/categories', component: Categories },
    { path: '/data', component: DataBackup },
    {
      path: '/settings',
      component: Settings,
      children: [
        { path: '', redirect: defaultSettingsPath },
        ...settingsSections.map(section => ({
          path: section.path,
          component: __DEMO__ && section.serverOnly ? DemoUnavailable : section.component
        })),
        { path: ':unknown(.*)', redirect: defaultSettingsPath }
      ]
    }
  ]
});

// Hidden buttons alone are not enough: the AI page must also be unreachable by typing its URL.
router.beforeEach(async to => {
  if (to.path !== '/items/ai') return true;
  await loadCapabilities();
  return capabilities.ai.enabled ? true : '/items';
});

installSettingsOverlay(router);
loadCapabilities();
createApp(App).use(i18n).use(router).mount('#app');
