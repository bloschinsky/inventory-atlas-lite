import { computed, ref, watch } from 'vue';
import { expandableKeys, visibleRows } from './hierarchyTree.js';

/*
  The opened branches of the Hierarchy page, shared by the Tree and Graph views so switching views
  keeps them. Each grouping mode keeps its own browsing set, because the same item can sit at a
  different place in each projection, so switching Location -> Category -> Location restores both.
  A search keeps a separate set, so clearing it returns to the branches the user had opened before
  it. `tree` and `search` are refs of the page; `tree.value.mode` names the projection.
*/
export function useHierarchyExpansion(tree, search) {
  const browseExpanded = { location: ref(new Set()), category: ref(new Set()) };
  const searchExpanded = ref(new Set());
  const expansion = () => (search.value ? searchExpanded : browseExpanded[tree.value.mode]);
  const rows = computed(() => visibleRows(tree.value, expansion().value, search.value?.visible));

  // The search follows the tree, so switching the grouping recomputes it for the new projection.
  watch(search, value => { searchExpanded.value = new Set(value?.expanded); });

  // Sets are replaced rather than mutated, so the computed rows always follow.
  function toggle(key) {
    const next = new Set(expansion().value);
    if (next.has(key)) next.delete(key); else next.add(key);
    expansion().value = next;
  }
  const expandAll = () => { expansion().value = expandableKeys(tree.value, search.value?.visible); };
  const collapseAll = () => { expansion().value = new Set(); };

  return { rows, toggle, expandAll, collapseAll };
}
