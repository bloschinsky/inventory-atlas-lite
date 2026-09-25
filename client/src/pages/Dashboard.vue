<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { api } from '../api.js';
import { formatDate, formatNumber } from '../i18n/index.js';
import { theme } from '../theme.js';
import {
  categoryTreemapOptions, conditionColors, conditionDonutOptions, fieldCoverageOptions, locationBarOptions,
  photoCoverageOptions, placementOptions, recentActivityOptions, resolveChartTheme
} from '../dashboardCharts.js';
import PageHeader from '../components/PageHeader.vue';
import DashboardChart from '../components/DashboardChart.vue';

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
  if (entry?.categoryId) applyCategory(entry.categoryId);
}

/*
  The server names its summary buckets in English; they are recognized by their keys and shown in the
  active language. Category names, conditions, and locations are user data and stay as entered.
*/
const categoryLabel = entry => (entry.categoryId === null ? t('dashboard.other') : entry.label);
function conditionLabel(entry) {
  if (entry.key === '__other__') return t('dashboard.other');
  if (entry.key === 'not-specified' && entry.label === 'Not specified') return t('dashboard.notSpecified');
  return entry.label;
}
function locationLabel(entry) {
  if (entry.key === '__other__') return t('dashboard.other');
  if (entry.key === '__unknown__') return t('dashboard.unknown');
  return entry.label;
}

// Resolved again whenever the color mode changes, so every chart is redrawn in the new palette.
const colors = computed(() => theme.value && resolveChartTheme());

const placementSegments = computed(() => [
  { key: 'insideContainer', label: t('dashboard.insideContainer'), count: data.value.placement.insideContainer },
  { key: 'directLocation', label: t('dashboard.directLocation'), count: data.value.placement.directLocation },
  { key: 'unplaced', label: t('dashboard.unplaced'), count: data.value.placement.unplaced }
]);
const placementColors = computed(() => [colors.value.primary, colors.value.success, colors.value.neutral]);
const conditionSwatches = computed(() => conditionColors(colors.value, data.value.conditionDistribution));
// Zero-count tiles cannot be drawn, so an empty selected category is only offered as a button.
const treemapEntries = computed(() => data.value.categoryDistribution.filter(entry => entry.count > 0));
const fieldCoverage = computed(() => data.value.fieldCoverage.map(field => ({
  ...field,
  total: data.value.totalItems,
  label: t(`dashboard.fields.${field.key}`)
})));

const charts = computed(() => {
  if (!data.value) return null;
  const current = data.value;
  const format = formatNumber;
  return {
    photo: photoCoverageOptions({ colors: colors.value, percentage: current.photoCoverage.percentage, format }),
    placement: placementOptions({ colors: colors.value, segments: placementSegments.value, format }),
    recent: recentActivityOptions({
      colors: colors.value, buckets: current.recentActivity, label: t('dashboard.itemsSeries'), formatDate, format
    }),
    categories: categoryTreemapOptions({
      colors: colors.value,
      entries: treemapEntries.value.map(entry => ({ ...entry, label: categoryLabel(entry) })),
      label: t('dashboard.itemsSeries'),
      format,
      onSelect: selectCategory
    }),
    conditions: conditionDonutOptions({
      colors: colors.value,
      entries: current.conditionDistribution,
      labels: current.conditionDistribution.map(conditionLabel),
      total: current.totalItems,
      totalLabel: t('dashboard.total'),
      format
    }),
    fields: fieldCoverageOptions({
      colors: colors.value,
      fields: fieldCoverage.value,
      labels: fieldCoverage.value.map(field => field.label),
      seriesName: t('dashboard.fieldCoverage'),
      format
    }),
    locations: locationBarOptions({
      colors: colors.value,
      entries: current.locationDistribution,
      labels: current.locationDistribution.map(locationLabel),
      seriesName: t('dashboard.itemsSeries'),
      format
    })
  };
});

// Chart names carry the values too, so nothing is available only inside the drawing or a tooltip.
const summary = entries => entries.map(([label, count]) => `${label}: ${formatNumber(count)}`).join(', ');
const chartLabels = computed(() => {
  if (!data.value) return null;
  const current = data.value;
  return {
    photo: t('dashboard.chartPhotoCoverage', { percentage: formatNumber(current.photoCoverage.percentage) }),
    placement: t('dashboard.chartPlacement', { summary: summary(placementSegments.value.map(segment => [segment.label, segment.count])) }),
    recent: t('dashboard.chartRecentActivity', { n: formatNumber(current.addedLast30Days) }),
    categories: t('dashboard.chartCategories', { summary: summary(current.categoryDistribution.map(entry => [categoryLabel(entry), entry.count])) }),
    conditions: t('dashboard.chartConditions', { summary: summary(current.conditionDistribution.map(entry => [conditionLabel(entry), entry.count])) }),
    fields: t('dashboard.chartFieldCoverage', {
      summary: fieldCoverage.value.map(field => `${field.label}: ${fieldValue(field)}`).join(', ')
    }),
    locations: t('dashboard.chartLocations', { summary: summary(current.locationDistribution.map(entry => [locationLabel(entry), entry.count])) })
  };
});

const fieldValue = field => t('dashboard.fieldCoverageValue', {
  percentage: formatNumber(field.percentage),
  count: formatNumber(field.count),
  total: formatNumber(field.total)
});

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
          class="card h-100 dashboard-card"
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
          class="card h-100 dashboard-card"
          aria-labelledby="photo-coverage-title"
        >
          <div class="card-body">
            <div
              id="photo-coverage-title"
              class="subheader"
            >
              {{ $t('dashboard.photoCoverage') }}
            </div>
            <DashboardChart
              class="dashboard-radial"
              :options="charts.photo"
              :label="chartLabels.photo"
            />
            <div class="d-flex justify-content-between gap-2 small">
              <span>{{ $t('dashboard.withPhotos', { n: formatNumber(data.photoCoverage.withPhotos) }) }}</span>
              <span class="text-secondary">{{ $t('dashboard.withoutPhotos', { n: formatNumber(data.photoCoverage.withoutPhotos) }) }}</span>
            </div>
          </div>
        </section>
      </div>
      <div class="col-12 col-sm-6 col-xl-3">
        <section
          class="card h-100 dashboard-card"
          aria-labelledby="placement-title"
        >
          <div class="card-body">
            <div
              id="placement-title"
              class="subheader mb-2"
            >
              {{ $t('dashboard.placement') }}
            </div>
            <DashboardChart
              v-if="data.totalItems"
              class="dashboard-stacked mb-3"
              :options="charts.placement"
              :label="chartLabels.placement"
            />
            <div
              v-else
              class="text-secondary mb-3"
            >
              {{ $t('dashboard.noScopeData') }}
            </div>
            <div
              v-for="(segment, index) in placementSegments"
              :key="segment.key"
              class="dashboard-stat-row"
            >
              <span class="dashboard-legend-label"><span
                class="dashboard-swatch"
                :style="{ background: placementColors[index] }"
                aria-hidden="true"
              />{{ segment.label }}</span><strong>{{ formatNumber(segment.count) }}</strong>
            </div>
          </div>
        </section>
      </div>
      <div class="col-12 col-sm-6 col-xl-3">
        <section
          class="card h-100 dashboard-card"
          aria-labelledby="recent-items-title"
        >
          <div class="card-body d-flex flex-column">
            <div
              id="recent-items-title"
              class="subheader"
            >
              {{ $t('dashboard.addedRecently') }}
            </div>
            <div class="h1 mb-1">
              {{ formatNumber(data.addedLast30Days) }}
            </div>
            <div class="text-secondary mb-2">
              {{ $t('dashboard.rollingWindow') }}
            </div>
            <DashboardChart
              class="dashboard-sparkline mt-auto"
              :options="charts.recent"
              :label="chartLabels.recent"
            />
          </div>
        </section>
      </div>
    </div>

    <div
      class="row row-cards mb-3"
      :class="{ 'dashboard-is-refreshing': refreshing }"
    >
      <div class="col-12 col-lg-7">
        <section
          class="card h-100 dashboard-card"
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
            <template v-else>
              <DashboardChart
                v-if="treemapEntries.length"
                class="dashboard-treemap mb-3"
                :options="charts.categories"
                :label="chartLabels.categories"
              />
              <div
                class="dashboard-chips"
                role="group"
                :aria-label="$t('dashboard.filterCategories')"
              >
                <template
                  v-for="entry in data.categoryDistribution"
                  :key="`${entry.categoryId}-${entry.label}`"
                >
                  <button
                    v-if="entry.categoryId"
                    type="button"
                    class="btn btn-sm dashboard-chip"
                    :class="entry.selected ? 'btn-primary' : 'btn-outline-secondary'"
                    :aria-label="$t('dashboard.filterBy', { category: entry.label, n: entry.count }, entry.count)"
                    :aria-pressed="entry.selected"
                    @click="selectCategory(entry)"
                  >
                    <span class="text-truncate">{{ entry.label }}</span><strong>{{ formatNumber(entry.count) }}</strong>
                  </button>
                  <span
                    v-else
                    class="dashboard-chip dashboard-chip-static text-secondary"
                  >
                    <span class="text-truncate">{{ categoryLabel(entry) }}</span><strong>{{ formatNumber(entry.count) }}</strong>
                  </span>
                </template>
              </div>
            </template>
          </div>
        </section>
      </div>
      <div class="col-12 col-lg-5">
        <section
          class="card h-100 dashboard-card"
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
            <template v-else>
              <DashboardChart
                class="dashboard-donut mb-3"
                :options="charts.conditions"
                :label="chartLabels.conditions"
              />
              <div
                v-for="(entry, index) in data.conditionDistribution"
                :key="entry.key"
                class="dashboard-stat-row"
              >
                <span class="dashboard-legend-label"><span
                  class="dashboard-swatch"
                  :style="{ background: conditionSwatches[index] }"
                  aria-hidden="true"
                /><span class="text-truncate">{{ conditionLabel(entry) }}</span></span><strong>{{ formatNumber(entry.count) }}</strong>
              </div>
            </template>
          </div>
        </section>
      </div>
    </div>

    <div
      class="row row-cards"
      :class="{ 'dashboard-is-refreshing': refreshing }"
    >
      <div class="col-12 col-lg-7">
        <section
          class="card h-100 dashboard-card"
          aria-labelledby="field-coverage-title"
        >
          <div class="card-header d-block">
            <h2
              id="field-coverage-title"
              class="card-title"
            >
              {{ $t('dashboard.fieldCoverage') }}
            </h2>
            <div class="text-secondary small">
              {{ $t('dashboard.fieldCoverageText') }}
            </div>
          </div>
          <div class="card-body">
            <div
              v-if="!data.totalItems"
              class="text-secondary"
            >
              {{ $t('dashboard.noScopeData') }}
            </div>
            <div
              v-else
              class="row g-3 align-items-center"
            >
              <div class="col-12 col-md-7">
                <DashboardChart
                  class="dashboard-radar"
                  :options="charts.fields"
                  :label="chartLabels.fields"
                />
              </div>
              <div class="col-12 col-md-5">
                <div
                  v-for="field in fieldCoverage"
                  :key="field.key"
                  class="dashboard-stat-row"
                >
                  <span>{{ field.label }}</span><strong>{{ fieldValue(field) }}</strong>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
      <div class="col-12 col-lg-5">
        <section
          class="card h-100 dashboard-card"
          aria-labelledby="location-distribution-title"
        >
          <div class="card-header d-block">
            <h2
              id="location-distribution-title"
              class="card-title"
            >
              {{ $t('dashboard.byLocation') }}
            </h2>
            <div class="text-secondary small">
              {{ $t('dashboard.byLocationText') }}
            </div>
          </div>
          <div class="card-body">
            <div
              v-if="!data.locationDistribution.length"
              class="text-secondary"
            >
              {{ $t('dashboard.noScopeData') }}
            </div>
            <DashboardChart
              v-else
              class="dashboard-bars"
              :options="charts.locations"
              :label="chartLabels.locations"
            />
          </div>
        </section>
      </div>
    </div>
  </template>
</template>
