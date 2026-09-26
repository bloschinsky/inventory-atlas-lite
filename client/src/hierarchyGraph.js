import { ROOT } from './hierarchyTree.js';

/*
  The Graph view layout of the Hierarchy page, computed from the same visible rows as the Tree, so a
  collapsed branch never becomes a node. It is a deterministic left-to-right tree: every leaf takes the
  next free line in tree order and a parent sits midway between its first and last child. Equal rows
  always give equal positions, and no two nodes can share a line within a column, so nodes never
  overlap. It knows nothing of the graph library; the component maps it to library nodes and edges.
*/

// Node box and the distances between columns and lines, in graph pixels; the node CSS uses the same size.
export const NODE_WIDTH = 240;
export const NODE_HEIGHT = 64;
const COLUMN_STEP = NODE_WIDTH + 72;
const LINE_STEP = NODE_HEIGHT + 20;

// Above this many visible nodes the graph asks for a narrower view instead of freezing the browser.
export const GRAPH_NODE_LIMIT = 500;

/*
  `{ nodes, edges }`: the virtual Inventory root plus one node per row, each with its top-left
  position, and one parent -> child edge per row. Node keys are the row keys.
*/
export function layoutGraph(rows) {
  const children = new Map([[ROOT, []]]);
  for (const row of rows) {
    children.set(row.key, []);
    children.get(row.parent).push(row);
  }
  const positions = new Map();
  let line = 0;
  const place = (key, column) => {
    const kids = children.get(key);
    for (const child of kids) place(child.key, column + 1);
    const y = kids.length ? (positions.get(kids[0].key).y + positions.get(kids.at(-1).key).y) / 2 : line++ * LINE_STEP;
    positions.set(key, { x: column * COLUMN_STEP, y });
  };
  place(ROOT, 0);
  return {
    nodes: [{ key: ROOT, type: 'root', childCount: children.get(ROOT).length, position: positions.get(ROOT) },
      ...rows.map(row => ({ ...row, position: positions.get(row.key) }))],
    edges: rows.map(row => ({ from: row.parent, to: row.key }))
  };
}

// The rectangle around the given node keys (every node when none is given), for fitting the view.
export function graphBounds(nodes, keys = null) {
  const chosen = keys ? nodes.filter(node => keys.has(node.key)) : nodes;
  if (!chosen.length) return null;
  const xs = chosen.map(node => node.position.x);
  const ys = chosen.map(node => node.position.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) + NODE_WIDTH - x, height: Math.max(...ys) + NODE_HEIGHT - y };
}

/*
  The viewport `{ x, y, zoom }` that centres `bounds` in a pane of `width` x `height` with a margin.
  It never zooms in past 100%, so a single match is focused rather than blown up, and never out past
  `minZoom`, where a huge graph is centred on its start instead.
*/
export function fitViewport(bounds, width, height, minZoom) {
  const zoom = Math.max(minZoom, Math.min(1, (width * 0.9) / bounds.width, (height * 0.9) / bounds.height));
  // Centred along an axis where it fits, otherwise its start sits at the margin.
  const place = (pane, start, size) => (size * zoom <= pane ? (pane - size * zoom) / 2 : pane * 0.05) - start * zoom;
  return { x: place(width, bounds.x, bounds.width), y: place(height, bounds.y, bounds.height), zoom };
}
