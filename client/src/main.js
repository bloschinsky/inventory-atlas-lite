import { createApp } from 'vue';
import { createRouter, createWebHistory } from 'vue-router';
import 'bootstrap/dist/css/bootstrap.min.css';
import './style.css';
import App from './App.vue';
import ItemsList from './pages/ItemsList.vue';
import ItemDetails from './pages/ItemDetails.vue';
import ItemForm from './pages/ItemForm.vue';
import Categories from './pages/Categories.vue';
import DataBackup from './pages/DataBackup.vue';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: ItemsList },
    { path: '/items/new', component: ItemForm },
    { path: '/items/:id', component: ItemDetails },
    { path: '/items/:id/edit', component: ItemForm },
    { path: '/categories', component: Categories },
    { path: '/data', component: DataBackup }
  ]
});

createApp(App).use(router).mount('#app');
