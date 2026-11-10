import { createApp } from 'vue';
import { createRouter, createWebHashHistory, createWebHistory } from 'vue-router';
import '@tabler/core/dist/css/tabler.min.css';
import './style.css';
import App from './App.vue';
import { i18n } from './i18n/index.js';
import { capabilities, loadCapabilities } from './capabilities.js';
import { auth, can, loadAuth, whenSignedOut } from './auth.js';
import { PERMISSIONS } from '../../shared/permissions.js';
import SignIn from './pages/SignIn.vue';
import ItemsList from './pages/ItemsList.vue';
import ItemDetails from './pages/ItemDetails.vue';
import ItemForm from './pages/ItemForm.vue';
import ItemHistoryDialog from './components/ItemHistoryDialog.vue';
import Hierarchy from './pages/Hierarchy.vue';
import Categories from './pages/Categories.vue';
import DataBackup from './pages/DataBackup.vue';
import Dashboard from './pages/Dashboard.vue';
import AIAddItem from './pages/AIAddItem.vue';
import Settings from './pages/Settings.vue';
import { defaultSettingsPath, settingsSections } from './settingsSections.js';
import { installSettingsOverlay, isSettingsRoute } from './settingsOverlay.js';
import DemoUnavailable from './components/DemoUnavailable.vue';
import ScanQr from './pages/ScanQr.vue';
import PrintLabels from './pages/PrintLabels.vue';
import Templates from './pages/Templates.vue';
import TemplateForm from './pages/TemplateForm.vue';
import Checklists from './pages/Checklists.vue';
import ChecklistDetails from './pages/ChecklistDetails.vue';
import ChecklistForm from './pages/ChecklistForm.vue';
import ChecklistRun from './pages/ChecklistRun.vue';

const { itemsWrite, inventoryManage, toolsUse, maintenanceManage } = PERMISSIONS;
// `meta.permission` keeps a page out of reach of anyone the server would refuse anyway.
const needs = permission => ({ permission });

const router = createRouter({
  // The static demo on GitHub Pages has no server to answer deep links, so its routes live in the hash.
  history: __DEMO__ ? createWebHashHistory() : createWebHistory(),
  routes: [
    { path: '/', redirect: '/dashboard' },
    // Signing in, the first administrator, and recovery codes: the only pages open without a session.
    { path: '/login', component: SignIn, meta: { public: 'login' } },
    { path: '/setup', component: SignIn, meta: { public: 'setup' } },
    { path: '/recover', component: SignIn, meta: { public: 'recover' } },
    { path: '/dashboard', component: Dashboard },
    { path: '/items', component: ItemsList },
    { path: '/items/ai', component: AIAddItem, meta: needs(toolsUse) },
    { path: '/items/new', component: ItemForm, meta: needs(itemsWrite) },
    // The full history is a dialog over the item's page, which stays mounted while it opens and closes.
    { path: '/items/:id', component: ItemDetails, children: [{ path: 'history', component: ItemHistoryDialog }] },
    { path: '/items/:id/edit', component: ItemForm, meta: needs(itemsWrite) },
    { path: '/hierarchy', component: Hierarchy },
    { path: '/templates', component: Templates, meta: needs(inventoryManage) },
    { path: '/templates/new', component: TemplateForm, meta: needs(inventoryManage) },
    { path: '/templates/:id/edit', component: TemplateForm, meta: needs(inventoryManage) },
    { path: '/checklists', component: Checklists },
    { path: '/checklists/new', component: ChecklistForm, meta: needs(inventoryManage) },
    { path: '/checklists/runs/:runId', component: ChecklistRun, meta: needs(inventoryManage) },
    { path: '/checklists/:id', component: ChecklistDetails },
    { path: '/checklists/:id/edit', component: ChecklistForm, meta: needs(inventoryManage) },
    { path: '/scan', component: ScanQr },
    { path: '/labels/print', component: PrintLabels },
    { path: '/categories', component: Categories, meta: needs(inventoryManage) },
    { path: '/data', component: DataBackup, meta: needs(maintenanceManage) },
    {
      path: '/settings',
      component: Settings,
      children: [
        { path: '', redirect: defaultSettingsPath },
        ...settingsSections.map(section => ({
          path: section.path,
          component: __DEMO__ && section.serverOnly ? DemoUnavailable : section.component,
          meta: section.permission ? needs(section.permission) : {}
        })),
        { path: ':unknown(.*)', redirect: defaultSettingsPath }
      ]
    }
  ]
});

/*
  Every page needs a session. Without one the person signs in first and then comes back to the
  address they asked for; a page their role cannot use leads to the Items list instead.
*/
const safeRedirect = value => (typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : '/');
router.beforeEach(async to => {
  await loadAuth();
  const signedIn = auth.status === 'signedIn';
  if (to.meta.public) {
    if (signedIn) return safeRedirect(to.query.redirect);
    // A pending setup always shows the setup page; otherwise setup is over and sign-in is the way in.
    if (auth.status === 'setup' && to.meta.public !== 'setup') return { path: '/setup', query: to.query };
    if (auth.status !== 'setup' && to.meta.public === 'setup') return { path: '/login', query: to.query };
    return true;
  }
  if (!signedIn) return { path: auth.status === 'setup' ? '/setup' : '/login', query: to.fullPath === '/' ? {} : { redirect: to.fullPath } };
  loadCapabilities();
  if (to.matched.some(record => record.meta.permission && !can(record.meta.permission))) return isSettingsRoute(to) ? defaultSettingsPath : '/items';
  return true;
});

// Hidden buttons alone are not enough: the AI page must also be unreachable by typing its URL.
router.beforeEach(async to => {
  if (to.path !== '/items/ai') return true;
  await loadCapabilities();
  return capabilities.ai.enabled ? true : '/items';
});

installSettingsOverlay(router);
// A session that ends while the page is open (expired, revoked, signed out elsewhere) leads to sign-in.
whenSignedOut(() => router.replace({ path: '/login', query: { redirect: router.currentRoute.value.fullPath } }));
createApp(App).use(i18n).use(router).mount('#app');
