import { api } from '../api.js';
import { tourItem } from './fixture.js';
import { findHook } from './tourActions.js';
// The generated photo the fixture names as tourItem.photo.
import tourPhotoUrl from './photos/nikon-f65.webp?url';

/*
  The guided tour of the public demo, in order. Each step is plain data:

  - `id` — stable; its copy lives under `tour.steps.<id>.title` and `.text` in the locale files;
  - `route(data)` — the page the step opens (it may be async);
  - `target` — the `data-tour` hook the spotlight shows once that page renders it;
  - `enter(context)` — optional deterministic actions on that page after the target appeared;
  - `leave(context)` — optional actions Next performs before the following step (only Add item saves);
  - `keepScroll` — set when the page should stay where `enter` left it instead of returning to the target.

  `context` holds the actions of ./tourActions.js bound to this step, `data` (the tour's own state,
  `itemId` of the item it saved), and the `router`. Every step can run again after Back without
  creating anything twice: the item is created once and only updated afterwards.
*/

// The Items step filters by the tour item's category and searches for its brand.
const ITEMS_SEARCH = 'Nikon';

const itemExists = id => (id ? api(`/api/items/${id}`).then(() => true, () => false) : false);

async function showCategoryFields({ waitForHook, waitForText, click, waitFor }) {
  const list = await waitForHook('category-list');
  const row = (await waitForText(list, 'strong', tourItem.category)).closest('[role="button"]');
  if (!row.classList.contains('active')) await click(row);
  await waitFor(() => findHook('category-fields')?.textContent.includes(Object.keys(tourItem.fields)[0]), 'category-fields');
}

async function openContainer({ waitForHook, waitForText, type, click }) {
  await type(document.getElementById('hierarchy-search'), tourItem.container);
  const tree = await waitForHook('hierarchy-tree');
  const row = (await waitForText(tree, 'a', tourItem.container)).closest('li');
  const toggle = row.querySelector('button[aria-expanded="false"]');
  if (toggle) await click(toggle);
  await waitForText(tree, 'a', 'Nikon F65');
}

async function fillItem({ data, waitFor, waitForHook, waitForText, waitForLabel, type, choose, click, attachFile, pause }) {
  const form = await waitForHook('item-form');
  const name = document.getElementById('item-name');
  // Back to an item the tour already saved opens its edit form, which only has to finish loading.
  if (data.itemId) {
    await waitFor(() => name.value === tourItem.name, 'item-form');
    return;
  }
  const category = document.getElementById('item-category');
  await waitFor(() => [...category.options].some(option => option.textContent.trim() === tourItem.category), 'item-category');
  await type(name, tourItem.name);
  await choose(category, tourItem.category, { byText: true });
  await choose(document.getElementById('item-condition-grade'), tourItem.condition);
  await type(document.getElementById('item-serial-number'), tourItem.serialNumber);

  // Stored inside: the same search and pick a visitor makes.
  const parentSearch = findHook('item-parent-search');
  await type(parentSearch, tourItem.container);
  parentSearch.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  const candidates = await waitForHook('item-parent-results');
  await click((await waitForText(candidates, 'span', tourItem.container)).closest('li'));

  for (const [label, value] of Object.entries(tourItem.fields)) {
    const input = await waitForLabel(form, label);
    await type(input, value);
    input.blur();
  }

  const response = await fetch(tourPhotoUrl);
  if (!response.ok) throw new Error(`The tour photo ${tourItem.photo} could not be loaded.`);
  const photo = new File([await response.blob()], tourItem.photo, { type: 'image/webp' });
  await attachFile(findHook('item-photos'), photo);
  await waitFor(() => form.querySelector(`img[alt="${tourItem.photo}"]`), 'item-photo');
  await pause();
}

// Save goes through the form's own save path; the item's details page then names the saved item.
async function saveItem({ data, router, waitForHook, click, waitFor }) {
  const form = await waitForHook('item-form');
  await click(findHook('item-save'));
  data.itemId = await waitFor(() => {
    const route = router.currentRoute.value;
    if (route.params.id && !route.path.endsWith('/edit')) return route.params.id;
    const failure = form.parentElement?.querySelector('.alert-danger');
    if (failure) throw new Error(failure.textContent.trim());
    return null;
  }, 'item-saved');
}

async function findItem({ data, waitForHook, waitForText, waitFor, type, choose }) {
  const category = document.getElementById('items-category');
  await waitFor(() => [...category.options].some(option => option.textContent.trim() === tourItem.category), 'items-category');
  await choose(category, tourItem.category, { byText: true });
  await type(document.getElementById('items-search'), ITEMS_SEARCH);
  const results = await waitForHook('item-results');
  await waitForText(results, 'a', data.itemId ? tourItem.name : 'Nikon F65');
}

export const tourSteps = [
  { id: 'welcome', route: () => '/dashboard', target: 'dashboard-summary' },
  { id: 'categories', route: () => '/categories', target: 'category-fields', enter: showCategoryFields },
  { id: 'placement', route: () => '/hierarchy', target: 'hierarchy-tree', enter: openContainer },
  {
    id: 'addItem',
    route: async data => {
      // An item the visitor deleted in the meantime is simply added again.
      if (!(await itemExists(data.itemId))) data.itemId = null;
      return data.itemId ? `/items/${data.itemId}/edit` : '/items/new';
    },
    target: 'item-form',
    enter: fillItem,
    // The form ends where the tour filled it last, next to the photo and the Save button.
    keepScroll: true,
    leave: saveItem
  },
  { id: 'findItem', route: () => '/items', target: 'item-results', enter: findItem },
  { id: 'dashboard', route: () => '/dashboard', target: 'dashboard-summary' }
];
