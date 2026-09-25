<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { api } from '../api.js';
import { capabilities } from '../capabilities.js';
import { labelSelection, printLabelsRoute } from '../labelSelection.js';
import BatchAddItemsDialog from '../components/BatchAddItemsDialog.vue';
import ItemResults from '../components/ItemResults.vue';
import PageHeader from '../components/PageHeader.vue';
import { IconJson, IconPrinter, IconSparkles } from '@tabler/icons-vue';

const router = useRouter();
const { t } = useI18n();

const categories = ref([]);
const result = ref({ items: [], pagination: { page: 1, pages: 1, total: 0 } });
const loading = ref(true);
const error = ref('');
const notice = ref('');
const batchOpen = ref(false);
const filters = reactive({ search: '', categoryId: '', sort: 'name', direction: 'asc', page: 1 });
let timer;

const filtered = computed(() => Boolean(filters.search.trim() || filters.categoryId));
const countLabel = computed(() => t('items.count', result.value.pagination.total));

async function load() {
  loading.value = true; error.value = '';
  const params = new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== ''));
  try { result.value = await api(`/api/items?${params}`); } catch (e) { error.value = e.message; } finally { loading.value = false; }
}
watch(() => [filters.categoryId, filters.sort, filters.direction, filters.page], load);
watch(() => filters.search, () => { clearTimeout(timer); filters.page = 1; timer = setTimeout(load, 250); });
function changed() { filters.page = 1; }
const selectedLabel = computed(() => t('items.selected', labelSelection.size));
const printLabels = () => router.push(printLabelsRoute(labelSelection));
// The new items are shown by switching the list to their category; the list reloads through its watcher.
function batchCreated({ items, category }) {
  batchOpen.value = false;
  notice.value = t('items.batchCreated', { n: items.length, category: category.name }, items.length);
  filters.search = '';
  filters.page = 1;
  if (filters.categoryId === category.id) load();
  else filters.categoryId = category.id;
}
onMounted(async () => { try { categories.value = await api('/api/categories'); } catch (e) { error.value = e.message; } await load(); });
</script>

<template>
  <PageHeader
    :title="$t('items.title')"
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
        {{ $t('aiAddItem.title') }}
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
        {{ $t('items.batchAdd') }}
      </button>
      <RouterLink
        to="/items/new"
        class="btn btn-primary"
      >
        {{ $t('items.add') }}
      </RouterLink>
    </template>
  </PageHeader>

  <div class="card mb-3">
    <div class="card-body row g-3 align-items-end">
      <div class="col-12 col-lg-5">
        <label
          class="form-label"
          for="items-search"
        >{{ $t('common.search') }}</label>
        <input
          id="items-search"
          v-model="filters.search"
          type="search"
          class="form-control"
          :placeholder="$t('items.searchPlaceholder')"
        >
      </div>
      <div class="col-12 col-sm-6 col-lg-3">
        <label
          class="form-label"
          for="items-category"
        >{{ $t('items.fields.category') }}</label>
        <select
          id="items-category"
          v-model="filters.categoryId"
          class="form-select"
          @change="changed"
        >
          <option value="">
            {{ $t('common.allCategories') }}
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
        >{{ $t('items.sortBy') }}</label>
        <select
          id="items-sort"
          v-model="filters.sort"
          class="form-select"
          @change="changed"
        >
          <option value="name">
            {{ $t('items.fields.name') }}
          </option>
          <option value="category">
            {{ $t('items.fields.category') }}
          </option>
          <option value="created">
            {{ $t('items.fields.created') }}
          </option>
          <option value="updated">
            {{ $t('items.fields.updated') }}
          </option>
        </select>
      </div>
      <div class="col-6 col-sm-3 col-lg-2">
        <label
          class="form-label"
          for="items-direction"
        >{{ $t('items.direction') }}</label>
        <select
          id="items-direction"
          v-model="filters.direction"
          class="form-select"
          @change="changed"
        >
          <option value="asc">
            {{ $t('items.ascending') }}
          </option>
          <option value="desc">
            {{ $t('items.descending') }}
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
      {{ $t('items.clearSelection') }}
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
      {{ $t('labels.title') }}
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
      :aria-label="$t('common.dismissMessage')"
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
      {{ $t('items.loading') }}
    </div>
  </div>
  <div
    v-else-if="!result.items.length"
    class="card"
  >
    <div class="empty">
      <p class="empty-title">
        {{ filtered ? $t('items.noMatches') : $t('items.emptyTitle') }}
      </p>
      <p class="empty-subtitle text-secondary">
        {{ filtered ? $t('items.noMatchesText') : $t('items.emptyText') }}
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
          {{ $t('aiAddItem.title') }}
        </RouterLink>
        <RouterLink
          to="/items/new"
          class="btn btn-primary"
        >
          {{ $t('items.addFirst') }}
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
    :aria-label="$t('items.pagination')"
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
          {{ $t('common.previous') }}
        </button>
      </li>
      <li class="page-item disabled">
        <span class="page-link">{{ $t('items.page', { page: result.pagination.page, pages: result.pagination.pages }) }}</span>
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
          {{ $t('common.next') }}
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
