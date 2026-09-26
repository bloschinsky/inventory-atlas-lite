/*
  The storage tree of the Hierarchy page, derived from the flat `GET /api/items/hierarchy` nodes and
  shared by the Tree and Graph views. The Inventory root and the Uncontained items group exist only
  here: top-level items that hold something are the root branches, and every top-level leaf is
  gathered into the one group.
*/

// Keys of the virtual root and group in expansion sets and rows; item ids are numbers, so they can never collide.
export const ROOT = 'inventory';
export const UNCONTAINED = 'uncontained';

export function buildTree(items) {
  const byId = new Map(items.map(item => [item.id, item]));
  const children = new Map();
  const containers = [];
  const uncontained = [];
  for (const item of items) {
    if (item.parent_id === null) continue;
    if (!children.has(item.parent_id)) children.set(item.parent_id, []);
    children.get(item.parent_id).push(item);
  }
  for (const item of items) {
    if (item.parent_id !== null) continue;
    (children.has(item.id) ? containers : uncontained).push(item);
  }
  return { byId, children, containers, uncontained };
}

const childrenOf = (tree, id) => tree.children.get(id) || [];

// Walks up the parent chain; the visited set stops a damaged cyclic chain from looping.
function addAncestors(tree, item, into) {
  const seen = new Set([item.id]);
  for (let parent = tree.byId.get(item.parent_id); parent && !seen.has(parent.id); parent = tree.byId.get(parent.parent_id)) {
    seen.add(parent.id);
    into.add(parent.id);
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
  Items whose name contains the query, ignoring case. A match stays visible with its whole ancestor
  path, so it is never shown without its context, and with its contents, which stay collapsed until
  opened. Only the path down to each match is expanded.
*/
export function searchTree(tree, query) {
  const text = query.trim().toLocaleLowerCase();
  const matches = new Set();
  const visible = new Set();
  const expanded = new Set();
  if (!text) return { matches, visible, expanded };
  for (const item of tree.byId.values()) {
    if (!item.name.toLocaleLowerCase().includes(text)) continue;
    matches.add(item.id);
    visible.add(item.id);
    addAncestors(tree, item, expanded);
    addDescendants(tree, item.id, visible);
  }
  for (const id of expanded) visible.add(id);
  if (tree.uncontained.some(item => matches.has(item.id))) expanded.add(UNCONTAINED);
  return { matches, visible, expanded };
}

// Every key "Expand all" opens: the group and each container, limited to the visible ones.
export function expandableKeys(tree, visible = null) {
  const keys = new Set();
  if (tree.uncontained.some(item => !visible || visible.has(item.id))) keys.add(UNCONTAINED);
  for (const [id, items] of tree.children) {
    if ((!visible || visible.has(id)) && items.some(item => !visible || visible.has(item.id))) keys.add(id);
  }
  return keys;
}

/*
  The rows currently on screen, in order, with their depth and the key of the row they sit in (`ROOT`
  for the root level). Only expanded branches are walked, so collapsed descendants are never
  rendered. `visible` limits the rows to a search result.
*/
export function visibleRows(tree, expanded, visible = null) {
  const rows = [];
  const shown = item => !visible || visible.has(item.id);
  const walk = (item, depth, parent) => {
    const items = childrenOf(tree, item.id).filter(shown);
    rows.push({ key: item.id, type: 'item', item, depth, parent, childCount: items.length, expanded: expanded.has(item.id) });
    if (!expanded.has(item.id)) return;
    for (const child of items) walk(child, depth + 1, item.id);
  };
  for (const item of tree.containers.filter(shown)) walk(item, 0, ROOT);
  const leaves = tree.uncontained.filter(shown);
  if (leaves.length) {
    rows.push({ key: UNCONTAINED, type: 'group', depth: 0, parent: ROOT, childCount: leaves.length, expanded: expanded.has(UNCONTAINED) });
    if (expanded.has(UNCONTAINED)) for (const item of leaves) walk(item, 1, UNCONTAINED);
  }
  return rows;
}
