import { createApp } from 'vue';
import { createRouter, createWebHistory } from 'vue-router';
import '@tabler/core/dist/css/tabler.min.css';
import './style.css';
import App from './App.vue';
import ItemsList from './pages/ItemsList.vue';
import ItemDetails from './pages/ItemDetails.vue';
import ItemForm from './pages/ItemForm.vue';
import Categories from './pages/Categories.vue';
import DataBackup from './pages/DataBackup.vue';
import Dashboard from './pages/Dashboard.vue';
import AIAddItem from './pages/AIAddItem.vue';
import Settings from './pages/Settings.vue';

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
    { path: '/categories', component: Categories },
    { path: '/data', component: DataBackup },
    { path: '/settings', component: Settings }
  ]
});

createApp(App).use(router).mount('#app');
