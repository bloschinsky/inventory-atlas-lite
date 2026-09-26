<script setup>
import { computed, defineAsyncComponent, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { api } from '../api.js';
import { buildTree, searchTree } from '../hierarchyTree.js';
import { useHierarchyExpansion } from '../useHierarchyExpansion.js';
import PageHeader from '../components/PageHeader.vue';
import HierarchyTree from '../components/HierarchyTree.vue';

// The graph library is only downloaded once the Graph view is opened.
const HierarchyGraph = defineAsyncComponent(() => import('../components/HierarchyGraph.vue'));

/*
  The containment hierarchy of `Stored inside`, loaded once as flat nodes. The page owns the data,
  the search, and the opened branches, which the Tree and Graph views both render. The chosen view
  lives in the address (`?view=graph`), so Back from an item returns to it; Tree is the default.
*/
defineOptions({ name: 'ItemHierarchy' });
const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const items = ref([]);
const loading = ref(true);
const error = ref('');
const query = ref('');

const tree = computed(() => buildTree(items.value));
const search = computed(() => (query.value.trim() ? searchTree(tree.value, query.value) : null));
const { rows, toggle, expandAll, collapseAll } = useHierarchyExpansion(tree, search);
const view = computed({
  get: () => (route.query.view === 'graph' ? 'graph' : 'tree'),
  set: value => router.replace({ query: { ...route.query, view: value === 'graph' ? 'graph' : undefined } })
});
const subtitle = computed(() => (loading.value || error.value ? '' : t('items.count', items.value.length)));

async function load() {
  loading.value = true; error.value = '';
  try { items.value = (await api('/api/items/hierarchy')).items; } catch (e) { error.value = e.message; } finally { loading.value = false; }
}
onMounted(load);
</script>

<template>
  <PageHeader
    :title="$t('hierarchy.title')"
    :subtitle="subtitle"
  />

  <p class="text-secondary">
    {{ $t('hierarchy.intro') }}
  </p>

  <div
    v-if="loading"
    class="card"
  >
    <div class="card-body d-flex align-items-center gap-2 text-secondary">
      <span
        class="spinner-border spinner-border-sm"
        aria-hidden="true"
      />
      {{ $t('hierarchy.loading') }}
    </div>
  </div>

  <div
    v-else-if="error"
    class="alert alert-danger d-flex flex-wrap align-items-center gap-2"
    role="alert"
  >
    <span class="me-auto">{{ error }}</span>
    <button
      type="button"
      class="btn btn-sm"
      @click="load"
    >
      {{ $t('common.retry') }}
    </button>
  </div>

  <div
    v-else-if="!items.length"
    class="card"
  >
    <div class="empty">
      <p class="empty-title">
        {{ $t('hierarchy.emptyTitle') }}
      </p>
      <p class="empty-subtitle text-secondary">
        {{ $t('hierarchy.emptyText') }}
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

  <template v-else>
    <div class="card mb-3">
      <div class="card-body d-flex flex-wrap align-items-end gap-3">
        <div class="flex-grow-1">
          <label
            class="form-label"
            for="hierarchy-search"
          >{{ $t('hierarchy.search') }}</label>
          <input
            id="hierarchy-search"
            v-model="query"
            type="search"
            class="form-control"
            :placeholder="$t('hierarchy.searchPlaceholder')"
          >
        </div>
        <div
          class="btn-group"
          role="group"
          :aria-label="$t('hierarchy.view')"
        >
          <template
            v-for="option in ['tree', 'graph']"
            :key="option"
          >
            <input
              :id="`hierarchy-view-${option}`"
              v-model="view"
              type="radio"
              class="btn-check"
              name="hierarchy-view"
              :value="option"
            >
            <label
              class="btn"
              :for="`hierarchy-view-${option}`"
            >{{ $t(`hierarchy.views.${option}`) }}</label>
          </template>
        </div>
      </div>
    </div>

    <div
      v-if="search && !search.matches.size"
      class="card"
    >
      <div class="empty">
        <p class="empty-title">
          {{ $t('hierarchy.noMatches') }}
        </p>
        <p class="empty-subtitle text-secondary">
          {{ $t('hierarchy.noMatchesText', { query: query.trim() }) }}
        </p>
      </div>
    </div>
    <HierarchyGraph
      v-else-if="view === 'graph'"
      :rows="rows"
      :search="search"
      @toggle="toggle"
      @expand-all="expandAll"
      @collapse-all="collapseAll"
    />
    <HierarchyTree
      v-else
      :rows="rows"
      :search="search"
      @toggle="toggle"
      @expand-all="expandAll"
      @collapse-all="collapseAll"
    />
  </template>
</template>
