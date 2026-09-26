<script setup>
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Handle, MarkerType, Position, VueFlow } from '@vue-flow/core';
import '@vue-flow/core/dist/style.css';
import { IconBox, IconFocusCentered, IconInbox, IconMinus, IconPackage, IconPlus, IconSitemap, IconZoomIn, IconZoomOut } from '@tabler/icons-vue';
import { GRAPH_NODE_LIMIT, fitViewport, graphBounds, layoutGraph } from '../hierarchyGraph.js';

/*
  The read-only Graph view of the Hierarchy page. It draws the same visible rows as the Tree, laid out
  by layoutGraph(); Vue Flow only supplies pan, zoom, and selection. Nodes cannot be dragged or
  connected, and nothing here writes: containment changes only through Stored inside.
*/
const props = defineProps({
  // The visibleRows() of the page's expansion.
  rows: { type: Array, required: true },
  // The searchTree() result, or null while nothing is searched.
  search: { type: Object, default: null }
});
const emit = defineEmits(['toggle', 'expand-all', 'collapse-all']);
const router = useRouter();

const MIN_ZOOM = 0.1;
const pane = ref(null);
let flow = null;

const tooLarge = computed(() => props.rows.length + 1 > GRAPH_NODE_LIMIT);
// Recomputed only when the visible rows change, never for selection or viewport moves.
const layout = computed(() => (tooLarge.value ? { nodes: [], edges: [] } : layoutGraph(props.rows)));
const flowNodes = computed(() => layout.value.nodes.map(node => ({
  id: String(node.key), type: 'hierarchy', position: node.position, data: node, draggable: false, connectable: false
})));
const flowEdges = computed(() => layout.value.edges.map(edge => ({
  id: `${edge.from}-${edge.to}`, source: String(edge.from), target: String(edge.to), type: 'smoothstep',
  markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--tblr-secondary)' }, selectable: false, focusable: false
})));

const paneSize = () => [pane.value.clientWidth, pane.value.clientHeight];
function fit(keys = null) {
  const bounds = graphBounds(layout.value.nodes, keys);
  if (!flow || !pane.value || !bounds) return;
  flow.setViewport(fitViewport(bounds, ...paneSize(), MIN_ZOOM));
}
// A search fits its matches together with the containers on their paths.
const fitSearch = () => fit(props.search ? new Set([...props.search.matches, ...props.search.expanded]) : null);

function onReady(instance) {
  flow = instance;
  fitSearch();
}

const inView = (bounds, { x, y, zoom }, [width, height]) => bounds.x * zoom + x >= 0 && bounds.y * zoom + y >= 0
  && (bounds.x + bounds.width) * zoom + x <= width && (bounds.y + bounds.height) * zoom + y <= height;

/*
  What the next layout change does to the viewport. A toggled node stays where it was while the
  layout around it changes, unless its opened contents would fall outside the pane, which is then
  fitted to them. A new or cleared search, Expand all, and Collapse all fit the relevant area.
*/
let pending = null;
function toggle(key) {
  const node = layout.value.nodes.find(candidate => candidate.key === key);
  pending = { key, position: node.position, opening: !node.expanded };
  emit('toggle', key);
}
watch(() => props.search, () => { pending = 'fit'; });
const expandAll = () => { pending = 'fit'; emit('expand-all'); };
const collapseAll = () => { pending = 'fit'; emit('collapse-all'); };
watch(layout, ({ nodes }) => {
  const action = pending;
  pending = null;
  if (!flow || !pane.value || !action) return;
  if (action === 'fit') return fitSearch();
  const moved = nodes.find(node => node.key === action.key)?.position;
  if (!moved) return;
  const { x, y, zoom } = flow.getViewport();
  const kept = { x: x - (moved.x - action.position.x) * zoom, y: y - (moved.y - action.position.y) * zoom, zoom };
  const branch = graphBounds(nodes, new Set([action.key, ...nodes.filter(node => node.parent === action.key).map(node => node.key)]));
  flow.setViewport(action.opening && !inView(branch, kept, paneSize()) ? fitViewport(branch, ...paneSize(), MIN_ZOOM) : kept);
}, { flush: 'post' });

const openItem = ({ node }) => { if (node.data.item) router.push(`/items/${node.data.item.id}`); };
</script>

<template>
  <section class="card">
    <div class="card-header flex-wrap gap-2">
      <div class="card-actions d-flex flex-wrap gap-2 ms-0 w-100">
        <button
          type="button"
          class="btn btn-sm"
          @click="expandAll"
        >
          {{ $t('hierarchy.expandAll') }}
        </button>
        <button
          type="button"
          class="btn btn-sm"
          @click="collapseAll"
        >
          {{ $t('hierarchy.collapseAll') }}
        </button>
        <div
          class="btn-group ms-auto"
          role="group"
          :aria-label="$t('hierarchy.graphControls')"
        >
          <button
            type="button"
            class="btn btn-sm btn-icon"
            :title="$t('hierarchy.zoomIn')"
            :aria-label="$t('hierarchy.zoomIn')"
            :disabled="tooLarge"
            @click="flow?.zoomIn()"
          >
            <IconZoomIn
              :size="18"
              aria-hidden="true"
            />
          </button>
          <button
            type="button"
            class="btn btn-sm btn-icon"
            :title="$t('hierarchy.zoomOut')"
            :aria-label="$t('hierarchy.zoomOut')"
            :disabled="tooLarge"
            @click="flow?.zoomOut()"
          >
            <IconZoomOut
              :size="18"
              aria-hidden="true"
            />
          </button>
          <button
            type="button"
            class="btn btn-sm btn-icon"
            :title="$t('hierarchy.fitView')"
            :aria-label="$t('hierarchy.fitView')"
            :disabled="tooLarge"
            @click="fit()"
          >
            <IconFocusCentered
              :size="18"
              aria-hidden="true"
            />
          </button>
        </div>
      </div>
    </div>

    <div
      v-if="tooLarge"
      class="card-body"
    >
      <div
        class="alert alert-warning mb-0"
        role="alert"
      >
        {{ $t('hierarchy.graphTooLarge', { count: rows.length, limit: GRAPH_NODE_LIMIT }) }}
      </div>
    </div>
    <div
      v-else
      ref="pane"
      class="hierarchy-graph"
      role="region"
      :aria-label="$t('hierarchy.graphLabel')"
    >
      <VueFlow
        :nodes="flowNodes"
        :edges="flowEdges"
        :nodes-draggable="false"
        :nodes-connectable="false"
        :edges-updatable="false"
        :delete-key-code="null"
        :zoom-on-double-click="false"
        :min-zoom="MIN_ZOOM"
        :max-zoom="2"
        @pane-ready="onReady"
        @node-double-click="openItem"
      >
        <template #node-hierarchy="{ data }">
          <Handle
            v-if="data.type !== 'root'"
            type="target"
            :position="Position.Left"
            :connectable="false"
          />
          <div
            class="hierarchy-node"
            :class="{
              'hierarchy-node-container': data.type === 'item' && data.item.children_count,
              'hierarchy-node-virtual': data.type !== 'item',
              'hierarchy-node-match': data.type === 'item' && search?.matches.has(data.key)
            }"
          >
            <span
              class="item-thumb hierarchy-thumb"
              aria-hidden="true"
            >
              <img
                v-if="data.type === 'item' && data.item.thumbnail_id"
                :src="`/api/photos/${data.item.thumbnail_id}`"
                alt=""
                loading="lazy"
              >
              <IconSitemap
                v-else-if="data.type === 'root'"
                :size="18"
              />
              <IconInbox
                v-else-if="data.type === 'group'"
                :size="18"
              />
              <component
                :is="data.item.children_count ? IconBox : IconPackage"
                v-else
                :size="18"
              />
            </span>
            <span class="hierarchy-node-text">
              <template v-if="data.type === 'item'">
                <RouterLink
                  :to="`/items/${data.item.id}`"
                  class="item-card-link d-block text-truncate nodrag nopan"
                  :title="data.item.name"
                >{{ data.item.name }}</RouterLink>
                <span
                  class="meta-text d-block text-truncate"
                  :title="[data.item.category_name, data.item.effective_location].filter(Boolean).join(' · ')"
                >
                  <template v-if="data.item.children_count">{{ $t('items.count', data.item.children_count) }} · </template>{{ data.item.category_name }}
                </span>
              </template>
              <template v-else>
                <span class="fw-medium d-block text-truncate">{{ $t(data.type === 'root' ? 'hierarchy.root' : 'hierarchy.uncontained') }}</span>
                <span
                  v-if="data.type === 'group'"
                  class="meta-text d-block"
                >{{ $t('items.count', data.childCount) }}</span>
              </template>
            </span>
            <button
              v-if="data.type !== 'root' && data.childCount"
              type="button"
              class="btn btn-ghost-secondary btn-icon btn-sm nodrag nopan"
              :aria-expanded="data.expanded"
              :aria-label="$t(data.expanded ? 'hierarchy.collapse' : 'hierarchy.expand', {
                name: data.type === 'group' ? $t('hierarchy.uncontained') : data.item.name
              })"
              @click.stop="toggle(data.key)"
            >
              <component
                :is="data.expanded ? IconMinus : IconPlus"
                :size="16"
                aria-hidden="true"
              />
            </button>
          </div>
          <Handle
            type="source"
            :position="Position.Right"
            :connectable="false"
          />
        </template>
      </VueFlow>
    </div>
    <div class="card-footer meta-text">
      {{ $t('hierarchy.graphHint') }}
    </div>
  </section>
</template>
