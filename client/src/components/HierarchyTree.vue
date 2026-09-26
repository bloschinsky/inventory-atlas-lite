<script setup>
import { IconBox, IconChevronRight, IconInbox, IconPackage } from '@tabler/icons-vue';

/*
  The read-only Tree view of the Hierarchy page: one flat list of the visible rows indented by depth.
  The page owns the expansion, which the Graph view shares.
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
  <section class="card">
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
        :style="{ '--hierarchy-depth': row.depth }"
      >
        <button
          v-if="row.childCount"
          type="button"
          class="btn btn-ghost-secondary btn-icon btn-sm hierarchy-toggle"
          :aria-expanded="row.expanded"
          :aria-label="$t(row.expanded ? 'hierarchy.collapse' : 'hierarchy.expand', {
            name: row.type === 'group' ? $t('hierarchy.uncontained') : row.item.name
          })"
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
        <template v-if="row.type === 'group'">
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
              :src="`/api/photos/${row.item.thumbnail_id}`"
              alt=""
              loading="lazy"
            >
            <component
              :is="row.item.children_count ? IconBox : IconPackage"
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
            <span class="meta-text d-block">
              {{ row.item.category_name }}<template v-if="row.item.effective_location"> · {{ row.item.effective_location }}</template>
            </span>
          </span>
          <span
            v-if="row.item.children_count"
            class="badge bg-secondary-lt ms-auto"
          >{{ $t('items.count', row.item.children_count) }}</span>
        </template>
      </li>
    </ul>
  </section>
</template>
