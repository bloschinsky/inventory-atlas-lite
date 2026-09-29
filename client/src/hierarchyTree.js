/*
  The storage tree of the Hierarchy page, derived from the flat `GET /api/items/hierarchy` nodes and
  shared by the Tree and Graph views. The Inventory root, the Location nodes, and their Uncontained
  items groups exist only here. Every top-level branch is grouped under the effective location the
  server sent for its top-level item, so a branch is never split by the saved locations inside it.
  Within a location, top-level items that hold something are branches, and every top-level leaf is
  gathered into that location's Uncontained items group.
*/

/*
  Keys of the virtual nodes in expansion sets and rows. Item ids are numbers, so a string key can
  never collide with one. A location key holds its normalized location, which is never empty for a
  named location, so `location:` and `uncontained:` alone are the reserved keys of No location.
*/
export const ROOT = 'inventory';
export const locationKey = normalized => `location:${normalized}`;
export const uncontainedKey = normalized => `uncontained:${normalized}`;

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

export function buildTree(items) {
  const byId = new Map(items.map(item => [item.id, item]));
  const children = new Map();
  for (const item of items) {
    if (item.parent_id === null) continue;
    if (!children.has(item.parent_id)) children.set(item.parent_id, []);
    children.get(item.parent_id).push(item);
  }

  const groups = new Map();
  // The location of every item reachable from a top-level item: the one of its top-level branch.
  const locationOf = new Map();
  for (const item of items) {
    if (item.parent_id !== null) continue;
    const normalized = normalizeLocation(item.effective_location);
    if (!groups.has(normalized)) {
      groups.set(normalized, {
        key: locationKey(normalized), uncontainedKey: uncontainedKey(normalized), name: null,
        spellings: new Map(), containers: [], uncontained: [], itemCount: 0
      });
    }
    const location = groups.get(normalized);
    if (normalized) {
      const spelling = item.effective_location.trim();
      location.spellings.set(spelling, (location.spellings.get(spelling) || 0) + 1);
    }
    (children.has(item.id) ? location.containers : location.uncontained).push(item);
    for (const stack = [item]; stack.length;) {
      const next = stack.pop();
      locationOf.set(next.id, location);
      location.itemCount += 1;
      stack.push(...(children.get(next.id) || []));
    }
  }

  // Named locations by name, then No location last.
  const locations = [...groups.values()].map(({ spellings, ...location }) => ({ ...location, name: displayName(spellings) }));
  locations.sort((a, b) => (a.name === null) - (b.name === null) || (a.name ?? '').localeCompare(b.name ?? '') || (a.key < b.key ? -1 : 1));
  return { byId, children, locations, locationOf };
}

const childrenOf = (tree, id) => tree.children.get(id) || [];
const fold = text => text.toLocaleLowerCase();

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
  Items and named locations whose name contains the query, ignoring case. A matching item stays
  visible with its whole path from its location, so it is never shown without its context, and with
  its contents, which stay collapsed until opened. Only the path down to each match is expanded. A
  matching location is opened one level, with all of its contents available.
*/
export function searchTree(tree, query) {
  const text = fold(query.trim());
  const matches = new Set();
  const visible = new Set();
  const expanded = new Set();
  if (!text) return { matches, visible, expanded };
  for (const item of tree.byId.values()) {
    const location = tree.locationOf.get(item.id);
    // An item of a damaged cycle is reachable from no location and never shown.
    if (!location || !fold(item.name).includes(text)) continue;
    matches.add(item.id);
    visible.add(item.id);
    addAncestors(tree, item, expanded);
    addDescendants(tree, item.id, visible);
    expanded.add(location.key);
    if (item.parent_id === null && !tree.children.has(item.id)) expanded.add(location.uncontainedKey);
  }
  for (const location of tree.locations) {
    if (location.name === null || !fold(location.name).includes(text)) continue;
    matches.add(location.key);
    expanded.add(location.key);
    for (const item of [...location.containers, ...location.uncontained]) {
      visible.add(item.id);
      addDescendants(tree, item.id, visible);
    }
  }
  for (const id of expanded) visible.add(id);
  return { matches, visible, expanded };
}

// The top-level branches of a location that `visible` (a search result, or null for all) keeps.
function shownRoots(location, visible) {
  const shown = item => !visible || visible.has(item.id);
  return { containers: location.containers.filter(shown), leaves: location.uncontained.filter(shown) };
}

// Every key "Expand all" opens: each location, its group, and each container, limited to the visible ones.
export function expandableKeys(tree, visible = null) {
  const keys = new Set();
  for (const location of tree.locations) {
    const { containers, leaves } = shownRoots(location, visible);
    if (containers.length || leaves.length) keys.add(location.key);
    if (leaves.length) keys.add(location.uncontainedKey);
  }
  for (const [id, items] of tree.children) {
    if ((!visible || visible.has(id)) && items.some(item => !visible || visible.has(item.id))) keys.add(id);
  }
  return keys;
}

/*
  The rows currently on screen, in order, with their depth and the key of the row they sit in (`ROOT`
  for the location level). Only expanded branches are walked, so collapsed descendants are never
  rendered. `visible` limits the rows to a search result. Location and group rows carry their
  location; a location row also carries the number of real items in all of its branches.
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
  for (const location of tree.locations) {
    const { containers, leaves } = shownRoots(location, visible);
    if (!containers.length && !leaves.length) continue;
    rows.push({
      key: location.key, type: 'location', location, depth: 0, parent: ROOT,
      childCount: containers.length + (leaves.length ? 1 : 0), itemCount: location.itemCount, expanded: expanded.has(location.key)
    });
    if (!expanded.has(location.key)) continue;
    for (const item of containers) walk(item, 1, location.key);
    if (!leaves.length) continue;
    const group = location.uncontainedKey;
    rows.push({ key: group, type: 'group', location, depth: 1, parent: location.key, childCount: leaves.length, expanded: expanded.has(group) });
    if (expanded.has(group)) for (const item of leaves) walk(item, 2, group);
  }
  return rows;
}

// The name a row is announced by, for its expand/collapse button; `t` is the vue-i18n translate function.
export function rowName(row, t) {
  if (row.type === 'item') return row.item.name;
  const location = row.location.name ?? t('hierarchy.noLocation');
  return row.type === 'location' ? location : t('hierarchy.uncontainedIn', { location });
}
