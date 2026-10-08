<script setup>
import { IconBox, IconChevronRight, IconInbox, IconMapPin, IconMapPinOff, IconPackage, IconTags } from '@tabler/icons-vue';
import { itemMeta, rowName } from '../hierarchyTree.js';
import { photoUrl } from '../api.js';

/*
  The read-only Tree view of the Hierarchy page: one flat list of the visible rows indented by depth.
  The page owns the projection and the expansion, which the Graph view shares; the rows are the same
  for both groupings, so nothing here knows the Location or Category rules.
*/
defineProps({
  // The visibleRows() of the page's expansion.
  rows: { type: Array, required: true },
  // The searchTree() result, or null while nothing is searched.
  search: { type: Object, default: null }
});
defineEmits(['toggle', 'expand-all', 'collapse-all']);
</script>

<template>
  <section
    class="card"
    data-tour="hierarchy-tree"
  >
    <div class="card-header flex-wrap gap-2">
      <h2 class="card-title">
        {{ $t('hierarchy.root') }}
      </h2>
      <div class="card-actions d-flex flex-wrap gap-2 ms-auto">
        <button
          type="button"
          class="btn btn-sm"
          @click="$emit('expand-all')"
        >
          {{ $t('hierarchy.expandAll') }}
        </button>
        <button
          type="button"
          class="btn btn-sm"
          @click="$emit('collapse-all')"
        >
          {{ $t('hierarchy.collapseAll') }}
        </button>
      </div>
    </div>
    <ul
      class="list-group list-group-flush hierarchy-tree"
      :aria-label="$t('hierarchy.root')"
    >
      <li
        v-for="row in rows"
        :key="row.key"
        class="list-group-item hierarchy-row"
        :class="{
          'hierarchy-row-location': row.type === 'location',
          'hierarchy-row-category': row.type === 'category',
          'item-retired': row.item?.lifecycle_status === 'retired'
        }"
        :style="{ '--hierarchy-depth': row.depth }"
      >
        <button
          v-if="row.childCount"
          type="button"
          class="btn btn-ghost-secondary btn-icon btn-sm hierarchy-toggle"
          :aria-expanded="row.expanded"
          :aria-label="$t(row.expanded ? 'hierarchy.collapse' : 'hierarchy.expand', { name: rowName(row, $t) })"
          @click="$emit('toggle', row.key)"
        >
          <IconChevronRight
            :size="18"
            :class="{ 'hierarchy-chevron-open': row.expanded }"
            aria-hidden="true"
          />
        </button>
        <span
          v-else
          class="hierarchy-toggle"
          aria-hidden="true"
        />
        <template v-if="row.type === 'location' || row.type === 'category'">
          <span
            class="item-thumb hierarchy-thumb"
            aria-hidden="true"
          ><component
            :is="row.type === 'category' ? IconTags : row.group.name === null ? IconMapPinOff : IconMapPin"
            :size="18"
          /></span>
          <span
            class="hierarchy-label fw-bold"
            :class="{ 'hierarchy-match': search?.matches.has(row.key) }"
          >{{ rowName(row, $t) }}</span>
          <span class="badge bg-azure-lt ms-auto">{{ $t('items.count', row.itemCount) }}</span>
        </template>
        <template v-else-if="row.type === 'uncontained'">
          <span
            class="item-thumb hierarchy-thumb"
            aria-hidden="true"
          ><IconInbox :size="18" /></span>
          <span class="hierarchy-label fw-medium">{{ $t('hierarchy.uncontained') }}</span>
          <span class="badge bg-secondary-lt ms-auto">{{ $t('items.count', row.childCount) }}</span>
        </template>
        <template v-else>
          <span class="item-thumb hierarchy-thumb">
            <img
              v-if="row.item.thumbnail_id"
              :src="photoUrl(row.item.thumbnail_id)"
              alt=""
              loading="lazy"
            >
            <component
              :is="row.contentCount ? IconBox : IconPackage"
              v-else
              :size="18"
              aria-hidden="true"
            />
          </span>
          <span class="hierarchy-label">
            <RouterLink
              :to="`/items/${row.item.id}`"
              class="item-card-link"
              :class="{ 'hierarchy-match': search?.matches.has(row.item.id) }"
            >{{ row.item.name }}</RouterLink>
            <span class="meta-text d-block">{{ itemMeta(row, $t) }}</span>
          </span>
          <span
            v-if="row.contentCount"
            class="badge bg-secondary-lt ms-auto"
          >{{ $t('items.count', row.contentCount) }}</span>
        </template>
      </li>
    </ul>
  </section>
</template>
