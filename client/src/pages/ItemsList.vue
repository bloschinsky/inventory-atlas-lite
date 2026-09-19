<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { api } from '../api.js';
import ItemResults from '../components/ItemResults.vue';
import PageHeader from '../components/PageHeader.vue';

const categories = ref([]);
const result = ref({ items: [], pagination: { page: 1, pages: 1, total: 0 } });
const loading = ref(true);
const error = ref('');
const filters = reactive({ search: '', categoryId: '', sort: 'name', direction: 'asc', page: 1 });
let timer;

const filtered = computed(() => Boolean(filters.search.trim() || filters.categoryId));
const countLabel = computed(() => `${result.value.pagination.total} ${result.value.pagination.total === 1 ? 'item' : 'items'}`);

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
  <PageHeader
    title="Items"
    :subtitle="countLabel"
  >
    <template #actions>
      <RouterLink
        to="/items/new"
        class="btn btn-primary"
      >
        Add item
      </RouterLink>
    </template>
  </PageHeader>

  <div class="card mb-3">
    <div class="card-body row g-3 align-items-end">
      <div class="col-12 col-lg-5">
        <label
          class="form-label"
          for="items-search"
        >Search</label>
        <input
          id="items-search"
          v-model="filters.search"
          type="search"
          class="form-control"
          placeholder="Search name, description or serial number…"
        >
      </div>
      <div class="col-12 col-sm-6 col-lg-3">
        <label
          class="form-label"
          for="items-category"
        >Category</label>
        <select
          id="items-category"
          v-model="filters.categoryId"
          class="form-select"
          @change="changed"
        >
          <option value="">
            All categories
          </option>
          <option
            v-for="c in categories"
            :key="c.id"
            :value="c.id"
          >
            {{ c.name }}
          </option>
        </select>
      </div>
      <div class="col-6 col-sm-3 col-lg-2">
        <label
          class="form-label"
          for="items-sort"
        >Sort by</label>
        <select
          id="items-sort"
          v-model="filters.sort"
          class="form-select"
          @change="changed"
        >
          <option value="name">
            Name
          </option>
          <option value="category">
            Category
          </option>
          <option value="created">
            Created
          </option>
          <option value="updated">
            Updated
          </option>
        </select>
      </div>
      <div class="col-6 col-sm-3 col-lg-2">
        <label
          class="form-label"
          for="items-direction"
        >Direction</label>
        <select
          id="items-direction"
          v-model="filters.direction"
          class="form-select"
          @change="changed"
        >
          <option value="asc">
            Ascending
          </option>
          <option value="desc">
            Descending
          </option>
        </select>
      </div>
    </div>
  </div>

  <div
    v-if="error"
    class="alert alert-danger"
    role="alert"
  >
    {{ error }}
  </div>

  <div
    v-if="loading"
    class="card"
  >
    <div class="card-body d-flex align-items-center gap-2 text-secondary">
      <span
        class="spinner-border spinner-border-sm"
        aria-hidden="true"
      />
      Loading items…
    </div>
  </div>
  <div
    v-else-if="!result.items.length"
    class="card"
  >
    <div class="empty">
      <p class="empty-title">
        {{ filtered ? 'No matching items' : 'No items yet' }}
      </p>
      <p class="empty-subtitle text-secondary">
        {{ filtered ? 'Try a different search term or clear the category filter.' : 'No items found. Add your first item to get started.' }}
      </p>
      <div
        v-if="!filtered"
        class="empty-action"
      >
        <RouterLink
          to="/items/new"
          class="btn btn-primary"
        >
          Add your first item
        </RouterLink>
      </div>
    </div>
  </div>
  <ItemResults
    v-else
    :items="result.items"
  />

  <nav
    v-if="result.pagination.pages > 1"
    class="mt-3 d-flex flex-wrap gap-2 align-items-center"
    aria-label="Items pagination"
  >
    <ul class="pagination m-0">
      <li
        class="page-item"
        :class="{ disabled: filters.page <= 1 }"
      >
        <button
          type="button"
          class="page-link"
          :disabled="filters.page <= 1"
          @click="filters.page--"
        >
          Previous
        </button>
      </li>
      <li class="page-item disabled">
        <span class="page-link">Page {{ result.pagination.page }} of {{ result.pagination.pages }}</span>
      </li>
      <li
        class="page-item"
        :class="{ disabled: filters.page >= result.pagination.pages }"
      >
        <button
          type="button"
          class="page-link"
          :disabled="filters.page >= result.pagination.pages"
          @click="filters.page++"
        >
          Next
        </button>
      </li>
    </ul>
  </nav>
</template>
