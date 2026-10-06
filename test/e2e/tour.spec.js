import { expect, test } from '@playwright/test';
import { byKey, createDemoFixture } from '../../client/src/demo/fixture.js';
import en from '../../client/src/i18n/locales/en.json' with { type: 'json' };
import uk from '../../client/src/i18n/locales/uk.json' with { type: 'json' };
import { demoURL } from './environment.js';

/*
  The guided presentation of the public demo, on the built demo inside the landing build (see
  demo.spec.js). It plays chapters of automated scenes on the real pages, so each chapter is checked
  on the page it opened: the scene copy it showed, the highlighted `data-tour` targets, and the data
  its actions left behind. The checks wait for observable states, never for fixed times.
*/
const chapters = ['dashboard', 'categories', 'hierarchy', 'addItem', 'items', 'templates', 'checklists', 'result'];
const { checklists, items, templates, tourItem, categories } = createDemoFixture('en');
const photographyFields = byKey(categories, tourItem.category).fields;
const container = byKey(items, tourItem.container);

/*
  The scene copy as the presenter shows it: the fixture names the copy refers to by placeholder
  (see copyParams() in client/src/demo/tourChapters.js), in the language of the fixture.
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
// A full chapter plays for several seconds; Add item types every value visibly.
const PLAY = { timeout: 45_000 };

const card = page => page.getByRole('dialog', { name: /./ }).filter({ hasText: 'Guided tour' });
const nextButton = page => card(page).getByRole('button', { name: 'Next' });
const backButton = page => card(page).getByRole('button', { name: 'Back' });
const replayButton = page => card(page).getByRole('button', { name: 'Replay chapter' });
const spotlight = page => page.locator('.demo-tour-spotlight');
const lock = page => page.locator('.demo-tour-lock');
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
  await expect(card(page)).toContainText(`Chapter ${index + 1} of ${chapters.length}`);
}

// A chapter has finished once it offers Replay chapter in place of Pause, without a failure.
async function expectPlayed(page) {
  await expect(card(page).getByRole('button', { name: 'Pause' })).toHaveCount(0, PLAY);
  await expect(card(page).getByRole('button', { name: 'Resume' })).toHaveCount(0);
  await expect(card(page).getByRole('alert')).toHaveCount(0);
  await expect(lock(page)).toHaveCount(0);
}

async function startTour(page) {
  await page.getByRole('button', { name: 'Guided tour' }).click();
  await expectChapter(page, 0);
}

// Next leaves an unfinished chapter at once, so a test can go straight to the chapter it checks.
async function goTo(page, index) {
  const current = Number((await card(page).textContent()).match(/Chapter (\d+) of/)[1]) - 1;
  for (let chapter = current + 1; chapter <= index; chapter++) {
    await nextButton(page).click();
    await expectChapter(page, chapter);
  }
}

// The scene copy appears in order as the chapter plays it, with the spotlight on its target.
async function expectScenes(page, chapter, ids) {
  for (const id of ids) {
    await expect(card(page)).toContainText(scene(chapter, id), PLAY);
    await expect(spotlight(page)).toBeVisible();
  }
}

test('the presentation plays eight chapters on the real demo and ends on the real changes', async ({ page }) => {
  test.setTimeout(300_000);
  await open(page);
  // The tour is an offer, not a gate: the demo starts free, with only the launcher.
  await expect(card(page)).toHaveCount(0);
  await expect(totalItems(page)).toContainText(String(items.length));

  await startTour(page);
  await expect(backButton(page)).toBeDisabled();
  await expect(card(page).getByRole('list', { name: 'Scene 1 of 5' })).toBeVisible();
  // While a chapter plays, the page is locked and Pause is offered.
  await expect(lock(page)).toBeVisible();
  await expect(card(page).getByRole('button', { name: 'Pause' })).toBeVisible();
  // Every Dashboard area is presented, one scene after another, without pressing Next.
  const dashboardTargets = ['dashboard-summary', 'dashboard-categories', 'dashboard-condition', 'dashboard-fields', 'dashboard-locations'];
  for (const [index, id] of ['summary', 'categories', 'condition', 'fields', 'locations'].entries()) {
    await expect(card(page)).toContainText(scene('dashboard', id), PLAY);
    await expect(card(page).getByRole('list', { name: `Scene ${index + 1} of 5` })).toBeVisible();
    await expect(page.locator(`[data-tour="${dashboardTargets[index]}"]`)).toBeInViewport();
  }
  await expectPlayed(page);
  await expect(replayButton(page)).toBeVisible();

  await goTo(page, 1);
  await expect(page).toHaveURL(/#\/categories$/);
  // The Categories overview comes before the Photography fields.
  await expect(card(page)).toContainText(scene('categories', 'overview'));
  await expect(page.locator('[data-tour="category-fields"]')).not.toContainText('Fields for Photography');
  await expectScenes(page, 'categories', ['select', 'fields', 'location']);
  for (const field of ['Fields for Photography', ...photographyFields.map(entry => entry.name)]) await expect(page.locator('[data-tour="category-fields"]')).toContainText(field);
  await expectPlayed(page);

  await goTo(page, 2);
  await expect(page).toHaveURL(/#\/hierarchy$/);
  await expectScenes(page, 'hierarchy', ['overview', 'location']);
  const tree = page.locator('[data-tour="hierarchy-tree"]');
  await expect(tree.getByRole('link', { name: 'Nikon F65', exact: true })).toBeVisible();
  await expect(tree.getByText(camerasLocation, { exact: true })).toBeVisible();
  await expectScenes(page, 'hierarchy', ['category']);
  await expect(page).toHaveURL(/group=category/);
  await expect(page.getByRole('radio', { name: 'Category' })).toBeChecked();
  await expectScenes(page, 'hierarchy', ['tree', 'graph']);
  await expect(page).toHaveURL(/view=graph/);
  await expect(page.getByRole('application', { name: 'Category graph' }).or(page.locator('[data-tour="hierarchy-graph"]'))).toBeVisible();
  await expect(page.locator('[data-tour="hierarchy-graph"] .vue-flow__node').first()).toBeVisible();
  await expectPlayed(page);

  // The real Add item form, filled in its own state, scene by scene, and saved once.
  await goTo(page, 3);
  await expect(page).toHaveURL(/#\/items\/new$/);
  await expectScenes(page, 'addItem', ['name']);
  await expect(page.getByLabel('Name *')).toHaveValue(tourItem.name, PLAY);
  await expectScenes(page, 'addItem', ['category', 'condition', 'serial', 'placement', 'fields', 'photo']);
  await expect(page.getByLabel('Category *').locator('option:checked')).toHaveText('Photography');
  await expect(page.getByLabel('Condition', { exact: true })).toHaveValue(tourItem.condition);
  await expect(page.getByLabel('Serial Number')).toHaveValue(tourItem.serialNumber);
  await expect(page.locator('[data-tour="item-parent"]').getByText(container.name, { exact: true })).toBeVisible();
  await expect(page.getByLabel('Mount')).toHaveValue(tourItem.fields.mount);
  await expect(page.getByRole('img', { name: tourItem.photo })).toBeVisible(PLAY);
  await expectScenes(page, 'addItem', ['save']);
  await expect(page).toHaveURL(/#\/items\/\d+$/, PLAY);
  await expect(page.getByRole('heading', { name: tourItem.name })).toBeVisible();
  await expectPlayed(page);

  await goTo(page, 4);
  await expect(page).toHaveURL(/#\/items$/);
  await expectScenes(page, 'items', ['overview', 'filter']);
  await expect(page.getByLabel('Category', { exact: true }).locator('option:checked')).toHaveText('Photography');
  await expect(visibleLinks(page, 'Cordless drill')).toHaveCount(0);
  await expectScenes(page, 'items', ['sort']);
  await expect(page.getByRole('columnheader', { name: 'Condition' })).toHaveAttribute('aria-sort', 'ascending', PLAY);
  await expectScenes(page, 'items', ['search']);
  await expect(page.getByLabel('Search')).toHaveValue('Nikon', PLAY);
  await expect(card(page)).toContainText(scene('items', 'result', { name: tourItem.name }), PLAY);
  await expect(visibleLinks(page, tourItem.name)).toHaveCount(1);
  await expect(visibleLinks(page, 'Nikon F65')).toHaveCount(1);
  await expect(visibleLinks(page, 'Film rolls (5 pack)')).toHaveCount(0);
  await expectPlayed(page);

  await goTo(page, 5);
  await expect(page).toHaveURL(/#\/templates$/);
  await expect(page.locator('[data-tour="template-list"]')).toContainText(templates[0].name);
  await expectScenes(page, 'templates', ['list', 'open', 'values', 'use']);
  await expect(page).toHaveURL(/#\/templates\/\d+\/edit$/);
  await expect(page.getByLabel('Template name *')).toHaveValue(templates[0].name);
  await expect(page.getByLabel('Format')).toHaveValue(templates[0].fields.format);
  await expectPlayed(page);

  await goTo(page, 6);
  await expect(page).toHaveURL(/#\/checklists$/);
  await expect(page.locator('[data-tour="checklist-list"]')).toContainText(checklists[0].name);
  await expectScenes(page, 'checklists', ['list', 'open', 'check']);
  await expect(page).toHaveURL(/#\/checklists\/runs\/\d+$/, PLAY);
  await expect(page.getByRole('button', { name: 'Mark Nikon F65 as Packed' })).toHaveAttribute('aria-pressed', 'true', PLAY);
  await expectScenes(page, 'checklists', ['uses']);
  await expectPlayed(page);

  // The payoff names only what the tour really changed, with the real numbers.
  await goTo(page, 7);
  await expect(page).toHaveURL(/#\/dashboard$/);
  const changes = [
    scene('result', 'changed', { name: tourItem.name }),
    `Total items: ${items.length} → ${items.length + 1}.`,
    `Items by category, Photography: ${photography} → ${photography + 1}.`,
    `Condition breakdown, Good: ${good} → ${good + 1}.`,
    `Items by location, ${camerasLocation}: ${atCamerasLocation} → ${atCamerasLocation + 1}.`,
    scene('result', 'explore')
  ];
  for (const text of changes) await expect(card(page)).toContainText(text, PLAY);
  await expect(card(page).getByRole('list', { name: /of 6$/ })).toBeVisible();
  await expect(totalItems(page)).toContainText(String(items.length + 1));
  await expectPlayed(page);
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

test('Replay, Back, and Next replay chapters without creating anything twice', async ({ page }) => {
  test.setTimeout(240_000);
  await open(page);
  await startTour(page);
  await goTo(page, 3);
  await expect(page).toHaveURL(/#\/items\/\d+$/, PLAY);
  await expectPlayed(page);
  const details = page.url();

  // Replay plays only the current chapter again: on the saved item's edit form, saved once more.
  await replayButton(page).click();
  await expectChapter(page, 3);
  await expect(page).toHaveURL(/#\/items\/\d+\/edit$/);
  await expect(card(page)).toContainText(scene('addItem', 'name'));
  await expectScenes(page, 'addItem', ['photo', 'save']);
  await expect(page).toHaveURL(details, PLAY);
  await expectPlayed(page);
  // The photo is not uploaded a second time.
  await expect(page.getByRole('img', { name: new RegExp(tourItem.photo.replace('.', '\\.')) })).toHaveCount(1);

  await goTo(page, 4);
  await expectPlayed(page);
  await expect(visibleLinks(page, tourItem.name)).toHaveCount(1);
  await backButton(page).click();
  await expectChapter(page, 3);
  await expect(page).toHaveURL(/#\/items\/\d+\/edit$/);
  await expectPlayed(page);
  await goTo(page, 4);
  await expectPlayed(page);
  await expect(visibleLinks(page, tourItem.name)).toHaveCount(1);

  // The Checklists chapter continues its run instead of starting a second one.
  await goTo(page, 6);
  await expectPlayed(page);
  const run = page.url();
  await replayButton(page).click();
  await expect(card(page)).toContainText(scene('checklists', 'list'));
  await expectPlayed(page);
  expect(page.url()).toBe(run);
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

test('Pause holds the chapter before its next action and leaves the page usable', async ({ page }) => {
  test.setTimeout(120_000);
  await open(page);
  await startTour(page);
  await goTo(page, 3);
  await expect(page.getByLabel('Name *')).toHaveValue(tourItem.name, PLAY);
  await card(page).getByRole('button', { name: 'Pause' }).click();
  await expect(card(page)).toContainText('Paused. Press Resume to continue.');
  await expect(lock(page)).toHaveCount(0);
  // The page is not locked: the visitor can type while the presentation waits.
  await page.getByLabel('Description').fill('Typed while paused');
  await expect(card(page).getByRole('list', { name: /^Scene [12] of 8$/ })).toBeVisible();
  await expect(page.getByLabel('Serial Number')).toHaveValue('');
  await card(page).getByRole('button', { name: 'Resume' }).click();
  await expect(card(page).getByRole('button', { name: 'Pause' })).toBeVisible();
  await expect(page.getByLabel('Serial Number')).toHaveValue(tourItem.serialNumber, PLAY);
  await expect(page).toHaveURL(/#\/items\/\d+$/, PLAY);
  await expectPlayed(page);
  await expect(page.getByText('Typed while paused')).toBeVisible();
});

test('closing the tour stops its playback, and Escape and Reset demo still work', async ({ page }) => {
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
  await nextButton(page).click();
  const alert = card(page).getByRole('alert');
  await expect(alert).toContainText('This chapter could not be shown.', { timeout: 30_000 });
  expect(warnings.some(text => text.includes('chapter "categories", scene "fields"'))).toBe(true);
  await expect(lock(page)).toHaveCount(0);
  await expect(spotlight(page)).toHaveCount(0);
  await expect(nextButton(page)).toBeEnabled();
  // The page itself stays usable.
  await expect(page.getByRole('heading', { name: 'Categories & Fields', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: /^Storage/ }).click();
  await expect(page.locator('[data-tour="hidden"]')).toContainText('Fields for Storage');

  await restore('category-fields');
  await replayButton(page).click();
  await expect(alert).toHaveCount(0);
  await expectScenes(page, 'categories', ['fields']);
  await expectPlayed(page);

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
  await card(page).getByRole('button', { name: 'Pause' }).click();
  await expect(card(page).getByRole('button', { name: 'Resume' })).toBeVisible();
});

test('the tour speaks Ukrainian when the interface does', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('inventory-atlas.locale', 'uk'));
  await open(page);
  await page.getByRole('button', { name: 'Екскурсія' }).click();
  await expect(page.getByRole('dialog', { name: 'Панель' })).toContainText('Розділ 1 з 8');
  await expect(card(page).or(page.getByRole('dialog', { name: 'Панель' }))).toContainText('Панель показує весь інвентар одразу.');
  await page.getByRole('button', { name: 'Далі' }).click();
  await expect(page.getByRole('dialog', { name: 'Категорії та поля' })).toContainText('Категорія визначає, чим є предмет.');
  await page.getByRole('button', { name: 'Пауза' }).click();
  await expect(page.getByRole('button', { name: 'Продовжити' })).toBeVisible();
  await page.getByRole('button', { name: 'Закрити екскурсію' }).click();
  await expect(page.getByRole('button', { name: 'Екскурсія' })).toBeVisible();
});

test.describe('on the Ukrainian demo', () => {
  const ukrainian = createDemoFixture('uk');
  const ukCopy = uk.tour.chapters;
  const ukScene = (chapter, id, params = {}) => fill(ukCopy[chapter].scenes[id], { ...copyParams(ukrainian), ...params });
  const ukCard = page => page.getByRole('dialog', { name: /./ }).filter({ hasText: 'Екскурсія' });
  const ukCategory = byKey(ukrainian.categories, ukrainian.tourItem.category);
  const ukContainer = byKey(ukrainian.items, ukrainian.tourItem.container);
  const ukPlayed = async page => {
    await expect(ukCard(page).getByRole('button', { name: 'Пауза' })).toHaveCount(0, PLAY);
    await expect(ukCard(page).getByRole('alert')).toHaveCount(0);
  };
  const ukGoTo = async (page, index) => {
    const current = Number((await ukCard(page).textContent()).match(/Розділ (\d+) з/)[1]) - 1;
    for (let chapter = current + 1; chapter <= index; chapter++) {
      await ukCard(page).getByRole('button', { name: 'Далі' }).click();
      await expect(ukCard(page)).toContainText(`Розділ ${chapter + 1} з ${chapters.length}`);
    }
  };

  test('the tour plays on the Ukrainian inventory, adds a Ukrainian item once, and reports the real changes', async ({ page }) => {
    test.setTimeout(300_000);
    await open(page, '?lang=uk#/dashboard');
    await page.getByRole('button', { name: 'Екскурсія' }).click();
    await expect(page.getByRole('dialog', { name: ukCopy.dashboard.title })).toContainText('Розділ 1 з 8');

    await ukGoTo(page, 1);
    await expect(ukCard(page)).toContainText(ukScene('categories', 'fields'), PLAY);
    for (const field of ukCategory.fields) await expect(page.locator('[data-tour="category-fields"]')).toContainText(field.name);
    await ukPlayed(page);

    await ukGoTo(page, 2);
    await expect(ukCard(page)).toContainText(ukScene('hierarchy', 'location'), PLAY);
    await expect(page.locator('[data-tour="hierarchy-tree"]').getByRole('link', { name: 'Nikon F65', exact: true })).toBeVisible();
    await ukGoTo(page, 3);

    // Add an Item fills the form with the Ukrainian fixture values, found by key, and saves once.
    await expect(page).toHaveURL(/#\/items\/new$/);
    await expect(page.getByLabel('Назва *')).toHaveValue(ukrainian.tourItem.name, PLAY);
    await expect(ukCard(page)).toContainText(ukScene('addItem', 'placement'), PLAY);
    await expect(page.getByLabel(ukCategory.fields[0].name)).toHaveValue(ukrainian.tourItem.fields.mount, PLAY);
    await expect(page.getByLabel(ukCategory.fields[1].name)).toHaveValue(ukrainian.tourItem.fields.format, PLAY);
    await expect(page).toHaveURL(/#\/items\/\d+$/, PLAY);
    await expect(page.getByRole('heading', { name: ukrainian.tourItem.name })).toBeVisible();
    await ukPlayed(page);
    const details = page.url();

    // Replay edits the same item instead of adding a second one.
    await ukCard(page).getByRole('button', { name: 'Повторити розділ' }).click();
    await expect(page).toHaveURL(/#\/items\/\d+\/edit$/);
    await expect(page).toHaveURL(details, PLAY);
    await ukPlayed(page);

    await ukGoTo(page, 4);
    await expect(ukCard(page)).toContainText(ukScene('items', 'filter'), PLAY);
    await expect(page.getByLabel('Категорія', { exact: true }).locator('option:checked')).toHaveText(ukCategory.name);
    await expect(ukCard(page)).toContainText(ukScene('items', 'result', { name: ukrainian.tourItem.name }), PLAY);
    await expect(visibleLinks(page, ukrainian.tourItem.name)).toHaveCount(1);
    await ukPlayed(page);

    await ukGoTo(page, 7);
    await expect(ukCard(page)).toContainText(ukScene('result', 'changed', { name: ukrainian.tourItem.name }), PLAY);
    await expect(ukCard(page)).toContainText(`Предмети за категоріями, ${ukCategory.name}: ${photography} → ${photography + 1}.`, PLAY);
    await expect(ukCard(page)).toContainText(`Предмети за місцем, ${ukContainer.location}: ${atCamerasLocation} → ${atCamerasLocation + 1}.`, PLAY);
    await ukPlayed(page);
    await expect(ukCard(page)).not.toContainText('{');
  });

  test('a language change closes the tour and seeds the demo again, and the tour then starts in the new language', async ({ page }) => {
    test.setTimeout(180_000);
    await open(page);
    await startTour(page);
    await goTo(page, 3);
    await expect(page.getByLabel('Name *')).toHaveValue(tourItem.name, PLAY);
    await card(page).getByRole('button', { name: 'Pause' }).click();
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
    await expect(page.getByRole('dialog', { name: ukCopy.dashboard.title })).toContainText('Розділ 1 з 8');
    await ukGoTo(page, 1);
    await expect(ukCard(page)).toContainText(ukScene('categories', 'select'), PLAY);
    await ukPlayed(page);
  });
});


test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('the spotlight does not move, values appear at once, and every scene is still shown', async ({ page }) => {
    test.setTimeout(120_000);
    await open(page);
    await startTour(page);
    expect(await spotlight(page).evaluate(element => getComputedStyle(element).transitionDuration)).toBe('0s');
    await goTo(page, 3);
    await expectScenes(page, 'addItem', ['name', 'category', 'condition', 'serial', 'placement', 'fields', 'photo']);
    await expect(card(page)).toContainText(scene('addItem', 'save'), PLAY);
    await expect(page).toHaveURL(/#\/items\/\d+$/, PLAY);
    await expectPlayed(page);
    await goTo(page, 4);
    await expectPlayed(page);
    await expect(visibleLinks(page, tourItem.name)).toHaveCount(1);
  });
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the card fits the screen and every chapter still plays', async ({ page }) => {
    test.setTimeout(300_000);
    await open(page, '#/items');
    await startTour(page);
    const box = await card(page).boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    expect(box.height).toBeLessThanOrEqual(844 / 2 + 1);
    const pause = await card(page).getByRole('button', { name: 'Pause' }).boundingBox();
    expect(pause.height).toBeGreaterThanOrEqual(36);
    for (let index = 0; index < chapters.length; index++) {
      if (index) await goTo(page, index);
      await expectPlayed(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    }
    // Phones sort through the Sort select instead of the table header.
    await expect(totalItems(page)).toContainText(String(items.length + 1));
    await card(page).getByRole('button', { name: 'Explore on your own' }).click();
    await page.getByRole('button', { name: 'Open navigation menu' }).click();
    await expect(page.getByRole('dialog', { name: 'Main navigation' })).toBeVisible();
  });
});

test('the self-hosted application never shows the public tour', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Guided tour' })).toHaveCount(0);
  await expect(page.getByRole('complementary', { name: 'Demo mode' })).toHaveCount(0);
});
