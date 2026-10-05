import { api } from '../api.js';
import { DEFAULT_ITEM_SORT, ITEMS_VIEW_STORAGE_KEY } from '../itemColumns.js';
import { checklists, templates, tourItem } from './fixture.js';
import { findByText, findHook } from './tourActions.js';
// The generated photo the fixture names as tourItem.photo.
import tourPhotoUrl from './photos/nikon-f65.webp?url';

/*
  The guided tour of the public demo: eight chapters in order, each a short series of scenes the
  presenter plays on its own. Next and Back move between chapters; nobody presses a button per scene.

  A chapter is plain data:
  - `id` — stable; its title is `tour.chapters.<id>.title` in the locale files;
  - `route(data)` — the page the chapter opens (it may be async); a replay opens it on a fresh mount;
  - `prepare(context)` — optional work after the page opened and before the first scene;
  - `scenes` — the ordered scenes.

  A scene is plain data too:
  - `id` — stable; its copy is `tour.chapters.<chapter>.scenes.<id>`;
  - `target` — optional spotlight target at the scene's start: a `data-tour` hook, or `#<id>` of a
    labelled form control; the scene fails when the page does not show it in time;
  - `action(context)` — optional deterministic actions on the real interface;
  - `hold` — the viewing time after the action, a TIMING key of ./tourActions.js (default `view`);
  - `skip(data)` — optional; true leaves the scene out of this run;
  - `params(data, t)` — optional values for the scene's copy.

  `context` holds the actions of ./tourActions.js bound to the running chapter, `spotlight(target)` to
  move the spotlight during an action, `data` (the tour's own state), and the `router`. Every chapter
  can play again after Back, Next, or Replay without creating anything twice: the tour item is created
  once and only edited afterwards, and the checklist run is continued instead of started again.
*/

const ITEMS_SEARCH = 'Nikon';
const SEEDED_CAMERA = 'Nikon F65';
const [tourTemplate] = templates;
const [tourChecklist] = checklists;

// The tour item, when an earlier chapter run (or the visitor) saved it: found by its unique name.
async function findTourItem() {
  const { items } = await api(`/api/items?search=${encodeURIComponent(tourItem.name)}`);
  return items.find(item => item.name === tourItem.name) ?? null;
}

const rowNamed = (root, name) => findByText(root, 'span, a', name)?.closest('li');

// Opens a hierarchy branch by its name, the way a visitor clicks its toggle.
async function expandBranch({ waitForHook, waitFor, click }, name) {
  const tree = await waitForHook('hierarchy-tree');
  const row = await waitFor(() => rowNamed(tree, name), name);
  const toggle = row.querySelector('button[aria-expanded="false"]');
  if (toggle) await click(toggle);
}

// Picks one option of the Hierarchy switches (Group by, View) through its visible button.
async function switchHierarchy({ waitFor, click }, control, option) {
  const label = await waitFor(() => document.querySelector(`label[for="hierarchy-${control}-${option}"]`), `hierarchy-${control}-${option}`);
  if (!document.getElementById(`hierarchy-${control}-${option}`).checked) await click(label);
}

// Every Items chapter starts on the default sort, so the Condition sort is a visible change each time.
function resetItemsSort() {
  try {
    const view = JSON.parse(localStorage.getItem(ITEMS_VIEW_STORAGE_KEY));
    if (view && typeof view === 'object') localStorage.setItem(ITEMS_VIEW_STORAGE_KEY, JSON.stringify({ ...view, sort: DEFAULT_ITEM_SORT, direction: 'asc' }));
  } catch {
    // A blocked storage keeps the default sort anyway.
  }
}

const resultsShow = (name, shown = true) => () => {
  const results = findHook('item-results');
  return results && Boolean(findByText(results, 'a', name)) === shown;
};

const resultName = data => (data.itemId ? tourItem.name : SEEDED_CAMERA);

async function saveItem({ data, router, click, waitFor, waitForHook }) {
  const form = await waitForHook('item-form');
  await click(await waitForHook('item-save'));
  data.itemId = await waitFor(() => {
    const route = router.currentRoute.value;
    if (route.params.id && !route.path.endsWith('/edit')) return route.params.id;
    const failure = form.parentElement?.querySelector('.alert-danger');
    if (failure) throw new Error(failure.textContent.trim());
    return null;
  }, 'item-saved');
}

async function attachTourPhoto({ waitFor, waitForHook, attachFile }) {
  const form = await waitForHook('item-form');
  const shown = () => form.querySelector(`img[alt="${tourItem.photo}"]`);
  // The edited tour item already has its photo; uploading it again would add a second copy.
  if (shown()) return;
  const response = await fetch(tourPhotoUrl);
  if (!response.ok) throw new Error(`The tour photo ${tourItem.photo} could not be loaded.`);
  const photo = new File([await response.blob()], tourItem.photo, { type: 'image/webp' });
  await attachFile(await waitForHook('item-photos'), photo);
  await waitFor(shown, 'item-photo');
}

/*
  The entries the tour changed in one Dashboard distribution: the first entry whose count differs
  from the baseline, with both counts, or null when nothing in it changed.
*/
function changedEntry(before, after, key) {
  const counts = new Map(before.map(entry => [entry[key], entry.count]));
  const entry = after.find(candidate => (counts.get(candidate[key]) ?? 0) !== candidate.count);
  return entry ? { ...entry, before: counts.get(entry[key]) ?? 0, after: entry.count } : null;
}

export const tourChapters = [
  {
    id: 'dashboard',
    route: () => '/dashboard',
    scenes: [
      { id: 'summary', target: 'dashboard-summary' },
      { id: 'categories', target: 'dashboard-categories' },
      { id: 'condition', target: 'dashboard-condition' },
      { id: 'fields', target: 'dashboard-fields' },
      { id: 'locations', target: 'dashboard-locations' }
    ]
  },
  {
    id: 'categories',
    route: () => '/categories',
    scenes: [
      { id: 'overview', target: 'category-list' },
      {
        id: 'select',
        target: 'category-list',
        action: async ({ waitForHook, waitForText, click }) => {
          const row = (await waitForText(await waitForHook('category-list'), 'strong', tourItem.category)).closest('[role="button"]');
          if (!row.classList.contains('active')) await click(row);
        }
      },
      {
        id: 'fields',
        target: 'category-fields',
        action: ({ waitFor }) => waitFor(() => findHook('category-fields')?.textContent.includes(Object.keys(tourItem.fields)[0]), 'category-fields')
      },
      { id: 'location', target: 'category-fields' }
    ]
  },
  {
    id: 'hierarchy',
    route: () => '/hierarchy',
    scenes: [
      { id: 'overview', target: 'hierarchy-controls' },
      {
        id: 'location',
        target: 'hierarchy-tree',
        action: async context => {
          await expandBranch(context, 'Home / Office');
          await expandBranch(context, tourItem.container);
          await context.waitForText(findHook('hierarchy-tree'), 'a', SEEDED_CAMERA);
        }
      },
      {
        id: 'category',
        target: 'hierarchy-group',
        action: async context => {
          await switchHierarchy(context, 'group', 'category');
          await context.spotlight('hierarchy-tree');
        },
        hold: 'longView'
      },
      {
        id: 'tree',
        target: 'hierarchy-tree',
        action: async context => {
          await expandBranch(context, tourItem.category);
          await context.waitForText(findHook('hierarchy-tree'), 'a', SEEDED_CAMERA);
        }
      },
      {
        id: 'graph',
        target: 'hierarchy-view',
        action: async context => {
          await switchHierarchy(context, 'view', 'graph');
          await context.spotlight('hierarchy-graph');
          await context.waitFor(() => findHook('hierarchy-graph').querySelector('.vue-flow__node'), 'hierarchy-graph-nodes');
        },
        hold: 'longView'
      }
    ]
  },
  {
    id: 'addItem',
    // The tour item is edited once it exists, so Back, Next, and Replay never add a second one.
    route: async data => {
      data.itemId = (await findTourItem())?.id ?? null;
      return data.itemId ? `/items/${data.itemId}/edit` : '/items/new';
    },
    prepare: async ({ data, waitFor, waitForHook }) => {
      await waitForHook('item-form');
      const name = document.getElementById('item-name');
      const category = document.getElementById('item-category');
      await waitFor(() => [...category.options].some(option => option.textContent.trim() === tourItem.category), 'item-category');
      if (data.itemId) await waitFor(() => name.value === tourItem.name, 'item-form');
    },
    scenes: [
      { id: 'name', target: '#item-name', action: ({ type }) => type(document.getElementById('item-name'), tourItem.name) },
      { id: 'category', target: '#item-category', action: ({ choose }) => choose(document.getElementById('item-category'), tourItem.category, { byText: true }) },
      {
        id: 'condition',
        target: '#item-condition-grade',
        action: ({ choose }) => choose(document.getElementById('item-condition-grade'), tourItem.condition)
      },
      { id: 'serial', target: '#item-serial-number', action: ({ type }) => type(document.getElementById('item-serial-number'), tourItem.serialNumber) },
      {
        id: 'placement',
        target: 'item-parent',
        // Stored inside: the same search and pick a visitor makes, unless the item is already there.
        action: async ({ type, click, waitForHook, waitForText }) => {
          if (findByText(findHook('item-parent'), 'span', tourItem.container)) return;
          const search = await waitForHook('item-parent-search');
          await type(search, tourItem.container);
          search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
          const candidates = await waitForHook('item-parent-results');
          await click((await waitForText(candidates, 'span', tourItem.container)).closest('li'));
          await waitForText(findHook('item-parent'), 'span', tourItem.container);
        }
      },
      {
        id: 'fields',
        target: 'item-custom-fields',
        action: async ({ waitForLabel, type }) => {
          for (const [label, value] of Object.entries(tourItem.fields)) {
            const input = await waitForLabel(findHook('item-custom-fields'), label);
            await type(input, value);
            input.blur();
          }
        }
      },
      { id: 'photo', target: 'item-photos', action: attachTourPhoto },
      { id: 'save', target: 'item-save', action: saveItem }
    ]
  },
  {
    id: 'items',
    route: async data => {
      resetItemsSort();
      data.itemId = (await findTourItem())?.id ?? null;
      return '/items';
    },
    scenes: [
      { id: 'overview', target: 'item-results' },
      {
        id: 'filter',
        target: 'item-filters',
        action: async ({ waitFor, choose, spotlight }) => {
          const category = document.getElementById('items-category');
          await waitFor(() => [...category.options].some(option => option.textContent.trim() === tourItem.category), 'items-category');
          await choose(category, tourItem.category, { byText: true });
          await waitFor(resultsShow('Cordless drill', false), 'items-filtered');
          await spotlight('item-results');
        }
      },
      {
        id: 'sort',
        target: 'item-results',
        // Wide screens sort from the table header, phones from the Sort select.
        action: async ({ waitFor, click, choose }) => {
          const header = findHook('item-sort-condition');
          if (header) {
            await click(header.querySelector('button'));
            await waitFor(() => findHook('item-sort-condition')?.getAttribute('aria-sort') === 'ascending', 'item-sort-condition');
          } else {
            await choose(document.getElementById('items-sort'), 'condition');
          }
        }
      },
      {
        id: 'search',
        target: '#items-search',
        action: async ({ type, waitFor, spotlight }) => {
          await type(document.getElementById('items-search'), ITEMS_SEARCH);
          // The film rolls are the one Photography item without "Nikon" in any of its values.
          await waitFor(resultsShow('Film rolls (5 pack)', false), 'items-searched');
          await spotlight('item-results');
        }
      },
      {
        id: 'result',
        target: 'item-results',
        // The tour item, or the seeded camera when the visitor skipped Add an Item before it saved.
        params: data => ({ name: resultName(data) }),
        action: async ({ data, waitFor, spotlight }) => {
          const name = resultName(data);
          await waitFor(resultsShow(name), name);
          const row = await waitFor(() => findByText(findHook('item-results'), 'a', name)?.closest('[data-tour^="item-row"]'), name);
          await spotlight(row.dataset.tour);
        }
      }
    ]
  },
  {
    id: 'templates',
    route: () => '/templates',
    scenes: [
      { id: 'list', target: 'template-list' },
      {
        id: 'open',
        target: 'template-list',
        action: async ({ waitForHook, waitForText, waitFor, click, spotlight }) => {
          const row = (await waitForText(await waitForHook('template-list'), 'td', tourTemplate.name)).closest('tr');
          await click(row.querySelector('a[href$="/edit"]'));
          await waitFor(() => document.getElementById('template-name')?.value === tourTemplate.name, 'template-form');
          await spotlight('template-form');
        }
      },
      {
        id: 'values',
        target: 'item-custom-fields',
        action: ({ waitForLabel }) => waitForLabel(findHook('item-custom-fields'), Object.keys(tourTemplate.fields)[0])
      },
      { id: 'use', target: 'template-form' }
    ]
  },
  {
    id: 'checklists',
    route: () => '/checklists',
    scenes: [
      { id: 'list', target: 'checklist-list' },
      {
        id: 'open',
        target: 'checklist-list',
        action: async ({ waitForHook, waitFor, click, spotlight }) => {
          const card = await waitFor(() => findHook('checklist-list').querySelector(`article[aria-label="${tourChecklist.name}"]`), tourChecklist.name);
          await click(card.querySelector('h2 a'));
          await waitForHook('checklist-items');
          await spotlight('checklist-items');
        }
      },
      {
        id: 'check',
        target: 'checklist-items',
        // An open run of an earlier chapter run is continued, never started a second time.
        action: async ({ waitFor, click, spotlight }) => {
          const runButton = findHook('checklist-continue') ? 'checklist-continue' : 'checklist-start';
          await spotlight(runButton);
          await click(findHook(runButton));
          await spotlight('checklist-run-item');
          // Checked (Packed in a packing checklist), Missing, and back to unchecked, in this order.
          const states = () => [...(findHook('checklist-run-item')?.querySelectorAll('[aria-pressed]') ?? [])];
          const pressed = index => states()[index]?.getAttribute('aria-pressed') === 'true';
          await waitFor(() => states().length === 3, 'checklist-run-actions');
          if (pressed(0)) {
            await click(states()[2]);
            await waitFor(() => pressed(2), 'checklist-run-unchecked');
          }
          await click(states()[0]);
          await waitFor(() => pressed(0), 'checklist-run-checked');
        }
      },
      { id: 'uses', target: 'checklist-progress' }
    ]
  },
  {
    id: 'result',
    route: () => '/dashboard',
    // The real changes since the tour started: only what the visitor's tour actually changed is presented.
    prepare: async ({ data }) => {
      const [after, item] = await Promise.all([api('/api/dashboard'), findTourItem()]);
      const before = data.baseline;
      data.itemId = item?.id ?? null;
      data.changes = {
        total: after.totalItems !== before.totalItems ? { before: before.totalItems, after: after.totalItems } : null,
        category: changedEntry(before.categoryDistribution, after.categoryDistribution, 'label'),
        condition: changedEntry(before.conditionDistribution, after.conditionDistribution, 'key'),
        location: changedEntry(before.locationDistribution, after.locationDistribution, 'key')
      };
    },
    scenes: [
      { id: 'changed', target: 'dashboard-summary', skip: data => !data.itemId, params: () => ({ name: tourItem.name, category: tourItem.category, container: tourItem.container }) },
      { id: 'unchanged', target: 'dashboard-summary', skip: data => Boolean(data.itemId) },
      { id: 'total', target: 'dashboard-summary', skip: data => !data.changes.total, params: data => data.changes.total },
      {
        id: 'category',
        target: 'dashboard-categories',
        skip: data => !data.changes.category,
        params: ({ changes: { category } }) => ({ name: category.label, before: category.before, after: category.after })
      },
      {
        id: 'condition',
        target: 'dashboard-condition',
        skip: data => !data.changes.condition,
        params: ({ changes: { condition } }, t) => ({
          name: t(condition.key === 'not-set' ? 'condition.notSet' : `condition.grades.${condition.key}`),
          before: condition.before,
          after: condition.after
        })
      },
      {
        id: 'location',
        target: 'dashboard-locations',
        skip: data => !data.changes.location,
        params: ({ changes: { location } }) => ({ name: location.label, before: location.before, after: location.after })
      },
      { id: 'explore' }
    ]
  }
];
