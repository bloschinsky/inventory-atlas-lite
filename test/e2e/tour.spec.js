import { expect, test } from '@playwright/test';
import { byKey, createDemoFixture } from '../../client/src/demo/fixture.js';
import en from '../../client/src/i18n/locales/en.json' with { type: 'json' };
import uk from '../../client/src/i18n/locales/uk.json' with { type: 'json' };
import { demoURL } from './environment.js';

/*
  The guided presentation of the public demo, on the built demo inside the landing build (see
  demo.spec.js). It is manual-first: each scene waits until its contextual action button is pressed,
  then acts on the real page and shows the next scene; Auto Play presses the same button after a
  reading time. Each chapter is checked on the page it opened: the scene copy it showed, the
  highlighted `data-tour` targets, and the data its actions left behind. The checks wait for
  observable states, never for fixed times; where a test must prove that nothing happens on its
  own, it moves the page clock forward instead of waiting.
*/
const chapters = ['dashboard', 'categories', 'hierarchy', 'addItem', 'items', 'templates', 'checklists', 'result'];
const { checklists, items, templates, tourItem, categories } = createDemoFixture('en');
const photographyFields = byKey(categories, tourItem.category).fields;
const container = byKey(items, tourItem.container);

/*
  The scene copy and action labels as the presenter shows them: the fixture names the copy refers to
  by placeholder (see copyParams() in client/src/demo/tourChapters.js), in the language of the fixture.
*/
const copyParams = fixture => {
  const category = byKey(fixture.categories, fixture.tourItem.category);
  const bag = byKey(fixture.items, fixture.tourItem.container);
  const template = byKey(fixture.templates, 'film-roll');
  return {
    category: category.name,
    fields: new Intl.ListFormat(fixture.locale, { type: 'conjunction' }).format(category.fields.map(field => field.name)),
    container: bag.name,
    location: bag.location,
    camera: byKey(fixture.items, 'nikon-f65').name,
    template: template.name,
    templateField: byKey(category.fields, Object.keys(template.fields)[0]).name,
    checklist: byKey(fixture.checklists, 'weekend-photo-walk').name,
    search: 'Nikon'
  };
};
const fill = (text, params) => text.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
const copy = en.tour.chapters;
const title = id => copy[id].title;
const scene = (chapter, id, params = {}) => fill(copy[chapter].scenes[id], { ...copyParams(createDemoFixture('en')), ...params });
// `act` labels a scene's own action, `show` the button of an action-less scene that shows the next one.
const act = (chapter, id) => fill(copy[chapter].actions[id], copyParams(createDemoFixture('en')));
const show = (chapter, id) => fill(copy[chapter].continue[id], copyParams(createDemoFixture('en')));
// The presses that take each chapter from its first scene to its end, in order.
const steps = {
  dashboard: ['categories', 'condition', 'fields', 'locations'].map(id => show('dashboard', id)),
  categories: [act('categories', 'overview'), show('categories', 'location')],
  hierarchy: ['overview', 'location', 'category', 'tree'].map(id => act('hierarchy', id)),
  addItem: ['name', 'category', 'condition', 'serial', 'placement', 'fields', 'photo', 'save'].map(id => act('addItem', id)),
  items: [act('items', 'overview'), act('items', 'filter'), act('items', 'sort'), show('items', 'result')],
  templates: [act('templates', 'list'), show('templates', 'values'), show('templates', 'use')],
  checklists: ['list', 'open', 'run'].map(id => act('checklists', id)),
  result: ['total', 'category', 'condition', 'location', 'explore'].map(id => show('result', id))
};
// A scene action types every value visibly, saves, or opens a page.
const PLAY = { timeout: 45_000 };

const card = page => page.getByRole('dialog').filter({ has: page.getByRole('progressbar', { name: 'Tour progress' }) });
const button = (page, name) => card(page).getByRole('button', { name, exact: true });
const nextButton = page => button(page, 'Next');
const backButton = page => button(page, 'Back');
const replayButton = page => button(page, 'Replay chapter');
const skipButton = page => button(page, 'Skip chapter');
const autoplayButton = page => button(page, 'Auto Play');
const spotlight = page => page.locator('.demo-tour-spotlight');
const lock = page => page.locator('.demo-tour-lock');
const sceneList = page => card(page).getByRole('list', { name: /^Scene \d+ of \d+$/ });
const visibleLinks = (page, name) => page.locator('[data-tour="item-results"]').getByRole('link', { name, exact: true }).filter({ visible: true });
const totalItems = page => page.getByRole('region', { name: 'Total items' });

// The values the final chapter compares, from the canonical fixture.
const locationOf = item => item.location ?? (item.parent ? locationOf(items.find(entry => entry.key === item.parent)) : null);
const count = test => items.filter(test).length;
const photography = count(item => item.category === tourItem.category);
const good = count(item => item.condition_grade === tourItem.condition);
const camerasLocation = locationOf(container);
const atCamerasLocation = count(item => locationOf(item) === camerasLocation);

async function open(page, hash = '#/dashboard') {
  await page.goto(`${demoURL}${hash}`);
  // A fresh headless page keeps the pointer at (0, 0), which expands the folded sidebar over the page.
  await page.mouse.move(600, 400);
}

async function expectChapter(page, index) {
  await expect(page.getByRole('dialog', { name: title(chapters[index]) })).toBeVisible();
  await expect(card(page).getByRole('progressbar')).toHaveAttribute('aria-valuetext', `Chapter ${index + 1} of ${chapters.length}`);
}

// Presses a scene's action button once the scene waits for it.
async function press(page, name) {
  const action = button(page, name);
  await expect(action).toBeEnabled(PLAY);
  await action.click();
}

// A chapter is complete once it offers its Next (or the final choices), without a failure.
async function expectComplete(page) {
  await expect(nextButton(page).or(button(page, 'Explore on your own'))).toBeVisible(PLAY);
  await expect(card(page).getByRole('alert')).toHaveCount(0);
  await expect(lock(page)).toHaveCount(0);
}

async function playChapter(page, chapter) {
  for (const name of steps[chapter]) await press(page, name);
  await expectComplete(page);
}

async function startTour(page) {
  await page.getByRole('button', { name: 'Guided tour' }).click();
  await expectChapter(page, 0);
}

const currentChapter = async page => Number(await card(page).getByRole('progressbar').getAttribute('aria-valuenow')) - 1;

// Skip chapter (or Next, once a chapter is complete) goes straight to the chapter a test checks.
async function goTo(page, index) {
  for (let chapter = await currentChapter(page) + 1; chapter <= index; chapter++) {
    await nextButton(page).or(skipButton(page)).click();
    await expectChapter(page, chapter);
  }
}

test('the presentation waits for each scene action across eight chapters and ends on the real changes', async ({ page }) => {
  test.setTimeout(300_000);
  await open(page);
  // The tour is an offer, not a gate: the demo starts free, with only the launcher.
  await expect(card(page)).toHaveCount(0);
  await expect(totalItems(page)).toContainText(String(items.length));

  await startTour(page);
  await expect(backButton(page)).toBeDisabled();
  await expect(card(page).getByRole('list', { name: 'Scene 1 of 5' })).toBeVisible();
  // Manual-first: the first scene waits for its action, the page is not locked, and Auto Play is off.
  await expect(button(page, steps.dashboard[0])).toBeEnabled();
  await expect(button(page, steps.dashboard[0])).toBeFocused();
  await expect(lock(page)).toHaveCount(0);
  await expect(autoplayButton(page)).toHaveAttribute('aria-pressed', 'false');
  await expect(card(page).getByRole('button', { name: 'Pause' })).toHaveCount(0);
  // An unfinished chapter offers its scene action as the primary button, not Next.
  await expect(nextButton(page)).toHaveCount(0);
  await expect(skipButton(page)).toBeVisible();
  // Every Dashboard area is presented, one scene per press.
  const dashboardTargets = ['dashboard-summary', 'dashboard-categories', 'dashboard-condition', 'dashboard-fields', 'dashboard-locations'];
  for (const [index, id] of ['summary', 'categories', 'condition', 'fields', 'locations'].entries()) {
    await expect(card(page)).toContainText(scene('dashboard', id), PLAY);
    await expect(card(page).getByRole('list', { name: `Scene ${index + 1} of 5` })).toBeVisible();
    await expect(page.locator(`[data-tour="${dashboardTargets[index]}"]`)).toBeInViewport();
    if (index < 4) await press(page, steps.dashboard[index]);
  }
  await expectComplete(page);
  await expect(replayButton(page)).toBeVisible();
  await expect(skipButton(page)).toHaveCount(0);
  await expect(nextButton(page)).toBeFocused();

  await nextButton(page).click();
  await expectChapter(page, 1);
  await expect(page).toHaveURL(/#\/categories$/);
  // The Categories overview waits before the Photography fields appear.
  await expect(card(page)).toContainText(scene('categories', 'overview'));
  await expect(button(page, act('categories', 'overview'))).toBeEnabled();
  await expect(page.locator('[data-tour="category-fields"]')).not.toContainText('Fields for Photography');
  await press(page, act('categories', 'overview'));
  await expect(card(page)).toContainText(scene('categories', 'fields'), PLAY);
  for (const field of ['Fields for Photography', ...photographyFields.map(entry => entry.name)]) await expect(page.locator('[data-tour="category-fields"]')).toContainText(field);
  await press(page, show('categories', 'location'));
  await expect(card(page)).toContainText(scene('categories', 'location'), PLAY);
  await expectComplete(page);

  await nextButton(page).click();
  await expectChapter(page, 2);
  await expect(page).toHaveURL(/#\/hierarchy$/);
  await press(page, act('hierarchy', 'overview'));
  await expect(card(page)).toContainText(scene('hierarchy', 'location'), PLAY);
  const tree = page.locator('[data-tour="hierarchy-tree"]');
  await expect(tree.getByRole('link', { name: 'Nikon F65', exact: true })).toBeVisible();
  await expect(tree.getByText(camerasLocation, { exact: true })).toBeVisible();
  // Group by Category waits for its button.
  await expect(page).not.toHaveURL(/group=category/);
  await press(page, act('hierarchy', 'location'));
  await expect(card(page)).toContainText(scene('hierarchy', 'category'), PLAY);
  await expect(page).toHaveURL(/group=category/);
  await expect(page.getByRole('radio', { name: 'Category' })).toBeChecked();
  await press(page, act('hierarchy', 'category'));
  await expect(card(page)).toContainText(scene('hierarchy', 'tree'), PLAY);
  await press(page, act('hierarchy', 'tree'));
  await expect(card(page)).toContainText(scene('hierarchy', 'graph'), { timeout: 90_000 });
  await expect(page).toHaveURL(/view=graph/);
  await expect(page.locator('[data-tour="hierarchy-graph"] .vue-flow__node').first()).toBeVisible();
  await expectComplete(page);

  // The real Add item form, filled in its own state, one press per value, and saved once.
  await nextButton(page).click();
  await expectChapter(page, 3);
  await expect(page).toHaveURL(/#\/items\/new$/);
  await expect(card(page)).toContainText(scene('addItem', 'name'));
  await press(page, act('addItem', 'name'));
  await expect(page.getByLabel('Name *')).toHaveValue(tourItem.name, PLAY);
  await expect(card(page)).toContainText(scene('addItem', 'category'), PLAY);
  for (const id of ['category', 'condition', 'serial', 'placement', 'fields', 'photo']) await press(page, act('addItem', id));
  await expect(card(page)).toContainText(scene('addItem', 'save'), PLAY);
  await expect(page.getByLabel('Category *').locator('option:checked')).toHaveText('Photography');
  await expect(page.getByLabel('Condition', { exact: true })).toHaveValue(tourItem.condition);
  await expect(page.getByLabel('Serial Number')).toHaveValue(tourItem.serialNumber);
  await expect(page.locator('[data-tour="item-parent"]').getByText(container.name, { exact: true })).toBeVisible();
  await expect(page.getByLabel('Mount')).toHaveValue(tourItem.fields.mount);
  await expect(page.getByRole('img', { name: tourItem.photo })).toBeVisible();
  // Nothing is saved until Save the Item is pressed.
  await expect(page).toHaveURL(/#\/items\/new$/);
  await press(page, act('addItem', 'save'));
  await expect(page).toHaveURL(/#\/items\/\d+$/, PLAY);
  await expect(page.getByRole('heading', { name: tourItem.name })).toBeVisible();
  await expectComplete(page);

  await nextButton(page).click();
  await expectChapter(page, 4);
  await expect(page).toHaveURL(/#\/items$/);
  await press(page, act('items', 'overview'));
  await expect(card(page)).toContainText(scene('items', 'filter'), PLAY);
  await expect(page.getByLabel('Category', { exact: true }).locator('option:checked')).toHaveText('Photography');
  await expect(visibleLinks(page, 'Cordless drill')).toHaveCount(0);
  await press(page, act('items', 'filter'));
  await expect(page.getByRole('columnheader', { name: 'Condition' })).toHaveAttribute('aria-sort', 'ascending', PLAY);
  await press(page, act('items', 'sort'));
  await expect(page.getByLabel('Search')).toHaveValue('Nikon', PLAY);
  await expect(card(page)).toContainText(scene('items', 'search'), PLAY);
  await press(page, show('items', 'result'));
  await expect(card(page)).toContainText(scene('items', 'result', { name: tourItem.name }), PLAY);
  await expect(visibleLinks(page, tourItem.name)).toHaveCount(1);
  await expect(visibleLinks(page, 'Nikon F65')).toHaveCount(1);
  await expect(visibleLinks(page, 'Film rolls (5 pack)')).toHaveCount(0);
  await expectComplete(page);

  await nextButton(page).click();
  await expectChapter(page, 5);
  await expect(page).toHaveURL(/#\/templates$/);
  await expect(page.locator('[data-tour="template-list"]')).toContainText(templates[0].name);
  await press(page, act('templates', 'list'));
  await expect(card(page)).toContainText(scene('templates', 'open'), PLAY);
  await expect(page).toHaveURL(/#\/templates\/\d+\/edit$/);
  await expect(page.getByLabel('Template name *')).toHaveValue(templates[0].name);
  await press(page, show('templates', 'values'));
  await expect(card(page)).toContainText(scene('templates', 'values'), PLAY);
  await expect(page.getByLabel('Format')).toHaveValue(templates[0].fields.format);
  await press(page, show('templates', 'use'));
  await expectComplete(page);

  await nextButton(page).click();
  await expectChapter(page, 6);
  await expect(page).toHaveURL(/#\/checklists$/);
  await expect(page.locator('[data-tour="checklist-list"]')).toContainText(checklists[0].name);
  await press(page, act('checklists', 'list'));
  await expect(card(page)).toContainText(scene('checklists', 'open'), PLAY);
  await press(page, act('checklists', 'open'));
  await expect(page).toHaveURL(/#\/checklists\/runs\/\d+$/, PLAY);
  await expect(card(page)).toContainText(scene('checklists', 'run'), PLAY);
  await expect(page.getByRole('button', { name: 'Mark Nikon F65 as Packed' })).toHaveAttribute('aria-pressed', 'false');
  await press(page, act('checklists', 'run'));
  await expect(page.getByRole('button', { name: 'Mark Nikon F65 as Packed' })).toHaveAttribute('aria-pressed', 'true', PLAY);
  await expect(card(page)).toContainText(scene('checklists', 'uses'), PLAY);
  await expectComplete(page);

  // The payoff names only what the tour really changed, with the real numbers, one press at a time.
  await nextButton(page).click();
  await expectChapter(page, 7);
  await expect(page).toHaveURL(/#\/dashboard$/);
  await expect(card(page)).toContainText(scene('result', 'changed', { name: tourItem.name }));
  const changes = [
    `Total items: ${items.length} → ${items.length + 1}.`,
    `Items by category, Photography: ${photography} → ${photography + 1}.`,
    `Condition breakdown, Good: ${good} → ${good + 1}.`,
    `Items by location, ${camerasLocation}: ${atCamerasLocation} → ${atCamerasLocation + 1}.`,
    scene('result', 'explore')
  ];
  for (const [index, text] of changes.entries()) {
    await press(page, steps.result[index]);
    await expect(card(page)).toContainText(text, PLAY);
  }
  await expect(card(page).getByRole('list', { name: /of 6$/ })).toBeVisible();
  await expect(totalItems(page)).toContainText(String(items.length + 1));
  await expectComplete(page);
  await expect(card(page)).not.toContainText('tour.chapters');

  for (const name of ['Explore on your own', 'Reset demo']) await expect(card(page).getByRole('button', { name })).toBeVisible();
  await expect(card(page).getByRole('link', { name: 'Get Inventory Atlas Lite' })).toHaveAttribute('href', /inventory-atlas-lite#official-releases$/);
  await expect(card(page).getByRole('link', { name: 'View on GitHub' })).toHaveAttribute('href', 'https://github.com/bloschinsky/inventory-atlas-lite');
  await expect(nextButton(page)).toHaveCount(0);

  // The saved item is a real demo record: its details show the photo, container, and fields.
  await card(page).getByRole('button', { name: 'Explore on your own' }).click();
  await expect(card(page)).toHaveCount(0);
  await expect(spotlight(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Guided tour' })).toBeFocused();
  await page.getByRole('link', { name: 'Items', exact: true }).click();
  await page.getByLabel('Search').fill('spare body');
  await page.getByLabel('Category', { exact: true }).selectOption('');
  await visibleLinks(page, tourItem.name).click();
  await expect(page.getByRole('heading', { name: tourItem.name })).toBeVisible();
  await expect(page.getByText(tourItem.serialNumber)).toBeVisible();
  await expect(page.getByRole('link', { name: container.name }).first()).toBeVisible();
  const photo = page.getByRole('img', { name: new RegExp(tourItem.photo.replace('.', '\\.')) }).first();
  await expect(photo).toBeVisible();
  expect(await photo.evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
});

test('a waiting scene never acts on its own, and a repeated press runs its action once', async ({ page }) => {
  test.setTimeout(120_000);
  // The page clock flows normally; jumping it forward proves that no timer advances a waiting scene.
  await page.clock.install();
  await open(page);
  await startTour(page);
  await expect(button(page, steps.dashboard[0])).toBeEnabled();
  await page.clock.fastForward('01:00');
  await expect(card(page)).toContainText(scene('dashboard', 'summary'));
  await expect(card(page).getByRole('list', { name: 'Scene 1 of 5' })).toBeVisible();

  // Two clicks in the same moment, before the button can turn disabled, show one next scene only.
  await button(page, steps.dashboard[0]).evaluate(element => { element.click(); element.click(); });
  await expect(card(page).getByRole('list', { name: 'Scene 2 of 5' })).toBeVisible();
  await expect(button(page, steps.dashboard[1])).toBeEnabled(PLAY);
  await expect(card(page).getByRole('list', { name: 'Scene 2 of 5' })).toBeVisible();

  // The Add item form stays empty until the scene's action is pressed; the button is disabled meanwhile.
  await goTo(page, 3);
  const enter = button(page, act('addItem', 'name'));
  await expect(enter).toBeEnabled(PLAY);
  await page.clock.fastForward('01:00');
  await expect(page.getByLabel('Name *')).toHaveValue('');
  await expect(card(page).getByRole('list', { name: 'Scene 1 of 8' })).toBeVisible();
  await enter.click();
  await expect(enter).toBeDisabled();
  await expect(page.getByLabel('Name *')).toHaveValue(tourItem.name, PLAY);
  await expect(button(page, act('addItem', 'category'))).toBeEnabled(PLAY);
  await expect(page.getByLabel('Serial Number')).toHaveValue('');
});

test('Auto Play is optional, presses the same scene actions, and holds on Pause or when switched off', async ({ page }) => {
  test.setTimeout(180_000);
  await page.clock.install();
  await open(page);
  await startTour(page);
  await expect(autoplayButton(page)).toHaveAttribute('aria-pressed', 'false');

  // Switched on and off at once: the pending delay of the waiting scene never fires later.
  await expect(button(page, steps.dashboard[0])).toBeEnabled();
  await autoplayButton(page).click();
  await autoplayButton(page).click();
  await page.clock.fastForward('00:30');
  await expect(card(page).getByRole('list', { name: 'Scene 1 of 5' })).toBeVisible();

  // On: the chapter advances through its scenes without a press, and Pause is offered.
  await autoplayButton(page).click();
  await expect(autoplayButton(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(card(page).getByRole('button', { name: 'Pause' })).toBeVisible();
  await expect(card(page)).toContainText(scene('dashboard', 'locations'), PLAY);
  await expectComplete(page);
  // A complete chapter waits for Next; Pause is only for a chapter that still plays.
  await expect(card(page).getByRole('button', { name: 'Pause' })).toHaveCount(0);

  // Auto Play stays on for the next chapter, and presses its real actions.
  await nextButton(page).click();
  await expectChapter(page, 1);
  await expect(page.locator('[data-tour="category-fields"]')).toContainText('Fields for Photography', PLAY);
  await expectComplete(page);
  await nextButton(page).click();
  await expectChapter(page, 2);

  // Pause holds the waiting scene however long the visitor looks around.
  await expect(button(page, act('hierarchy', 'overview'))).toBeEnabled(PLAY);
  await card(page).getByRole('button', { name: 'Pause' }).click();
  await expect(card(page)).toContainText('Auto Play is paused. Press Resume to continue.');
  const held = await sceneList(page).getAttribute('aria-label');
  await page.clock.fastForward('01:00');
  await expect(sceneList(page)).toHaveAttribute('aria-label', held);
  await card(page).getByRole('button', { name: 'Resume' }).click();
  await expect(page).toHaveURL(/group=category/, PLAY);

  // Off: the chapter waits for the scene action again.
  await autoplayButton(page).click();
  await expect(autoplayButton(page)).toHaveAttribute('aria-pressed', 'false');
  await expect(card(page).getByRole('button', { name: /^(Pause|Resume)$/ })).toHaveCount(0);
  const waiting = card(page).locator('.demo-tour-primary');
  await expect(waiting).toBeEnabled(PLAY);
  const stopped = await sceneList(page).getAttribute('aria-label');
  await page.clock.fastForward('01:00');
  await expect(sceneList(page)).toHaveAttribute('aria-label', stopped);
  await expect(page).not.toHaveURL(/view=graph/);

  // Replay starts the chapter from its first scene, in either mode.
  await replayButton(page).click();
  await expect(card(page).getByRole('list', { name: 'Scene 1 of 5' })).toBeVisible();
  await expect(button(page, act('hierarchy', 'overview'))).toBeEnabled(PLAY);
  await autoplayButton(page).click();
  await replayButton(page).click();
  await expect(card(page)).toContainText(scene('hierarchy', 'graph'), PLAY);
  await expect(page).toHaveURL(/view=graph/);
  await expectComplete(page);
});

test('Replay, Back, and Next replay chapters without creating anything twice', async ({ page }) => {
  test.setTimeout(240_000);
  await open(page);
  await startTour(page);
  await goTo(page, 3);
  await playChapter(page, 'addItem');
  await expect(page).toHaveURL(/#\/items\/\d+$/);
  const details = page.url();

  // Replay starts only the current chapter again: on the saved item's edit form, saved once more.
  await replayButton(page).click();
  await expectChapter(page, 3);
  await expect(page).toHaveURL(/#\/items\/\d+\/edit$/);
  await expect(card(page)).toContainText(scene('addItem', 'name'));
  await expect(card(page).getByRole('list', { name: 'Scene 1 of 8' })).toBeVisible();
  await playChapter(page, 'addItem');
  await expect(page).toHaveURL(details);
  // The photo is not uploaded a second time.
  await expect(page.getByRole('img', { name: new RegExp(tourItem.photo.replace('.', '\\.')) })).toHaveCount(1);

  await goTo(page, 4);
  await playChapter(page, 'items');
  await expect(visibleLinks(page, tourItem.name)).toHaveCount(1);
  // Back leaves the chapter at once, even while a scene waits or acts.
  await replayButton(page).click();
  await press(page, act('items', 'overview'));
  await backButton(page).click();
  await expectChapter(page, 3);
  await expect(page).toHaveURL(/#\/items\/\d+\/edit$/);
  await expect(button(page, act('addItem', 'name'))).toBeEnabled(PLAY);
  await goTo(page, 4);
  await playChapter(page, 'items');
  await expect(visibleLinks(page, tourItem.name)).toHaveCount(1);

  // The Checklists chapter continues its run instead of starting a second one.
  await goTo(page, 6);
  await playChapter(page, 'checklists');
  const run = page.url();
  await replayButton(page).click();
  await expect(card(page)).toContainText(scene('checklists', 'list'));
  await playChapter(page, 'checklists');
  expect(page.url()).toBe(run);
  await expect(page.getByRole('button', { name: 'Mark Nikon F65 as Packed' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('link', { name: 'Back to checklist' }).click();
  await expect(page.locator('section').filter({ hasText: 'Run history' }).getByRole('row')).toHaveCount(2);

  // Reset demo restores the canonical checklist and inventory.
  await card(page).getByRole('button', { name: 'Close tour' }).click();
  await page.getByRole('button', { name: 'Reset demo' }).click();
  await expect(totalItems(page)).toContainText(String(items.length));
  await page.mouse.move(600, 400);
  await page.getByRole('link', { name: 'Checklists', exact: true }).click();
  await expect(page.getByRole('article', { name: checklists[0].name })).toContainText('Never run');
});

test('closing the tour stops its scene work, and Escape and Reset demo still work', async ({ page }) => {
  test.setTimeout(120_000);
  await open(page);
  await startTour(page);
  await goTo(page, 1);
  await page.getByRole('button', { name: 'Close tour' }).click();
  await expect(card(page)).toHaveCount(0);
  await expect(spotlight(page)).toHaveCount(0);
  await expect(lock(page)).toHaveCount(0);
  await page.getByRole('link', { name: 'Hierarchy', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Hierarchy', level: 1 })).toBeVisible();
  // A closed chapter never acts on the page the visitor opened next.
  await expect(page).toHaveURL(/#\/hierarchy$/);

  // Escape closes the card too, even while a scene types into the form and holds the focus there.
  await startTour(page);
  await goTo(page, 3);
  await press(page, act('addItem', 'name'));
  await expect(page.getByLabel('Name *')).toBeFocused(PLAY);
  await page.keyboard.press('Escape');
  await expect(card(page)).toHaveCount(0);
  await expect(lock(page)).toHaveCount(0);
  await page.getByLabel('Description').fill('Visitor text');
  await expect(page.getByLabel('Category *').locator('option:checked')).not.toHaveText('Photography');
  await expect(page).toHaveURL(/#\/items\/new$/);

  await page.getByRole('button', { name: 'Reset demo' }).click();
  await expect(page).toHaveURL(`${demoURL}#/dashboard`);
  await expect(totalItems(page)).toContainText(String(items.length));
  await page.mouse.move(600, 400);
  await page.getByRole('link', { name: 'Items', exact: true }).click();
  await page.getByLabel('Search').fill('spare body');
  await expect(page.getByText('No matching items')).toBeVisible();
});

test('a scene that fails names its chapter and scene, unlocks the page, and offers Replay and Next', async ({ page }) => {
  test.setTimeout(120_000);
  const warnings = [];
  page.on('console', message => { if (message.type() === 'warning') warnings.push(message.text()); });
  await open(page);
  await startTour(page);
  // Simulates a page that no longer renders a scene's target.
  const strip = hook => page.evaluate(name => {
    const hide = () => document.querySelectorAll(`[data-tour="${name}"]`).forEach(element => element.setAttribute('data-tour', 'hidden'));
    window.tourTestObserver = new MutationObserver(hide);
    window.tourTestObserver.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-tour'] });
    hide();
  }, hook);
  const restore = hook => page.evaluate(name => {
    window.tourTestObserver.disconnect();
    document.querySelectorAll('[data-tour="hidden"]').forEach(element => element.setAttribute('data-tour', name));
  }, hook);

  await strip('category-fields');
  await skipButton(page).click();
  await press(page, act('categories', 'overview'));
  const alert = card(page).getByRole('alert');
  await expect(alert).toContainText('This chapter could not be shown.', { timeout: 30_000 });
  expect(warnings.some(text => text.includes('chapter "categories", scene "overview"'))).toBe(true);
  await expect(lock(page)).toHaveCount(0);
  await expect(spotlight(page)).toHaveCount(0);
  await expect(nextButton(page)).toBeEnabled();
  await expect(nextButton(page)).toBeFocused();
  // The page itself stays usable.
  await expect(page.getByRole('heading', { name: 'Categories & Fields', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: /^Storage/ }).click();
  await expect(page.locator('[data-tour="hidden"]')).toContainText('Fields for Storage');

  await restore('category-fields');
  await replayButton(page).click();
  await expect(alert).toHaveCount(0);
  await playChapter(page, 'categories');

  await strip('hierarchy-controls');
  await nextButton(page).click();
  await expect(alert).toBeVisible({ timeout: 30_000 });
  await restore('hierarchy-controls');
  await nextButton(page).click();
  await expectChapter(page, 3);
  await expect(card(page)).toContainText(scene('addItem', 'name'));
});

test('the presenter uses the inverse of the application color mode', async ({ page }) => {
  const luminance = locator => locator.evaluate(element => {
    const [r, g, b] = getComputedStyle(element).backgroundColor.match(/\d+/g).map(Number);
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  });
  await open(page);
  await startTour(page);
  await expect(card(page)).toHaveAttribute('data-bs-theme', 'dark');
  expect(await luminance(card(page))).toBeLessThan(0.3);
  // The inverse card stays readable and interactive.
  const text = card(page).getByRole('heading', { name: title('dashboard') });
  expect(await text.evaluate(element => getComputedStyle(element).color)).not.toBe(await card(page).evaluate(element => getComputedStyle(element).backgroundColor));
  await autoplayButton(page).click();
  await card(page).getByRole('button', { name: 'Pause' }).click();
  await expect(card(page).getByRole('button', { name: 'Resume' })).toBeVisible();
  await card(page).getByRole('button', { name: 'Close tour' }).click();

  await page.evaluate(() => localStorage.setItem('inventory-atlas-theme', 'dark'));
  await page.reload();
  await page.mouse.move(600, 400);
  await startTour(page);
  await expect(card(page)).toHaveAttribute('data-bs-theme', 'light');
  expect(await luminance(card(page))).toBeGreaterThan(0.8);
  expect(await luminance(page.locator('body'))).toBeLessThan(0.3);
  await press(page, steps.dashboard[0]);
  await expect(card(page)).toContainText(scene('dashboard', 'categories'), PLAY);
});

test('the keyboard drives the tour: Enter presses the focused scene action, and Escape closes', async ({ page }) => {
  await open(page);
  await startTour(page);
  await expect(button(page, steps.dashboard[0])).toBeFocused(PLAY);
  await page.keyboard.press('Enter');
  await expect(card(page)).toContainText(scene('dashboard', 'categories'), PLAY);
  // After the scene changes, the focus is on the next scene action again.
  await expect(button(page, steps.dashboard[1])).toBeFocused(PLAY);
  await page.keyboard.press('Space');
  await expect(card(page)).toContainText(scene('dashboard', 'condition'), PLAY);
  await page.keyboard.press('Escape');
  await expect(card(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Guided tour' })).toBeFocused();
});

test('the tour speaks Ukrainian when the interface does', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('inventory-atlas.locale', 'uk'));
  await open(page);
  await page.getByRole('button', { name: 'Екскурсія' }).click();
  const ukDialog = page.getByRole('dialog', { name: 'Панель' });
  await expect(ukDialog.getByRole('progressbar')).toHaveAttribute('aria-valuetext', 'Розділ 1 з 8');
  await expect(ukDialog).toContainText('Панель показує весь інвентар одразу.');
  await ukDialog.getByRole('button', { name: 'Показати «Предмети за категоріями»' }).click();
  await expect(ukDialog).toContainText(uk.tour.chapters.dashboard.scenes.categories, PLAY);
  await ukDialog.getByRole('button', { name: 'Пропустити розділ' }).click();
  await expect(page.getByRole('dialog', { name: 'Категорії та поля' })).toContainText('Категорія визначає, чим є предмет.');
  await page.getByRole('button', { name: 'Автопоказ' }).click();
  await page.getByRole('button', { name: 'Пауза' }).click();
  await expect(page.getByRole('button', { name: 'Продовжити' })).toBeVisible();
  await page.getByRole('button', { name: 'Закрити екскурсію' }).click();
  await expect(page.getByRole('button', { name: 'Екскурсія' })).toBeVisible();
});

test.describe('on the Ukrainian demo', () => {
  const ukrainian = createDemoFixture('uk');
  const ukCopy = uk.tour.chapters;
  const ukParams = copyParams(ukrainian);
  const ukScene = (chapter, id, params = {}) => fill(ukCopy[chapter].scenes[id], { ...ukParams, ...params });
  const ukAct = (chapter, id) => fill(ukCopy[chapter].actions[id], ukParams);
  const ukShow = (chapter, id) => fill(ukCopy[chapter].continue[id], ukParams);
  const ukCard = page => page.getByRole('dialog').filter({ has: page.getByRole('progressbar', { name: 'Перебіг екскурсії' }) });
  const ukPress = async (page, name) => {
    const action = ukCard(page).getByRole('button', { name, exact: true });
    await expect(action).toBeEnabled(PLAY);
    await action.click();
  };
  const ukCategory = byKey(ukrainian.categories, ukrainian.tourItem.category);
  const ukContainer = byKey(ukrainian.items, ukrainian.tourItem.container);
  const ukComplete = async page => {
    await expect(ukCard(page).getByRole('button', { name: /^(Далі|Досліджувати самостійно)$/ })).toBeVisible(PLAY);
    await expect(ukCard(page).getByRole('alert')).toHaveCount(0);
  };
  const ukGoTo = async (page, index) => {
    const current = Number(await ukCard(page).getByRole('progressbar').getAttribute('aria-valuenow')) - 1;
    for (let chapter = current + 1; chapter <= index; chapter++) {
      await ukCard(page).getByRole('button', { name: /^(Далі|Пропустити розділ)$/ }).click();
      await expect(ukCard(page).getByRole('progressbar')).toHaveAttribute('aria-valuetext', `Розділ ${chapter + 1} з ${chapters.length}`);
    }
  };

  test('the tour plays on the Ukrainian inventory, adds a Ukrainian item once, and reports the real changes', async ({ page }) => {
    test.setTimeout(300_000);
    await open(page, '?lang=uk#/dashboard');
    await page.getByRole('button', { name: 'Екскурсія' }).click();
    await expect(page.getByRole('dialog', { name: ukCopy.dashboard.title })).toBeVisible();

    await ukGoTo(page, 1);
    await ukPress(page, ukAct('categories', 'overview'));
    await expect(ukCard(page)).toContainText(ukScene('categories', 'fields'), PLAY);
    for (const field of ukCategory.fields) await expect(page.locator('[data-tour="category-fields"]')).toContainText(field.name);
    await ukPress(page, ukShow('categories', 'location'));
    await ukComplete(page);

    await ukGoTo(page, 2);
    await ukPress(page, ukAct('hierarchy', 'overview'));
    await expect(ukCard(page)).toContainText(ukScene('hierarchy', 'location'), PLAY);
    await expect(page.locator('[data-tour="hierarchy-tree"]').getByRole('link', { name: 'Nikon F65', exact: true })).toBeVisible();
    await ukGoTo(page, 3);

    // Add an Item fills the form with the Ukrainian fixture values, found by key, and saves once.
    await expect(page).toHaveURL(/#\/items\/new$/);
    const addSteps = ['name', 'category', 'condition', 'serial', 'placement', 'fields', 'photo', 'save'];
    for (const id of addSteps) await ukPress(page, ukAct('addItem', id));
    await expect(page).toHaveURL(/#\/items\/\d+$/, PLAY);
    await expect(page.getByRole('heading', { name: ukrainian.tourItem.name })).toBeVisible();
    await ukComplete(page);
    const details = page.url();

    // Replay edits the same item instead of adding a second one.
    await ukCard(page).getByRole('button', { name: 'Повторити розділ' }).click();
    await expect(page).toHaveURL(/#\/items\/\d+\/edit$/);
    await expect(page.getByLabel('Назва *')).toHaveValue(ukrainian.tourItem.name, PLAY);
    await expect(page.getByLabel(ukCategory.fields[0].name)).toHaveValue(ukrainian.tourItem.fields.mount);
    await expect(page.getByLabel(ukCategory.fields[1].name)).toHaveValue(ukrainian.tourItem.fields.format);
    for (const id of addSteps) await ukPress(page, ukAct('addItem', id));
    await expect(page).toHaveURL(details, PLAY);
    await ukComplete(page);

    await ukGoTo(page, 4);
    await ukPress(page, ukAct('items', 'overview'));
    await expect(ukCard(page)).toContainText(ukScene('items', 'filter'), PLAY);
    await expect(page.getByLabel('Категорія', { exact: true }).locator('option:checked')).toHaveText(ukCategory.name);
    await ukPress(page, ukAct('items', 'filter'));
    await ukPress(page, ukAct('items', 'sort'));
    await ukPress(page, ukShow('items', 'result'));
    await expect(ukCard(page)).toContainText(ukScene('items', 'result', { name: ukrainian.tourItem.name }), PLAY);
    await expect(visibleLinks(page, ukrainian.tourItem.name)).toHaveCount(1);
    await ukComplete(page);

    // The final chapter shows each real change on its own press, with the Ukrainian names.
    await ukGoTo(page, 7);
    await expect(ukCard(page)).toContainText(ukScene('result', 'changed', { name: ukrainian.tourItem.name }), PLAY);
    await ukPress(page, ukShow('result', 'total'));
    await ukPress(page, ukShow('result', 'category'));
    await expect(ukCard(page)).toContainText(`Предмети за категоріями, ${ukCategory.name}: ${photography} → ${photography + 1}.`, PLAY);
    await ukPress(page, ukShow('result', 'condition'));
    await ukPress(page, ukShow('result', 'location'));
    await expect(ukCard(page)).toContainText(`Предмети за місцем, ${ukContainer.location}: ${atCamerasLocation} → ${atCamerasLocation + 1}.`, PLAY);
    await ukPress(page, ukShow('result', 'explore'));
    await ukComplete(page);
    await expect(ukCard(page)).not.toContainText('{');
  });

  test('a language change closes the tour and seeds the demo again, and the tour then starts in the new language', async ({ page }) => {
    test.setTimeout(180_000);
    await open(page);
    await startTour(page);
    await goTo(page, 3);
    await press(page, act('addItem', 'name'));
    await expect(page.getByLabel('Name *')).toHaveValue(tourItem.name, PLAY);
    await page.getByRole('link', { name: 'Settings', exact: true }).click();
    await page.mouse.move(600, 400);
    await page.getByLabel('Language').selectOption('uk');

    // Nothing of the English run is left: no card, no spotlight, no lock, no half-saved English item.
    await expect(ukCard(page)).toHaveCount(0);
    await expect(spotlight(page)).toHaveCount(0);
    await expect(lock(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Екскурсія' })).toBeVisible();
    await expect(page.getByRole('complementary', { name: 'Демо-режим' })).toContainText('Демо-дані оновлено українською мовою.');
    await page.getByRole('link', { name: 'Панель', exact: true }).click();
    await page.mouse.move(600, 400);
    await expect(page.getByRole('region', { name: 'Усього предметів' })).toContainText(String(items.length));

    await page.getByRole('button', { name: 'Екскурсія' }).click();
    await expect(page.getByRole('dialog', { name: ukCopy.dashboard.title })).toBeVisible();
    await ukGoTo(page, 1);
    await ukPress(page, ukAct('categories', 'overview'));
    await expect(ukCard(page)).toContainText(ukScene('categories', 'fields'), PLAY);
  });
});

test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('the spotlight does not move, values appear at once, and every scene still waits for its action', async ({ page }) => {
    test.setTimeout(120_000);
    await page.clock.install();
    await open(page);
    await startTour(page);
    expect(await spotlight(page).evaluate(element => getComputedStyle(element).transitionDuration)).toBe('0s');
    await goTo(page, 3);
    await expect(button(page, act('addItem', 'name'))).toBeEnabled(PLAY);
    await page.clock.fastForward('01:00');
    await expect(page.getByLabel('Name *')).toHaveValue('');
    await playChapter(page, 'addItem');
    await expect(page).toHaveURL(/#\/items\/\d+$/);
    await goTo(page, 4);
    await playChapter(page, 'items');
    await expect(visibleLinks(page, tourItem.name)).toHaveCount(1);
  });
});

/*
  On phones the presenter is a compact strip: it covers about a third of the screen at most, keeps
  its scene action visible, and leaves the highlighted target above it.
*/
async function expectCompactPresenter(page, viewport) {
  const box = await card(page).boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  expect(box.height).toBeLessThanOrEqual(viewport.height * 0.35 + 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
  // One compact line names the chapter; the identity block of wide screens is not shown.
  await expect(card(page).getByText('Guided tour', { exact: true })).toBeHidden();
  return box;
}

test.describe('on a phone', () => {
  const viewport = { width: 390, height: 844 };
  test.use({ viewport });

  test('the compact presenter leaves the page visible, and every chapter plays', async ({ page }) => {
    test.setTimeout(300_000);
    await open(page, '#/items');
    await startTour(page);
    await expect(card(page)).toContainText(`1/8 · ${title('dashboard')}`);
    const heights = [];
    for (let index = 0; index < chapters.length; index++) {
      if (index) {
        await nextButton(page).click();
        await expectChapter(page, index);
      }
      for (const name of steps[chapters[index]]) {
        const action = button(page, name);
        await expect(action).toBeEnabled(PLAY);
        const box = await expectCompactPresenter(page, viewport);
        heights.push(box.height);
        // The scene action stays visible and easy to tap.
        const actionBox = await action.boundingBox();
        expect(actionBox.height).toBeGreaterThanOrEqual(36);
        expect(actionBox.y + actionBox.height).toBeLessThanOrEqual(viewport.height);
        // The highlighted target starts above the presenter, so the visitor sees what the action changes.
        const spot = await spotlight(page).boundingBox();
        if (spot) expect(spot.y).toBeLessThan(box.y);
        await action.click();
      }
      await expectComplete(page);
    }
    // A normal scene keeps the presenter at about 180-240 px.
    heights.sort((a, b) => a - b);
    expect(heights[Math.floor(heights.length / 2)]).toBeLessThanOrEqual(240);
    // Icon-only controls still have their names and a touch size.
    for (const name of ['Back', 'Replay chapter', 'Auto Play']) {
      const control = button(page, name);
      await expect(control).toHaveAttribute('title', name);
      expect((await control.boundingBox()).height).toBeGreaterThanOrEqual(36);
    }
    // Phones sort through the Sort select instead of the table header.
    await expect(totalItems(page)).toContainText(String(items.length + 1));
    await card(page).getByRole('button', { name: 'Explore on your own' }).click();
    await page.getByRole('button', { name: 'Open navigation menu' }).click();
    await expect(page.getByRole('dialog', { name: 'Main navigation' })).toBeVisible();
  });
});

for (const viewport of [{ width: 360, height: 800 }, { width: 430, height: 932 }]) {
  test.describe(`on a ${viewport.width} × ${viewport.height} phone`, () => {
    test.use({ viewport });

    test('the presenter stays compact with Auto Play and Pause in its controls row', async ({ page }) => {
      test.setTimeout(120_000);
      await open(page);
      await startTour(page);
      await expect(button(page, steps.dashboard[0])).toBeEnabled();
      await expectCompactPresenter(page, viewport);
      await autoplayButton(page).click();
      await card(page).getByRole('button', { name: 'Pause' }).click();
      // Six controls fit one row: the scene action keeps its place beside the icon buttons.
      const controls = await card(page).locator('.demo-tour-controls > *').evaluateAll(elements => elements.map(element => {
        const rect = element.getBoundingClientRect();
        return rect.top + rect.height / 2;
      }));
      expect(controls).toHaveLength(6);
      expect(Math.max(...controls) - Math.min(...controls)).toBeLessThan(4);
      const box = await expectCompactPresenter(page, viewport);
      expect(box.height).toBeLessThanOrEqual(260);
      // A new chapter starts unpaused; switching Auto Play off leaves its scene waiting.
      await goTo(page, 3);
      await autoplayButton(page).click();
      await expect(button(page, act('addItem', 'name')).or(button(page, act('addItem', 'category')))).toBeEnabled(PLAY);
      await expectCompactPresenter(page, viewport);
    });
  });
}

test('the self-hosted application never shows the public tour', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Guided tour' })).toHaveCount(0);
  await expect(page.getByRole('complementary', { name: 'Demo mode' })).toHaveCount(0);
});
