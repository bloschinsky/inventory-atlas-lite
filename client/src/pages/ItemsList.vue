<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api.js';
import { capabilities } from '../capabilities.js';
import { labelSelection, printLabelsRoute } from '../labelSelection.js';
import BatchAddItemsDialog from '../components/BatchAddItemsDialog.vue';
import ItemResults from '../components/ItemResults.vue';
import PageHeader from '../components/PageHeader.vue';
import { IconJson, IconPrinter, IconSparkles } from '@tabler/icons-vue';

const router = useRouter();

const categories = ref([]);
const result = ref({ items: [], pagination: { page: 1, pages: 1, total: 0 } });
const loading = ref(true);
const error = ref('');
const notice = ref('');
const batchOpen = ref(false);
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
const selectedLabel = computed(() => `${labelSelection.size} selected`);
const printLabels = () => router.push(printLabelsRoute(labelSelection));
// The new items are shown by switching the list to their category; the list reloads through its watcher.
function batchCreated({ items, category }) {
  batchOpen.value = false;
  notice.value = `Created ${items.length} ${items.length === 1 ? 'item' : 'items'} in ${category.name}.`;
  filters.search = '';
  filters.page = 1;
  if (filters.categoryId === category.id) load();
  else filters.categoryId = category.id;
}
onMounted(async () => { try { categories.value = await api('/api/categories'); } catch (e) { error.value = e.message; } await load(); });
</script>

<template>
  <PageHeader
    title="Items"
    :subtitle="countLabel"
  >
    <template #actions>
      <RouterLink
        v-if="capabilities.ai.enabled"
        to="/items/ai"
        class="btn btn-outline-primary"
      >
        <IconSparkles
          :size="18"
          aria-hidden="true"
        />
        AI Add Item
      </RouterLink>
      <button
        type="button"
        class="btn btn-outline-primary"
        :disabled="!categories.length"
        @click="notice = ''; batchOpen = true"
      >
        <IconJson
          :size="18"
          aria-hidden="true"
        />
        Batch Add from JSON
      </button>
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
          placeholder="Search name, description, serial number or transferred to…"
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

  <!-- The selection spans pages and filters, so its count and actions stay outside the result list. -->
  <div class="d-flex flex-wrap align-items-center gap-2 mb-3">
    <span
      class="meta-text"
      aria-live="polite"
    >{{ selectedLabel }}</span>
    <button
      v-if="labelSelection.size"
      type="button"
      class="btn btn-sm btn-link px-1"
      @click="labelSelection.clear()"
    >
      Clear selection
    </button>
    <button
      type="button"
      class="btn btn-sm ms-auto"
      :disabled="!labelSelection.size"
      @click="printLabels"
    >
      <IconPrinter
        :size="18"
        aria-hidden="true"
      />
      Print Labels
    </button>
  </div>

  <div
    v-if="error"
    class="alert alert-danger"
    role="alert"
  >
    {{ error }}
  </div>
  <div
    v-if="notice"
    class="alert alert-success alert-dismissible"
    role="status"
  >
    {{ notice }}<button
      type="button"
      class="btn-close"
      aria-label="Dismiss message"
      @click="notice = ''"
    />
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
        class="empty-action d-flex flex-wrap justify-content-center gap-2"
      >
        <RouterLink
          v-if="capabilities.ai.enabled"
          to="/items/ai"
          class="btn btn-outline-primary"
        >
          AI Add Item
        </RouterLink>
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
  <BatchAddItemsDialog
    v-if="batchOpen"
    :categories="categories"
    :initial-category-id="filters.categoryId"
    @close="batchOpen = false"
    @created="batchCreated"
  />
</template>
