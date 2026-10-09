/*
  The two projections of the Hierarchy page, derived from the flat `GET /api/items/hierarchy` nodes
  and shared by the Tree and Graph views. Both build the same normalized tree — virtual groups under
  the Inventory root, their root items, and the item links kept by the projection — so search,
  expansion, and the visible rows never know which grouping they show.

  Location: the storage hierarchy. Every `parent_id` link is kept, and every top-level branch is
  grouped under the effective location the server sent for its top-level item, so a branch is never
  split by the saved locations inside it. Within a location, top-level items that hold something are
  branches, and every top-level leaf is gathered into that location's Uncontained items group.

  Category: the classification hierarchy. An item stays under its direct parent only when both belong
  to the same category; otherwise it is a root item of its category. Intermediate parents of another
  category are never skipped, so no relation is invented, and every item appears exactly once.
*/

/*
  Keys of the virtual nodes in expansion sets and rows. Item ids are numbers, so a string key can
  never collide with one. A location key holds its normalized location, which is never empty for a
  named location, so `location:` and `uncontained:` alone are the reserved keys of No location. A
  category key holds the category id, never its name.
*/
export const ROOT = 'inventory';
export const locationKey = normalized => `location:${normalized}`;
export const uncontainedKey = normalized => `uncontained:${normalized}`;
export const categoryKey = id => `category:${id}`;

// Surrounding spaces and letter case never split one location; an empty result means no location.
export const normalizeLocation = value => (value ?? '').trim().toLowerCase();

// The most used spelling names the location; equally used ones fall back to code-point order.
function displayName(spellings) {
  let best = null;
  for (const [name, count] of spellings) {
    const bestCount = best === null ? 0 : spellings.get(best);
    if (count > bestCount || (count === bestCount && name < best)) best = name;
  }
  return best;
}

/*
  The normalized tree of one projection. `linked(parent, item)` tells whether the projection keeps an
  item under its direct parent; every other item is a root of the group `groupOf(root)` describes,
  `{ id, ...fields }` with a stable id. A group with a `leavesKey` gathers its leaf roots into that
  virtual group. `groupOf` records the group of every item reachable from a root.
*/
function project(mode, items, linked, groupFor) {
  const byId = new Map(items.map(item => [item.id, item]));
  const children = new Map();
  const parentOf = new Map();
  for (const item of items) {
    const parent = byId.get(item.parent_id);
    if (!parent || !linked(parent, item)) continue;
    parentOf.set(item.id, parent.id);
    if (!children.has(parent.id)) children.set(parent.id, []);
    children.get(parent.id).push(item);
  }

  const groups = new Map();
  const groupOf = new Map();
  for (const item of items) {
    if (parentOf.has(item.id)) continue;
    const { id, ...fields } = groupFor(item);
    if (!groups.has(id)) groups.set(id, { leavesKey: null, ...fields, branches: [], leaves: [], itemCount: 0 });
    const group = groups.get(id);
    (group.leavesKey && !children.has(item.id) ? group.leaves : group.branches).push(item);
    for (const stack = [item]; stack.length;) {
      const next = stack.pop();
      groupOf.set(next.id, group);
      group.itemCount += 1;
      stack.push(...(children.get(next.id) || []));
    }
  }
  return { mode, byId, children, parentOf, groupOf, groups: [...groups.values()] };
}

export function buildLocationTree(items) {
  const tree = project('location', items, () => true, item => {
    const normalized = normalizeLocation(item.effective_location);
    return { id: normalized, type: 'location', key: locationKey(normalized), leavesKey: uncontainedKey(normalized) };
  });
  for (const group of tree.groups) {
    const spellings = new Map();
    for (const item of [...group.branches, ...group.leaves]) {
      const spelling = item.effective_location?.trim();
      if (spelling) spellings.set(spelling, (spellings.get(spelling) || 0) + 1);
    }
    group.name = displayName(spellings);
  }
  // Named locations by name, then No location last.
  tree.groups.sort((a, b) => (a.name === null) - (b.name === null) || (a.name ?? '').localeCompare(b.name ?? '') || (a.key < b.key ? -1 : 1));
  return tree;
}

export function buildCategoryTree(items) {
  const tree = project('category', items, (parent, item) => parent.category_id === item.category_id,
    item => ({ id: item.category_id, type: 'category', key: categoryKey(item.category_id), name: item.category_name }));
  tree.groups.sort((a, b) => a.name.localeCompare(b.name) || (a.key < b.key ? -1 : 1));
  return tree;
}

const childrenOf = (tree, id) => tree.children.get(id) || [];
const fold = text => text.toLocaleLowerCase();

// Walks up the projection's parent links; the visited set stops a damaged cyclic chain from looping.
function addAncestors(tree, item, into) {
  const seen = new Set([item.id]);
  for (let id = tree.parentOf.get(item.id); id !== undefined && !seen.has(id); id = tree.parentOf.get(id)) {
    seen.add(id);
    into.add(id);
  }
}

function addDescendants(tree, id, into) {
  for (const child of childrenOf(tree, id)) {
    if (into.has(child.id)) continue;
    into.add(child.id);
    addDescendants(tree, child.id, into);
  }
}

/*
  Items and named groups (locations or categories) whose name contains the query, ignoring case. A
  matching item stays visible with its whole path from its group in this projection, so it is never
  shown without its context, and with its contents, which stay collapsed until opened. Only the path
  down to each match is expanded. A matching group is opened one level, with all of its contents
  available.
*/
export function searchTree(tree, query) {
  const text = fold(query.trim());
  const matches = new Set();
  const visible = new Set();
  const expanded = new Set();
  if (!text) return { matches, visible, expanded };
  for (const item of tree.byId.values()) {
    const group = tree.groupOf.get(item.id);
    // An item of a damaged cycle is reachable from no group and never shown.
    if (!group || !fold(item.name).includes(text)) continue;
    matches.add(item.id);
    visible.add(item.id);
    addAncestors(tree, item, expanded);
    addDescendants(tree, item.id, visible);
    expanded.add(group.key);
    if (group.leavesKey && !tree.parentOf.has(item.id) && !tree.children.has(item.id)) expanded.add(group.leavesKey);
  }
  for (const group of tree.groups) {
    if (group.name === null || !fold(group.name).includes(text)) continue;
    matches.add(group.key);
    expanded.add(group.key);
    for (const item of [...group.branches, ...group.leaves]) {
      visible.add(item.id);
      addDescendants(tree, item.id, visible);
    }
  }
  for (const id of expanded) visible.add(id);
  return { matches, visible, expanded };
}

// The root items of a group that `visible` (a search result, or null for all) keeps.
function shownRoots(group, visible) {
  const shown = item => !visible || visible.has(item.id);
  return { branches: group.branches.filter(shown), leaves: group.leaves.filter(shown) };
}

// Every key "Expand all" opens: each group, its Uncontained items, and each item with contents, limited to the visible ones.
export function expandableKeys(tree, visible = null) {
  const keys = new Set();
  for (const group of tree.groups) {
    const { branches, leaves } = shownRoots(group, visible);
    if (branches.length || leaves.length) keys.add(group.key);
    if (leaves.length) keys.add(group.leavesKey);
  }
  for (const [id, items] of tree.children) {
    if ((!visible || visible.has(id)) && items.some(item => !visible || visible.has(item.id))) keys.add(id);
  }
  return keys;
}

/*
  The rows currently on screen, in order, with their depth and the key of the row they sit in (`ROOT`
  for the group level). Only expanded branches are walked, so collapsed descendants are never
  rendered. `visible` limits the rows to a search result. Every row carries its group; a group row
  (`location` or `category`) also carries the number of real items in all of its branches. An item row
  counts its contents in this projection, and names its direct physical container as `storedIn` when
  the projection does not show it as the item's parent.
*/
export function visibleRows(tree, expanded, visible = null) {
  const rows = [];
  const shown = item => !visible || visible.has(item.id);
  const walk = (item, group, depth, parent) => {
    const contents = childrenOf(tree, item.id);
    const items = contents.filter(shown);
    const storedIn = item.parent_id !== null && item.parent_id !== parent ? tree.byId.get(item.parent_id) ?? null : null;
    rows.push({
      key: item.id, type: 'item', item, group, depth, parent, childCount: items.length,
      contentCount: contents.length, storedIn, expanded: expanded.has(item.id)
    });
    if (!expanded.has(item.id)) return;
    for (const child of items) walk(child, group, depth + 1, item.id);
  };
  for (const group of tree.groups) {
    const { branches, leaves } = shownRoots(group, visible);
    if (!branches.length && !leaves.length) continue;
    rows.push({
      key: group.key, type: group.type, group, depth: 0, parent: ROOT,
      childCount: branches.length + (leaves.length ? 1 : 0), itemCount: group.itemCount, expanded: expanded.has(group.key)
    });
    if (!expanded.has(group.key)) continue;
    for (const item of branches) walk(item, group, 1, group.key);
    if (!leaves.length) continue;
    const key = group.leavesKey;
    rows.push({ key, type: 'uncontained', group, depth: 1, parent: group.key, childCount: leaves.length, expanded: expanded.has(key) });
    if (expanded.has(key)) for (const item of leaves) walk(item, group, 2, key);
  }
  return rows;
}

// The name a row is announced by, for its expand/collapse button; `t` is the vue-i18n translate function.
export function rowName(row, t) {
  if (row.type === 'item') return row.item.name;
  const name = row.group.name ?? t('hierarchy.noLocation');
  return row.type === 'uncontained' ? t('hierarchy.uncontainedIn', { location: name }) : name;
}

/*
  The secondary line of an item row: Retired for a retired item, the category (redundant under a
  category, so left out there), the effective location, and the physical container the projection does
  not already show as the parent.
*/
export function itemMeta(row, t) {
  const { item, group, storedIn } = row;
  return [item.lifecycle_status === 'retired' ? t('lifecycle.statuses.retired') : null,
    group.type === 'category' ? null : item.category_name, item.effective_location,
    storedIn ? t('hierarchy.storedIn', { name: storedIn.name }) : null].filter(Boolean).join(' · ');
}
