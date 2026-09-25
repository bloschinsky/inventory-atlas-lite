<script setup>
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { api } from '../api.js';
import { formatDateTime } from '../i18n/index.js';
import PageHeader from '../components/PageHeader.vue';

// Item templates: user-defined presets that open the regular Add Item form prefilled.
defineOptions({ name: 'ItemTemplates' });
const { t } = useI18n();
const templates = ref([]);
const loading = ref(true);
const error = ref('');
const search = ref('');

// Template names and category names are user data and are matched exactly as stored.
const shown = computed(() => {
  const query = search.value.trim().toLowerCase();
  if (!query) return templates.value;
  return templates.value.filter(template => [template.name, template.category_name, template.item_name]
    .some(value => value?.toLowerCase().includes(query)));
});
const countLabel = computed(() => t('templates.count', templates.value.length));

async function load() {
  loading.value = true; error.value = '';
  try { templates.value = await api('/api/item-templates'); } catch (e) { error.value = e.message; } finally { loading.value = false; }
}
async function remove(template) {
  if (!confirm(t('templates.confirmDelete', { name: template.name }))) return;
  try {
    await api(`/api/item-templates/${template.id}`, { method: 'DELETE' });
    await load();
  } catch (e) { error.value = e.message; }
}
onMounted(load);
</script>

<template>
  <PageHeader
    :title="$t('templates.title')"
    :subtitle="countLabel"
  >
    <template #actions>
      <RouterLink
        to="/templates/new"
        class="btn btn-primary"
      >
        {{ $t('templates.add') }}
      </RouterLink>
    </template>
  </PageHeader>

  <p class="text-secondary">
    {{ $t('templates.intro') }}
  </p>

  <div
    v-if="error"
    class="alert alert-danger"
    role="alert"
  >
    {{ error }}
  </div>

  <div
    v-if="templates.length"
    class="card mb-3"
  >
    <div class="card-body">
      <label
        class="form-label"
        for="templates-search"
      >{{ $t('common.search') }}</label>
      <input
        id="templates-search"
        v-model="search"
        type="search"
        class="form-control"
        :placeholder="$t('templates.searchPlaceholder')"
      >
    </div>
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
      {{ $t('templates.loading') }}
    </div>
  </div>
  <div
    v-else-if="!shown.length"
    class="card"
  >
    <div class="empty">
      <p class="empty-title">
        {{ templates.length ? $t('templates.noMatches') : $t('templates.emptyTitle') }}
      </p>
      <p class="empty-subtitle text-secondary">
        {{ templates.length ? $t('templates.noMatchesText') : $t('templates.emptyText') }}
      </p>
    </div>
  </div>
  <div
    v-else
    class="card"
  >
    <div class="table-responsive">
      <table class="table table-vcenter card-table">
        <thead>
          <tr>
            <th>{{ $t('templates.name') }}</th>
            <th>{{ $t('items.fields.category') }}</th>
            <th class="d-none d-md-table-cell">
              {{ $t('templates.itemName') }}
            </th>
            <th class="d-none d-md-table-cell">
              {{ $t('templates.modified') }}
            </th>
            <th class="w-1">
              <span class="visually-hidden">{{ $t('common.actions') }}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="template in shown"
            :key="template.id"
          >
            <td class="text-break">
              {{ template.name }}
            </td>
            <td class="text-break">
              <template v-if="template.category_name">
                {{ template.category_name }}
              </template>
              <span
                v-else
                class="badge bg-warning-lt"
              >{{ $t('templates.categoryMissing') }}</span>
            </td>
            <td class="d-none d-md-table-cell text-break">
              {{ template.item_name || '—' }}
            </td>
            <td class="d-none d-md-table-cell text-secondary text-nowrap">
              {{ formatDateTime(template.updated_at) }}
            </td>
            <td>
              <div class="d-flex flex-nowrap gap-2 justify-content-end">
                <!-- A template without a category must be repaired before it can prefill an item. -->
                <RouterLink
                  v-if="template.category_id"
                  :to="{ path: '/items/new', query: { template: template.id } }"
                  class="btn btn-sm btn-primary"
                  :aria-label="$t('templates.useNamed', { name: template.name })"
                >
                  {{ $t('templates.use') }}
                </RouterLink>
                <button
                  v-else
                  type="button"
                  class="btn btn-sm btn-primary"
                  disabled
                  :title="$t('templates.repairFirst')"
                  :aria-label="$t('templates.useNamed', { name: template.name })"
                >
                  {{ $t('templates.use') }}
                </button>
                <RouterLink
                  :to="`/templates/${template.id}/edit`"
                  class="btn btn-sm"
                  :aria-label="$t('templates.editNamed', { name: template.name })"
                >
                  {{ $t('common.edit') }}
                </RouterLink>
                <button
                  type="button"
                  class="btn btn-sm btn-outline-danger"
                  :aria-label="$t('templates.deleteNamed', { name: template.name })"
                  @click="remove(template)"
                >
                  {{ $t('common.delete') }}
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
