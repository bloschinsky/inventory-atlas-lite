import { api } from '../api.js';
import { DEFAULT_ITEM_SORT, ITEMS_VIEW_STORAGE_KEY } from '../itemColumns.js';
import { byKey, demoItemUuid } from './fixture.js';
import { findByText, findHook } from './tourActions.js';
// The generated photo the fixture names as tourItem.photo.
import tourPhotoUrl from './photos/nikon-f65.webp?url';

/*
  The guided tour of the public demo: eight chapters in order, each a short series of scenes. A scene
  explains one thing and waits; its contextual action button (or Auto Play) performs the scene's
  action on the real interface, and the next scene appears. Next and Back move between chapters.

  A chapter is plain data:
  - `id` — stable; its title is `tour.chapters.<id>.title` in the locale files;
  - `route(data)` — the page the chapter opens (it may be async); a replay opens it on a fresh mount;
  - `prepare(context)` — optional work after the page opened and before the first scene;
  - `scenes` — the ordered scenes.

  A scene is plain data too:
  - `id` — stable; its copy is `tour.chapters.<chapter>.scenes.<id>`;
  - `target` — optional spotlight target at the scene's start: a `data-tour` hook, or `#<id>` of a
    labelled form control, or a function of `data` that returns one; the scene fails when the page
    does not show it in time;
  - `action(context)` — optional deterministic actions on the real interface, run when the visitor
    presses the scene's action button; its label is `tour.chapters.<chapter>.actions.<id>`;
  - `hold` — the viewing time after the action, a TIMING key of ./tourActions.js (default `view`);
  - `skip(data)` — optional; true leaves the scene out of this run;
  - `params(data, t)` — optional values for the scene's copy.

  A scene without an action still waits: its button only shows the next scene, so its label names
  that next scene, `tour.chapters.<chapter>.continue.<next id>` (see actionLabelKey). The last scene
  of a chapter has no button unless it has an action; once it is shown, Next opens the next chapter.
  Prefer an action that the next scene's copy then explains, and a label that says what will happen.

  `context` holds the actions of ./tourActions.js bound to the running chapter, `spotlight(target)` to
  move the spotlight during an action, `data` (the tour's own state), and the `router`. Every chapter
  can play again after Back, Next, or Replay without creating anything twice: the tour item is created
  once and only edited afterwards, and the checklist run is continued instead of started again.

  The chapters never identify an entity by English text. They name fixture entities by semantic key;
  `data.fixture` (./fixture.js in the tour's language, set when the tour starts) turns a key into the
  name the page shows, and seeded items are found by their fixed UUID and then by their row id. The
  same chapters therefore play on the demo inventory of every language.
*/

// Search text that is the same in every language: a brand in the names of the photo kit.
const ITEMS_SEARCH = 'Nikon';
const SEEDED_CAMERA = 'nikon-f65';
const HIDDEN_BY_FILTER = 'cordless-drill';
// The one Photography item without "Nikon" in any of its values.
const HIDDEN_BY_SEARCH = 'film-rolls';
const TOUR_TEMPLATE = 'film-roll';
const TOUR_CHECKLIST = 'weekend-photo-walk';

const tourCategory = fixture => byKey(fixture.categories, fixture.tourItem.category);
const tourContainer = fixture => byKey(fixture.items, fixture.tourItem.container);
const fieldName = (fixture, categoryKey, key) => byKey(byKey(fixture.categories, categoryKey).fields, key).name;

/*
  The fixture names every scene's copy may use, in the tour's language: `{category}`, `{fields}`,
  `{container}`, `{location}`, `{camera}`, `{template}`, `{templateField}`, and `{checklist}`, and
  the `{search}` text. A scene's own `params` add to them.
*/
export function copyParams({ fixture }) {
  const category = tourCategory(fixture);
  const container = tourContainer(fixture);
  const template = byKey(fixture.templates, TOUR_TEMPLATE);
  return {
    search: ITEMS_SEARCH,
    templateField: fieldName(fixture, template.category, Object.keys(template.fields)[0]),
    category: category.name,
    fields: new Intl.ListFormat(fixture.locale, { type: 'conjunction' }).format(category.fields.map(field => field.name)),
    container: container.name,
    location: container.location,
    camera: byKey(fixture.items, SEEDED_CAMERA).name,
    template: template.name,
    checklist: byKey(fixture.checklists, TOUR_CHECKLIST).name
  };
}

// The row id of a seeded item, found by its fixed UUID.
const seededItemId = async key => (await api(`/api/items/${demoItemUuid(key)}`)).id;

// The tour item, when an earlier chapter run (or the visitor) saved it: found by its unique serial number.
async function findTourItem({ tourItem }) {
  const { items } = await api(`/api/items?search=${encodeURIComponent(tourItem.serialNumber)}`);
  return items.find(item => item.serial_number === tourItem.serialNumber) ?? null;
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

// Whether the Items results show the row (or phone card) of the item with this row id.
const rowShown = (id, shown = true) => () => Boolean(findHook('item-results')) && Boolean(findHook(`item-row-${id}`)) === shown;

// The state buttons of the shown checklist run item.
const runStates = () => [...(findHook('checklist-run-item')?.querySelectorAll('[aria-pressed]') ?? [])];

// The tour item, or the seeded camera when the visitor skipped Add an Item before it saved.
const resultName = ({ itemId, fixture }) => (itemId ? fixture.tourItem.name : byKey(fixture.items, SEEDED_CAMERA).name);

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

async function attachTourPhoto({ data: { fixture: { tourItem } }, waitFor, waitForHook, attachFile }) {
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
      {
        id: 'overview',
        target: 'category-list',
        action: async ({ data: { fixture }, waitForHook, waitForText, waitFor, click }) => {
          const category = tourCategory(fixture);
          const row = (await waitForText(await waitForHook('category-list'), 'strong', category.name)).closest('[role="button"]');
          if (!row.classList.contains('active')) await click(row);
          await waitFor(() => category.fields.every(field => findHook('category-fields')?.textContent.includes(field.name)), 'category-fields');
        }
      },
      { id: 'fields', target: 'category-fields' },
      { id: 'location', target: 'category-fields' }
    ]
  },
  {
    id: 'hierarchy',
    route: () => '/hierarchy',
    scenes: [
      {
        id: 'overview',
        target: 'hierarchy-controls',
        action: async context => {
          const { fixture } = context.data;
          const container = tourContainer(fixture);
          await context.spotlight('hierarchy-tree');
          await expandBranch(context, container.location);
          await expandBranch(context, container.name);
          await context.waitForText(findHook('hierarchy-tree'), 'a', byKey(fixture.items, SEEDED_CAMERA).name);
        }
      },
      {
        id: 'location',
        target: 'hierarchy-tree',
        action: async context => {
          await context.spotlight('hierarchy-group');
          await switchHierarchy(context, 'group', 'category');
          await context.spotlight('hierarchy-tree');
        }
      },
      {
        id: 'category',
        target: 'hierarchy-tree',
        action: async context => {
          const { fixture } = context.data;
          await expandBranch(context, tourCategory(fixture).name);
          await context.waitForText(findHook('hierarchy-tree'), 'a', byKey(fixture.items, SEEDED_CAMERA).name);
        }
      },
      {
        id: 'tree',
        target: 'hierarchy-tree',
        action: async context => {
          await context.spotlight('hierarchy-view');
          await switchHierarchy(context, 'view', 'graph');
          await context.spotlight('hierarchy-graph');
          await context.waitFor(() => findHook('hierarchy-graph').querySelector('.vue-flow__node'), 'hierarchy-graph-nodes');
        }
      },
      { id: 'graph', target: 'hierarchy-graph' }
    ]
  },
  {
    id: 'addItem',
    // The tour item is edited once it exists, so Back, Next, and Replay never add a second one.
    route: async data => {
      data.itemId = (await findTourItem(data.fixture))?.id ?? null;
      return data.itemId ? `/items/${data.itemId}/edit` : '/items/new';
    },
    prepare: async ({ data, waitFor, waitForHook }) => {
      await waitForHook('item-form');
      const name = document.getElementById('item-name');
      const category = document.getElementById('item-category');
      const categoryName = tourCategory(data.fixture).name;
      await waitFor(() => [...category.options].some(option => option.textContent.trim() === categoryName), 'item-category');
      if (data.itemId) await waitFor(() => name.value === data.fixture.tourItem.name, 'item-form');
    },
    scenes: [
      { id: 'name', target: '#item-name', action: ({ data, type }) => type(document.getElementById('item-name'), data.fixture.tourItem.name) },
      {
        id: 'category',
        target: '#item-category',
        action: ({ data, choose }) => choose(document.getElementById('item-category'), tourCategory(data.fixture).name, { byText: true })
      },
      {
        id: 'condition',
        target: '#item-condition-grade',
        action: ({ data, choose }) => choose(document.getElementById('item-condition-grade'), data.fixture.tourItem.condition)
      },
      {
        id: 'serial',
        target: '#item-serial-number',
        action: ({ data, type }) => type(document.getElementById('item-serial-number'), data.fixture.tourItem.serialNumber)
      },
      {
        id: 'placement',
        target: 'item-parent',
        // Stored inside: the same search and pick a visitor makes, unless the item is already there.
        action: async ({ data, type, click, waitForHook, waitForText }) => {
          const container = tourContainer(data.fixture).name;
          if (findByText(findHook('item-parent'), 'span', container)) return;
          const search = await waitForHook('item-parent-search');
          await type(search, container);
          search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
          const candidates = await waitForHook('item-parent-results');
          await click((await waitForText(candidates, 'span', container)).closest('li'));
          await waitForText(findHook('item-parent'), 'span', container);
        }
      },
      {
        id: 'fields',
        target: 'item-custom-fields',
        action: async ({ data: { fixture }, waitForLabel, type }) => {
          for (const [key, value] of Object.entries(fixture.tourItem.fields)) {
            const input = await waitForLabel(findHook('item-custom-fields'), fieldName(fixture, fixture.tourItem.category, key));
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
    // The search ends on the tour item, or on the seeded camera when the visitor skipped Add an Item.
    route: async data => {
      resetItemsSort();
      data.itemId = (await findTourItem(data.fixture))?.id ?? null;
      data.resultId = data.itemId ?? await seededItemId(SEEDED_CAMERA);
      return '/items';
    },
    scenes: [
      {
        id: 'overview',
        target: 'item-results',
        action: async ({ data, waitFor, choose, spotlight }) => {
          await spotlight('item-filters');
          const category = document.getElementById('items-category');
          const categoryName = tourCategory(data.fixture).name;
          await waitFor(() => [...category.options].some(option => option.textContent.trim() === categoryName), 'items-category');
          await choose(category, categoryName, { byText: true });
          await waitFor(rowShown(await seededItemId(HIDDEN_BY_FILTER), false), 'items-filtered');
          await spotlight('item-results');
        }
      },
      {
        id: 'filter',
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
        id: 'sort',
        target: 'item-results',
        action: async ({ type, waitFor, spotlight }) => {
          await spotlight('#items-search');
          await type(document.getElementById('items-search'), ITEMS_SEARCH);
          await waitFor(rowShown(await seededItemId(HIDDEN_BY_SEARCH), false), 'items-searched');
          await spotlight('item-results');
        }
      },
      { id: 'search', target: 'item-results' },
      { id: 'result', target: data => `item-row-${data.resultId}`, params: data => ({ name: resultName(data) }) }
    ]
  },
  {
    id: 'templates',
    route: () => '/templates',
    scenes: [
      {
        id: 'list',
        target: 'template-list',
        action: async ({ data, waitForHook, waitForText, waitFor, click, spotlight }) => {
          const { name } = byKey(data.fixture.templates, TOUR_TEMPLATE);
          const row = (await waitForText(await waitForHook('template-list'), 'td', name)).closest('tr');
          await click(row.querySelector('a[href$="/edit"]'));
          await waitFor(() => document.getElementById('template-name')?.value === name, 'template-form');
          await spotlight('template-form');
        }
      },
      { id: 'open', target: 'template-form' },
      { id: 'values', target: 'item-custom-fields' },
      { id: 'use', target: 'template-form' }
    ]
  },
  {
    id: 'checklists',
    route: () => '/checklists',
    scenes: [
      {
        id: 'list',
        target: 'checklist-list',
        action: async ({ data, waitForHook, waitFor, click, spotlight }) => {
          const { name } = byKey(data.fixture.checklists, TOUR_CHECKLIST);
          const card = await waitFor(() => findHook('checklist-list').querySelector(`article[aria-label="${name}"]`), name);
          await click(card.querySelector('h2 a'));
          await waitForHook('checklist-items');
          await spotlight('checklist-items');
        }
      },
      {
        id: 'open',
        target: 'checklist-items',
        // An open run of an earlier chapter run is continued, never started a second time.
        action: async ({ waitFor, click, spotlight }) => {
          const runButton = findHook('checklist-continue') ? 'checklist-continue' : 'checklist-start';
          await spotlight(runButton);
          await click(findHook(runButton));
          await spotlight('checklist-run-item');
          await waitFor(() => runStates().length === 3, 'checklist-run-actions');
        }
      },
      {
        id: 'run',
        target: 'checklist-run-item',
        // Checked (Packed in a packing checklist), Missing, and back to unchecked, in this order.
        action: async ({ waitFor, click }) => {
          const pressed = index => runStates()[index]?.getAttribute('aria-pressed') === 'true';
          await waitFor(() => runStates().length === 3, 'checklist-run-actions');
          if (pressed(0)) {
            await click(runStates()[2]);
            await waitFor(() => pressed(2), 'checklist-run-unchecked');
          }
          await click(runStates()[0]);
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
      const [after, item] = await Promise.all([api('/api/dashboard'), findTourItem(data.fixture)]);
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
      { id: 'changed', target: 'dashboard-summary', skip: data => !data.itemId, params: data => ({ name: data.fixture.tourItem.name }) },
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

/*
  The i18n key of the action button of the shown scene (`ids` are the scene ids of this run): the
  scene's own action, or else the next scene it shows; null for a last scene without an action.
*/
export function actionLabelKey(chapter, ids, position) {
  const scene = chapter.scenes.find(entry => entry.id === ids[position]);
  if (scene?.action) return `tour.chapters.${chapter.id}.actions.${scene.id}`;
  const next = ids[position + 1];
  return next ? `tour.chapters.${chapter.id}.continue.${next}` : null;
}
