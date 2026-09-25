<script setup>
import { computed } from 'vue';
import ItemThumbnail from './ItemThumbnail.vue';
import { labelSelection, toggleLabelSelection } from '../labelSelection.js';

const props = defineProps({ items: { type: Array, required: true } });

// The header checkbox covers the visible page only; selections made on other pages are left alone.
const pageSelected = computed(() => props.items.length > 0 && props.items.every(item => labelSelection.has(item.uuid)));
const pagePartlySelected = computed(() => !pageSelected.value && props.items.some(item => labelSelection.has(item.uuid)));
const togglePage = selected => props.items.forEach(item => toggleLabelSelection(item.uuid, selected));

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
            <th scope="col">
              {{ $t('items.fields.photo') }}
            </th>
            <th
              scope="col"
              class="name-cell"
            >
              {{ $t('items.fields.name') }}
            </th>
            <th scope="col">
              {{ $t('items.fields.category') }}
            </th>
            <th scope="col">
              {{ $t('items.fields.condition') }}
            </th>
            <th
              scope="col"
              class="d-none d-xl-table-cell"
            >
              {{ $t('items.fields.location') }}
            </th>
            <th
              scope="col"
              class="d-none d-xl-table-cell"
            >
              {{ $t('items.fields.storedInside') }}
            </th>
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
            <td>
              <ItemThumbnail
                :photo-id="item.thumbnail_id"
                :name="item.name"
              />
            </td>
            <td class="name-cell">
              <RouterLink
                :to="detailsRoute(item)"
                class="fw-semibold"
              >
                {{ item.name }}
              </RouterLink>
              <div
                v-if="item.transferred_to"
                class="mt-1"
              >
                <span class="badge bg-azure-lt text-wrap text-break text-start">
                  {{ $t('items.transferredTo', { name: item.transferred_to }) }}
                </span>
              </div>
              <span
                v-if="item.effective_location || item.parent_id"
                class="d-xl-none d-block meta-text"
              >
                <template v-if="item.effective_location">{{ item.effective_location }}</template>
                <template v-if="item.effective_location && item.parent_id"> · </template>
                <template v-if="item.parent_id">
                  {{ $t('items.fields.storedInside') }}
                  <RouterLink :to="`/items/${item.parent_id}`">{{ item.parent_name }}</RouterLink>
                </template>
              </span>
            </td>
            <td>{{ item.category_name }}</td>
            <td>{{ item.condition || '—' }}</td>
            <td
              class="truncate-cell d-none d-xl-table-cell"
              :title="item.effective_location || undefined"
            >
              {{ item.effective_location || '—' }}
            </td>
            <td class="truncate-cell d-none d-xl-table-cell">
              <RouterLink
                v-if="item.parent_id"
                :to="`/items/${item.parent_id}`"
                :title="item.parent_name"
              >
                {{ item.parent_name }}
              </RouterLink>
              <template v-else>
                —
              </template>
            </td>
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
            <p class="meta-text mb-0">
              {{ item.category_name }}
            </p>
            <p
              v-if="item.parent_id"
              class="meta-text mb-0"
            >
              {{ $t('items.fields.storedInside') }}
              <RouterLink :to="`/items/${item.parent_id}`">
                {{ item.parent_name }}
              </RouterLink>
            </p>
            <p
              v-if="item.condition || item.effective_location"
              class="meta-text mb-0"
            >
              <template v-if="item.condition">
                {{ item.condition }}
              </template>
              <template v-if="item.condition && item.effective_location">
                ·
              </template>
              <template v-if="item.effective_location">
                {{ item.effective_location }}
              </template>
            </p>
            <p
              v-if="item.transferred_to"
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
