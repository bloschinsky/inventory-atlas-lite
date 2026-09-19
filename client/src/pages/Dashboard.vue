<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../api.js';
import PageHeader from '../components/PageHeader.vue';

defineOptions({ name: 'InventoryDashboard' });

const route = useRoute();
const router = useRouter();
const data = ref(null);
const loading = ref(true);
const refreshing = ref(false);
const error = ref('');
const selectedCategory = ref('');
let requestNumber = 0;
let controller;

const categoryQuery = computed(() => typeof route.query.categoryId === 'string' ? route.query.categoryId : '');
const scopeLabel = computed(() => data.value?.scope.categoryName || 'All categories');
const categoryMaximum = computed(() => Math.max(0, ...(data.value?.categoryDistribution.map(entry => entry.count) || [])));
const conditionMaximum = computed(() => Math.max(0, ...(data.value?.conditionDistribution.map(entry => entry.count) || [])));

async function load() {
  const currentRequest = ++requestNumber;
  controller?.abort();
  controller = new AbortController();
  error.value = '';
  if (data.value) refreshing.value = true;
  else loading.value = true;
  const params = categoryQuery.value ? `?categoryId=${encodeURIComponent(categoryQuery.value)}` : '';
  try {
    const result = await api(`/api/dashboard${params}`, { signal: controller.signal });
    if (currentRequest === requestNumber) data.value = result;
  } catch (caught) {
    if (caught.name !== 'AbortError' && currentRequest === requestNumber) error.value = caught.message;
  } finally {
    if (currentRequest === requestNumber) {
      loading.value = false;
      refreshing.value = false;
    }
  }
}

function applyCategory(value) {
  router.replace({ path: '/dashboard', query: value ? { categoryId: String(value) } : {} });
}

function categoryChanged() {
  applyCategory(selectedCategory.value);
}

function selectCategory(entry) {
  if (entry.categoryId) applyCategory(entry.categoryId);
}

function barWidth(count, maximum) {
  return maximum ? `${Math.max(4, (count / maximum) * 100)}%` : '0%';
}

watch(categoryQuery, value => {
  selectedCategory.value = value;
  load();
}, { immediate: true });
onBeforeUnmount(() => controller?.abort());
</script>

<template>
  <PageHeader
    title="Dashboard"
    subtitle="A concise view of inventory size, documentation, and physical organization."
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
    <div class="card-body dashboard-toolbar">
      <div class="dashboard-filter">
        <label
          class="form-label"
          for="dashboard-category"
        >Category</label>
        <select
          id="dashboard-category"
          v-model="selectedCategory"
          class="form-select"
          :disabled="loading || refreshing || !data"
          @change="categoryChanged"
        >
          <option value="">
            All categories
          </option>
          <option
            v-for="category in data?.categories || []"
            :key="category.id"
            :value="String(category.id)"
          >
            {{ category.name }}
          </option>
        </select>
      </div>
      <button
        type="button"
        class="btn btn-outline-secondary"
        :disabled="!categoryQuery || loading || refreshing"
        @click="applyCategory('')"
      >
        Reset
      </button>
      <span
        v-if="refreshing"
        class="dashboard-refresh text-secondary"
        role="status"
      >
        <span
          class="spinner-border spinner-border-sm"
          aria-hidden="true"
        />
        Refreshing…
      </span>
    </div>
  </div>

  <div
    v-if="error"
    class="alert alert-danger"
    role="alert"
  >
    <div>{{ error }}</div>
    <button
      type="button"
      class="btn btn-danger mt-2"
      @click="load"
    >
      Retry
    </button>
  </div>

  <div
    v-else-if="loading"
    class="card"
  >
    <div
      class="card-body d-flex align-items-center gap-2 text-secondary"
      role="status"
    >
      <span
        class="spinner-border spinner-border-sm"
        aria-hidden="true"
      />
      Loading dashboard…
    </div>
  </div>

  <template v-else-if="data">
    <div
      v-if="data.totalItems === 0"
      class="card mb-3"
    >
      <div class="empty">
        <p class="empty-title">
          {{ data.scope.categoryId ? `No items in ${data.scope.categoryName}` : 'No items yet' }}
        </p>
        <p class="empty-subtitle text-secondary">
          {{ data.scope.categoryId ? 'This category is valid but does not contain any items.' : 'Add your first item to start building the inventory dashboard.' }}
        </p>
        <div class="empty-action">
          <RouterLink
            to="/items/new"
            class="btn btn-primary"
          >
            Add item
          </RouterLink>
        </div>
      </div>
    </div>

    <div
      class="row row-cards mb-3"
      :class="{ 'dashboard-is-refreshing': refreshing }"
      aria-live="polite"
    >
      <div class="col-12 col-sm-6 col-xl-3">
        <section
          class="card h-100"
          aria-labelledby="total-items-title"
        >
          <div class="card-body">
            <div
              id="total-items-title"
              class="subheader"
            >
              Total items
            </div>
            <div class="h1 mb-1">
              {{ data.totalItems }}
            </div>
            <div class="text-secondary">
              {{ scopeLabel }}
            </div>
          </div>
        </section>
      </div>
      <div class="col-12 col-sm-6 col-xl-3">
        <section
          class="card h-100"
          aria-labelledby="photo-coverage-title"
        >
          <div class="card-body">
            <div
              id="photo-coverage-title"
              class="subheader"
            >
              Photo coverage
            </div>
            <div class="h1 mb-2">
              {{ data.photoCoverage.percentage }}%
            </div>
            <div
              class="progress progress-sm mb-2"
              aria-hidden="true"
            >
              <div
                class="progress-bar bg-primary"
                :style="{ width: `${data.photoCoverage.percentage}%` }"
              />
            </div>
            <div class="d-flex justify-content-between gap-2 small">
              <span>{{ data.photoCoverage.withPhotos }} with photos</span>
              <span class="text-secondary">{{ data.photoCoverage.withoutPhotos }} without</span>
            </div>
          </div>
        </section>
      </div>
      <div class="col-12 col-sm-6 col-xl-3">
        <section
          class="card h-100"
          aria-labelledby="placement-title"
        >
          <div class="card-body">
            <div
              id="placement-title"
              class="subheader mb-2"
            >
              Placement status
            </div>
            <div class="dashboard-stat-row">
              <span>Inside a container</span><strong>{{ data.placement.insideContainer }}</strong>
            </div>
            <div class="dashboard-stat-row">
              <span>Direct location</span><strong>{{ data.placement.directLocation }}</strong>
            </div>
            <div class="dashboard-stat-row">
              <span>Unplaced</span><strong>{{ data.placement.unplaced }}</strong>
            </div>
          </div>
        </section>
      </div>
      <div class="col-12 col-sm-6 col-xl-3">
        <section
          class="card h-100"
          aria-labelledby="recent-items-title"
        >
          <div class="card-body">
            <div
              id="recent-items-title"
              class="subheader"
            >
              Added in the last 30 days
            </div>
            <div class="h1 mb-1">
              {{ data.addedLast30Days }}
            </div>
            <div class="text-secondary">
              Rolling 30-day window
            </div>
          </div>
        </section>
      </div>
    </div>

    <div
      class="row row-cards"
      :class="{ 'dashboard-is-refreshing': refreshing }"
    >
      <div class="col-12 col-lg-6">
        <section
          class="card h-100"
          aria-labelledby="category-distribution-title"
        >
          <div class="card-header d-block">
            <h2
              id="category-distribution-title"
              class="card-title"
            >
              Items by category
            </h2>
            <div class="text-secondary small">
              All-inventory distribution{{ data.scope.categoryId ? `; ${data.scope.categoryName} is highlighted` : '' }}
            </div>
          </div>
          <div class="card-body">
            <div
              v-if="!data.categoryDistribution.length"
              class="text-secondary"
            >
              No inventory data yet.
            </div>
            <div
              v-for="entry in data.categoryDistribution"
              :key="`${entry.categoryId}-${entry.label}`"
              class="dashboard-distribution-row"
            >
              <button
                v-if="entry.categoryId"
                type="button"
                class="dashboard-bar-button"
                :class="{ 'dashboard-bar-selected': entry.selected }"
                :aria-label="`Filter dashboard by ${entry.label}: ${entry.count} items`"
                :aria-pressed="entry.selected"
                @click="selectCategory(entry)"
              >
                <span class="dashboard-bar-label"><span>{{ entry.label }}</span><strong>{{ entry.count }}</strong></span>
                <span
                  class="dashboard-bar-track"
                  aria-hidden="true"
                ><span :style="{ width: barWidth(entry.count, categoryMaximum) }" /></span>
              </button>
              <div
                v-else
                class="dashboard-bar-button dashboard-bar-static"
              >
                <span class="dashboard-bar-label"><span>{{ entry.label }}</span><strong>{{ entry.count }}</strong></span>
                <span
                  class="dashboard-bar-track"
                  aria-hidden="true"
                ><span :style="{ width: barWidth(entry.count, categoryMaximum) }" /></span>
              </div>
            </div>
          </div>
        </section>
      </div>
      <div class="col-12 col-lg-6">
        <section
          class="card h-100"
          aria-labelledby="condition-distribution-title"
        >
          <div class="card-header">
            <h2
              id="condition-distribution-title"
              class="card-title"
            >
              Condition breakdown
            </h2>
          </div>
          <div class="card-body">
            <div
              v-if="!data.conditionDistribution.length"
              class="text-secondary"
            >
              No condition data in this scope.
            </div>
            <div
              v-for="entry in data.conditionDistribution"
              :key="entry.key"
              class="dashboard-distribution-row"
            >
              <div class="dashboard-bar-button dashboard-bar-static">
                <span class="dashboard-bar-label"><span>{{ entry.label }}</span><strong>{{ entry.count }}</strong></span>
                <span
                  class="dashboard-bar-track"
                  aria-hidden="true"
                ><span :style="{ width: barWidth(entry.count, conditionMaximum) }" /></span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  </template>
</template>
