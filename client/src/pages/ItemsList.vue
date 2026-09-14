<script setup>
import { onMounted, reactive, ref, watch } from 'vue';
import { api } from '../api.js';

const categories = ref([]);
const result = ref({ items: [], pagination: { page: 1, pages: 1, total: 0 } });
const loading = ref(true);
const error = ref('');
const filters = reactive({ search: '', categoryId: '', sort: 'name', direction: 'asc', page: 1 });
let timer;

async function load() {
  loading.value = true; error.value = '';
  const params = new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== ''));
  try { result.value = await api(`/api/items?${params}`); } catch (e) { error.value = e.message; } finally { loading.value = false; }
}
watch(() => [filters.categoryId, filters.sort, filters.direction, filters.page], load);
watch(() => filters.search, () => { clearTimeout(timer); filters.page = 1; timer = setTimeout(load, 250); });
function changed() { filters.page = 1; }
onMounted(async () => { try { categories.value = await api('/api/categories'); } catch (e) { error.value = e.message; } await load(); });
</script>

<template>
  <div class="d-flex justify-content-between align-items-center mb-3">
    <div>
      <h1 class="h3 mb-0">
        Items
      </h1><div class="text-secondary">
        {{ result.pagination.total }} total
      </div>
    </div>
    <RouterLink
      to="/items/new"
      class="btn btn-primary"
    >
      Add item
    </RouterLink>
  </div>
  <div class="card mb-3">
    <div class="card-body row g-2">
      <div class="col-md-5">
        <input
          v-model="filters.search"
          class="form-control"
          placeholder="Search name or description…"
        >
      </div>
      <div class="col-md-3">
        <select
          v-model="filters.categoryId"
          class="form-select"
          aria-label="Filter by category"
          @change="changed"
        >
          <option value="">
            All categories
          </option><option
            v-for="c in categories"
            :key="c.id"
            :value="c.id"
          >
            {{ c.name }}
          </option>
        </select>
      </div>
      <div class="col-md-2">
        <select
          v-model="filters.sort"
          class="form-select"
          aria-label="Sort by"
          @change="changed"
        >
          <option value="name">
            Name
          </option><option value="category">
            Category
          </option><option value="created">
            Created
          </option><option value="updated">
            Updated
          </option>
        </select>
      </div>
      <div class="col-md-2">
        <select
          v-model="filters.direction"
          class="form-select"
          aria-label="Sort direction"
          @change="changed"
        >
          <option value="asc">
            Ascending
          </option><option value="desc">
            Descending
          </option>
        </select>
      </div>
    </div>
  </div>
  <div
    v-if="error"
    class="alert alert-danger"
  >
    {{ error }}
  </div>
  <div
    v-if="loading"
    class="text-secondary"
  >
    Loading…
  </div>
  <div
    v-else-if="!result.items.length"
    class="alert alert-light border"
  >
    No items found. Add your first item to get started.
  </div>
  <div
    v-else
    class="card table-responsive"
  >
    <table class="table table-hover mb-0">
      <thead><tr><th>Photo</th><th>Name</th><th>Category</th><th>Condition</th><th>Location</th></tr></thead>
      <tbody>
        <tr
          v-for="item in result.items"
          :key="item.id"
        >
          <td>
            <img
              v-if="item.thumbnail_id"
              class="thumbnail"
              :src="`/api/photos/${item.thumbnail_id}`"
              :alt="item.name"
            ><div
              v-else
              class="thumbnail empty-thumb"
            >
              No photo
            </div>
          </td>
          <td>
            <RouterLink
              :to="`/items/${item.id}`"
              class="fw-semibold"
            >
              {{ item.name }}
            </RouterLink>
          </td>
          <td>{{ item.category_name }}</td><td>{{ item.condition || '—' }}</td><td>{{ item.location || '—' }}</td>
        </tr>
      </tbody>
    </table>
  </div>
  <nav
    v-if="result.pagination.pages > 1"
    class="mt-3 d-flex gap-2 align-items-center"
  >
    <button
      class="btn btn-outline-secondary btn-sm"
      :disabled="filters.page <= 1"
      @click="filters.page--"
    >
      Previous
    </button>
    <span>Page {{ result.pagination.page }} of {{ result.pagination.pages }}</span>
    <button
      class="btn btn-outline-secondary btn-sm"
      :disabled="filters.page >= result.pagination.pages"
      @click="filters.page++"
    >
      Next
    </button>
  </nav>
</template>
