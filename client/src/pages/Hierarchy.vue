<script setup>
import { computed, defineAsyncComponent, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { api } from '../api.js';
import { buildCategoryTree, buildLocationTree, searchTree } from '../hierarchyTree.js';
import { useHierarchyExpansion } from '../useHierarchyExpansion.js';
import PageHeader from '../components/PageHeader.vue';
import HierarchyTree from '../components/HierarchyTree.vue';

// The graph library is only downloaded once the Graph view is opened.
const HierarchyGraph = defineAsyncComponent(() => import('../components/HierarchyGraph.vue'));

/*
  The hierarchy of every item, loaded once as flat nodes and projected either by location (the storage
  tree of `Stored inside`) or by category. The page owns the data, the grouping, the search, and the
  opened branches, which the Tree and Graph views both render. The grouping and the view are two
  independent choices kept in the address (`?group=category`, `?view=graph`), so Back from an item
  returns to them; Location and Tree are the defaults, and unknown values fall back to them.
*/
defineOptions({ name: 'ItemHierarchy' });
const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const items = ref([]);
const loading = ref(true);
const error = ref('');
const query = ref('');

const GROUPS = ['location', 'category'];
const VIEWS = ['tree', 'graph'];
// A choice in the address; the default is left out of it.
const choice = (name, options) => computed({
  get: () => (options.includes(route.query[name]) ? route.query[name] : options[0]),
  set: value => router.replace({ query: { ...route.query, [name]: value === options[0] ? undefined : value } })
});
const group = choice('group', GROUPS);
const view = choice('view', VIEWS);
/*
  The two independent switches: what the hierarchy means, and how it is drawn. Inside this plain
  array the template does not unwrap `model`, so it stays the address-backed ref.
*/
const controls = [
  { name: 'group', label: 'hierarchy.groupBy', options: GROUPS, model: group, text: 'hierarchy.groups' },
  { name: 'view', label: 'hierarchy.view', options: VIEWS, model: view, text: 'hierarchy.views' }
];

const tree = computed(() => (group.value === 'category' ? buildCategoryTree : buildLocationTree)(items.value));
const search = computed(() => (query.value.trim() ? searchTree(tree.value, query.value) : null));
const { rows, toggle, expandAll, collapseAll } = useHierarchyExpansion(tree, search);
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
    {{ $t(`hierarchy.intro.${group}`) }}
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
    <div
      class="card mb-3"
      data-tour="hierarchy-controls"
    >
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
            :placeholder="$t(`hierarchy.searchPlaceholder.${group}`)"
          >
        </div>
        <div
          v-for="control in controls"
          :key="control.name"
          :data-tour="`hierarchy-${control.name}`"
        >
          <div
            :id="`hierarchy-${control.name}-label`"
            class="form-label"
          >
            {{ $t(control.label) }}
          </div>
          <div
            class="btn-group"
            role="group"
            :aria-labelledby="`hierarchy-${control.name}-label`"
          >
            <template
              v-for="option in control.options"
              :key="option"
            >
              <input
                :id="`hierarchy-${control.name}-${option}`"
                type="radio"
                class="btn-check"
                :name="`hierarchy-${control.name}`"
                :value="option"
                :checked="control.model.value === option"
                @change="control.model.value = option"
              >
              <label
                class="btn"
                :for="`hierarchy-${control.name}-${option}`"
              >{{ $t(`${control.text}.${option}`) }}</label>
            </template>
          </div>
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
          {{ $t(`hierarchy.noMatchesText.${group}`, { query: query.trim() }) }}
        </p>
      </div>
    </div>
    <HierarchyGraph
      v-else-if="view === 'graph'"
      :rows="rows"
      :search="search"
      :mode="group"
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
