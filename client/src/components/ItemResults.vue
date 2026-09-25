<script setup>
import { computed } from 'vue';
import ItemThumbnail from './ItemThumbnail.vue';
import SortableHeader from './SortableHeader.vue';
import { columnText } from '../itemColumns.js';
import { labelSelection, toggleLabelSelection } from '../labelSelection.js';

/*
  `columns` are the visible columns in their display order. The table renders one cell per column;
  the cards keep the name as the title and the photo beside it, and list every other column as a
  labeled line. The selection checkbox and the actions are interface controls, never columns.
*/
const props = defineProps({
  items: { type: Array, required: true },
  columns: { type: Array, required: true },
  sort: { type: String, required: true },
  direction: { type: String, required: true }
});
defineEmits(['sort']);

// The header checkbox covers the visible page only; selections made on other pages are left alone.
const pageSelected = computed(() => props.items.length > 0 && props.items.every(item => labelSelection.has(item.uuid)));
const pagePartlySelected = computed(() => !pageSelected.value && props.items.some(item => labelSelection.has(item.uuid)));
const togglePage = selected => props.items.forEach(item => toggleLabelSelection(item.uuid, selected));

const showPhoto = computed(() => props.columns.some(column => column.key === 'photo'));
const metaColumns = computed(() => props.columns.filter(column => column.key !== 'photo' && column.key !== 'name'));
// The transfer badge beside the name stands in for the Transferred To column while that column is hidden.
const showTransferBadge = computed(() => !props.columns.some(column => column.key === 'transferredTo'));

// The table and the card list show the same data through the same routes; only the markup differs.
const detailsRoute = item => `/items/${item.id}`;
const editRoute = item => `/items/${item.id}/edit`;
</script>

<template>
  <div class="card d-none d-lg-block">
    <div class="table-responsive">
      <table class="table table-vcenter table-hover card-table">
        <thead>
          <tr>
            <th
              scope="col"
              class="w-1"
            >
              <input
                type="checkbox"
                class="form-check-input m-0 align-middle"
                :aria-label="$t('items.selectPage')"
                :checked="pageSelected"
                :indeterminate="pagePartlySelected"
                @change="togglePage($event.target.checked)"
              >
            </th>
            <SortableHeader
              v-for="column in columns"
              :key="column.key"
              :class="{ 'name-cell': column.key === 'name' }"
              :label="column.label"
              :sortable="column.sortable"
              :active="column.key === sort"
              :direction="direction"
              @sort="$emit('sort', column.key)"
            />
            <th
              scope="col"
              class="text-end"
            >
              {{ $t('common.actions') }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="item in items"
            :key="item.id"
          >
            <td>
              <input
                type="checkbox"
                class="form-check-input m-0 align-middle"
                :aria-label="$t('items.select', { name: item.name })"
                :checked="labelSelection.has(item.uuid)"
                @change="toggleLabelSelection(item.uuid, $event.target.checked)"
              >
            </td>
            <template
              v-for="column in columns"
              :key="column.key"
            >
              <td v-if="column.key === 'photo'">
                <ItemThumbnail
                  :photo-id="item.thumbnail_id"
                  :name="item.name"
                />
              </td>
              <td
                v-else-if="column.key === 'name'"
                class="name-cell"
              >
                <RouterLink
                  :to="detailsRoute(item)"
                  class="fw-semibold"
                >
                  {{ item.name }}
                </RouterLink>
                <div
                  v-if="showTransferBadge && item.transferred_to"
                  class="mt-1"
                >
                  <span class="badge bg-azure-lt text-wrap text-break text-start">
                    {{ $t('items.transferredTo', { name: item.transferred_to }) }}
                  </span>
                </div>
              </td>
              <td
                v-else
                class="truncate-cell"
                :title="columnText(item, column) || undefined"
              >
                <RouterLink
                  v-if="column.key === 'storedInside' && item.parent_id"
                  :to="`/items/${item.parent_id}`"
                >
                  {{ item.parent_name }}
                </RouterLink>
                <template v-else>
                  {{ columnText(item, column) || '—' }}
                </template>
              </td>
            </template>
            <td class="text-end text-nowrap">
              <RouterLink
                :to="detailsRoute(item)"
                class="btn btn-sm me-1"
                :aria-label="$t('items.viewItem', { name: item.name })"
              >
                {{ $t('common.view') }}
              </RouterLink>
              <RouterLink
                :to="editRoute(item)"
                class="btn btn-sm btn-primary"
                :aria-label="$t('items.editItem', { name: item.name })"
              >
                {{ $t('common.edit') }}
              </RouterLink>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <ul class="list-unstyled d-lg-none mb-0 d-grid gap-2">
    <li
      v-for="item in items"
      :key="item.id"
      class="card item-card"
    >
      <div class="card-body p-3">
        <div class="d-flex gap-3">
          <!-- The label around the box gives the checkbox a touch-sized target. -->
          <label class="item-card-select">
            <input
              type="checkbox"
              class="form-check-input m-0"
              :aria-label="$t('items.select', { name: item.name })"
              :checked="labelSelection.has(item.uuid)"
              @change="toggleLabelSelection(item.uuid, $event.target.checked)"
            >
          </label>
          <ItemThumbnail
            v-if="showPhoto"
            :photo-id="item.thumbnail_id"
            :name="item.name"
            large
          />
          <div class="min-w-0 flex-grow-1">
            <RouterLink
              :to="detailsRoute(item)"
              class="item-card-link"
            >
              {{ item.name }}
            </RouterLink>
            <!-- Empty values are left out to keep the card short; the category needs no label. -->
            <template
              v-for="column in metaColumns"
              :key="column.key"
            >
              <p
                v-if="columnText(item, column)"
                class="meta-text mb-0"
              >
                <template v-if="column.key === 'category'">
                  {{ columnText(item, column) }}
                </template>
                <template v-else>
                  {{ column.label }}:
                  <RouterLink
                    v-if="column.key === 'storedInside'"
                    :to="`/items/${item.parent_id}`"
                  >
                    {{ item.parent_name }}
                  </RouterLink>
                  <template v-else>
                    {{ columnText(item, column) }}
                  </template>
                </template>
              </p>
            </template>
            <p
              v-if="showTransferBadge && item.transferred_to"
              class="mb-0 mt-1"
            >
              <span class="badge bg-azure-lt text-wrap text-break text-start">
                {{ $t('items.transferredTo', { name: item.transferred_to }) }}
              </span>
            </p>
          </div>
        </div>
        <div class="d-flex gap-2 mt-3 justify-content-sm-end">
          <RouterLink
            :to="detailsRoute(item)"
            class="btn btn-sm flex-fill flex-sm-grow-0 px-sm-4"
            :aria-label="$t('items.viewItem', { name: item.name })"
          >
            {{ $t('common.view') }}
          </RouterLink>
          <RouterLink
            :to="editRoute(item)"
            class="btn btn-sm btn-primary flex-fill flex-sm-grow-0 px-sm-4"
            :aria-label="$t('items.editItem', { name: item.name })"
          >
            {{ $t('common.edit') }}
          </RouterLink>
        </div>
      </div>
    </li>
  </ul>
</template>
