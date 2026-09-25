<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { api } from '../api.js';
import { formatNumber } from '../i18n/index.js';
import PageHeader from '../components/PageHeader.vue';

defineOptions({ name: 'InventoryDashboard' });

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const data = ref(null);
const loading = ref(true);
const refreshing = ref(false);
const error = ref('');
const selectedCategory = ref('');
let requestNumber = 0;
let controller;

const categoryQuery = computed(() => typeof route.query.categoryId === 'string' ? route.query.categoryId : '');
const scopeLabel = computed(() => data.value?.scope.categoryName || t('common.allCategories'));
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

/*
  The server names its summary buckets in English; they are recognized by their keys and shown in the
  active language. Category names and conditions are user data and stay as they were entered.
*/
const categoryLabel = entry => (entry.categoryId === null ? t('dashboard.other') : entry.label);
function conditionLabel(entry) {
  if (entry.key === '__other__') return t('dashboard.other');
  if (entry.key === 'not-specified' && entry.label === 'Not specified') return t('dashboard.notSpecified');
  return entry.label;
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
    :title="$t('dashboard.title')"
    :subtitle="$t('dashboard.subtitle')"
  >
    <template #actions>
      <RouterLink
        to="/items/new"
        class="btn btn-primary"
      >
        {{ $t('items.add') }}
      </RouterLink>
    </template>
  </PageHeader>

  <div class="card mb-3">
    <div class="card-body dashboard-toolbar">
      <div class="dashboard-filter">
        <label
          class="form-label"
          for="dashboard-category"
        >{{ $t('items.fields.category') }}</label>
        <select
          id="dashboard-category"
          v-model="selectedCategory"
          class="form-select"
          :disabled="loading || refreshing || !data"
          @change="categoryChanged"
        >
          <option value="">
            {{ $t('common.allCategories') }}
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
        {{ $t('common.reset') }}
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
        {{ $t('dashboard.refreshing') }}
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
      {{ $t('common.retry') }}
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
      {{ $t('dashboard.loading') }}
    </div>
  </div>

  <template v-else-if="data">
    <div
      v-if="data.totalItems === 0"
      class="card mb-3"
    >
      <div class="empty">
        <p class="empty-title">
          {{ data.scope.categoryId ? $t('dashboard.emptyCategory', { category: data.scope.categoryName }) : $t('items.emptyTitle') }}
        </p>
        <p class="empty-subtitle text-secondary">
          {{ data.scope.categoryId ? $t('dashboard.emptyCategoryText') : $t('dashboard.emptyText') }}
        </p>
        <div class="empty-action">
          <RouterLink
            to="/items/new"
            class="btn btn-primary"
          >
            {{ $t('items.add') }}
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
              {{ $t('dashboard.totalItems') }}
            </div>
            <div class="h1 mb-1">
              {{ formatNumber(data.totalItems) }}
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
              {{ $t('dashboard.photoCoverage') }}
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
              <span>{{ $t('dashboard.withPhotos', { n: formatNumber(data.photoCoverage.withPhotos) }) }}</span>
              <span class="text-secondary">{{ $t('dashboard.withoutPhotos', { n: formatNumber(data.photoCoverage.withoutPhotos) }) }}</span>
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
              {{ $t('dashboard.placement') }}
            </div>
            <div class="dashboard-stat-row">
              <span>{{ $t('dashboard.insideContainer') }}</span><strong>{{ formatNumber(data.placement.insideContainer) }}</strong>
            </div>
            <div class="dashboard-stat-row">
              <span>{{ $t('dashboard.directLocation') }}</span><strong>{{ formatNumber(data.placement.directLocation) }}</strong>
            </div>
            <div class="dashboard-stat-row">
              <span>{{ $t('dashboard.unplaced') }}</span><strong>{{ formatNumber(data.placement.unplaced) }}</strong>
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
              {{ $t('dashboard.addedRecently') }}
            </div>
            <div class="h1 mb-1">
              {{ formatNumber(data.addedLast30Days) }}
            </div>
            <div class="text-secondary">
              {{ $t('dashboard.rollingWindow') }}
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
              {{ $t('dashboard.byCategory') }}
            </h2>
            <div class="text-secondary small">
              {{ data.scope.categoryId ? $t('dashboard.distributionHighlighted', { category: data.scope.categoryName }) : $t('dashboard.distribution') }}
            </div>
          </div>
          <div class="card-body">
            <div
              v-if="!data.categoryDistribution.length"
              class="text-secondary"
            >
              {{ $t('dashboard.noData') }}
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
                :aria-label="$t('dashboard.filterBy', { category: entry.label, n: entry.count }, entry.count)"
                :aria-pressed="entry.selected"
                @click="selectCategory(entry)"
              >
                <span class="dashboard-bar-label"><span>{{ entry.label }}</span><strong>{{ formatNumber(entry.count) }}</strong></span>
                <span
                  class="dashboard-bar-track"
                  aria-hidden="true"
                ><span :style="{ width: barWidth(entry.count, categoryMaximum) }" /></span>
              </button>
              <div
                v-else
                class="dashboard-bar-button dashboard-bar-static"
              >
                <span class="dashboard-bar-label"><span>{{ categoryLabel(entry) }}</span><strong>{{ formatNumber(entry.count) }}</strong></span>
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
              {{ $t('dashboard.byCondition') }}
            </h2>
          </div>
          <div class="card-body">
            <div
              v-if="!data.conditionDistribution.length"
              class="text-secondary"
            >
              {{ $t('dashboard.noConditionData') }}
            </div>
            <div
              v-for="entry in data.conditionDistribution"
              :key="entry.key"
              class="dashboard-distribution-row"
            >
              <div class="dashboard-bar-button dashboard-bar-static">
                <span class="dashboard-bar-label"><span>{{ conditionLabel(entry) }}</span><strong>{{ formatNumber(entry.count) }}</strong></span>
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
