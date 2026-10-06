import { nextTick, reactive } from 'vue';
import { api, reloadDemoPage, resetDemoData } from '../api.js';
import { i18n } from '../i18n/index.js';
import { labelSelection } from '../labelSelection.js';
import { createDemoFixture } from './fixture.js';
import { createTourActions, resolveTarget, scrollToElement } from './tourActions.js';
import { tourChapters } from './tourChapters.js';

/*
  The chapter engine of the demo's guided tour. One shared state drives the presenter. A chapter
  opens its page on a fresh mount and plays its scenes one after another: each scene moves the
  spotlight to its target, waits a transition, performs its action, and stays on screen for its
  viewing time. `status` is `playing` meanwhile (the page is locked unless the visitor paused), `done`
  once the last scene was shown, and `failed` when a page, target, or action did not work out, which
  names the chapter and scene in the console, removes the spotlight and the lock, and offers Retry
  chapter. Each run gets its own AbortController, so Next, Back, Replay, Close, or a restart stops
  whatever the previous run still did.
*/
export const tour = reactive({
  active: false,
  chapter: 0,
  // The ids of the scenes this run shows (a chapter may skip some), and the index of the shown one.
  scenes: [],
  scene: 0,
  status: 'idle',
  paused: false,
  // The spotlight target of the shown scene (see resolveTarget), never an element the page may replace.
  target: null,
  failure: null,
  /*
    `fixture` is the demo inventory in the language the tour started in, and `baseline` the Dashboard
    at that moment; chapters keep what they need between them here.
  */
  data: {}
});

let controller = null;
// Resolves the gate a paused run waits at.
let wake = null;

// A paused run waits here, before its next action, until Resume or an abort.
const gateFor = signal => async () => {
  while (tour.paused) {
    signal.throwIfAborted();
    await new Promise((resolve, reject) => {
      wake = resolve;
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    });
  }
};

function begin() {
  controller?.abort();
  wake = null;
  controller = new AbortController();
  return controller.signal;
}

// Opens a chapter's page on a fresh mount, so a replay starts from the same page state as the first run.
async function open(router, path) {
  const current = router.currentRoute.value;
  const record = route => route.matched.at(-1)?.path;
  const samePage = record(current) === record(router.resolve(path));
  if (current.fullPath !== path) await router.push(path);
  if (samePage) reloadDemoPage();
  await nextTick();
}

async function play(router, index) {
  const signal = begin();
  const chapter = tourChapters[index];
  Object.assign(tour, { chapter: index, scenes: chapter.scenes.map(scene => scene.id), scene: 0, status: 'playing', paused: false, target: null, failure: null });
  const actions = createTourActions(signal, gateFor(signal));
  // Moves the spotlight to a target once the page shows it.
  async function spotlight(target) {
    const [element] = await actions.waitFor(() => resolveTarget(target).length && resolveTarget(target), target);
    tour.target = target;
    scrollToElement(element, target.startsWith('#') ? 'center' : 'start');
  }
  const context = { ...actions, spotlight, data: tour.data, router };
  let scene = { id: 'open' };
  try {
    await open(router, await chapter.route(tour.data));
    signal.throwIfAborted();
    if (chapter.prepare) await chapter.prepare(context);
    const scenes = chapter.scenes.filter(entry => !entry.skip?.(tour.data));
    tour.scenes = scenes.map(entry => entry.id);
    for (const [position, entry] of scenes.entries()) {
      scene = entry;
      tour.scene = position;
      if (entry.target) await spotlight(entry.target);
      else tour.target = null;
      await actions.pause('transition');
      if (entry.action) await entry.action(context);
      await actions.pause(entry.hold ?? 'view');
    }
    tour.status = 'done';
  } catch (error) {
    if (signal.aborted) return;
    console.warn(`[demo tour] chapter "${chapter.id}", scene "${scene.id}" failed:`, error);
    Object.assign(tour, { status: 'failed', paused: false, target: null, failure: { chapter: chapter.id, scene: scene.id } });
  }
}

export function createTourController(router) {
  /*
    Start always begins from the canonical fixture in the active language, so every tour, and every
    restart, is the same. A language change closes the tour (DemoTour.vue), because it seeds the
    demo again in the new language.
  */
  async function start() {
    const signal = begin();
    Object.assign(tour, { active: true, chapter: 0, scenes: tourChapters[0].scenes.map(scene => scene.id), scene: 0, status: 'playing', paused: false, target: null, failure: null });
    tour.data = { fixture: createDemoFixture(i18n.global.locale.value) };
    labelSelection.clear();
    try {
      await resetDemoData();
      tour.data.baseline = await api('/api/dashboard');
    } catch (error) {
      if (signal.aborted) return;
      console.warn('[demo tour] the demo data could not be reset:', error);
      Object.assign(tour, { status: 'failed', failure: { chapter: tourChapters[0].id, scene: 'reset' } });
      return;
    }
    if (!signal.aborted) await play(router, 0);
  }

  const last = () => tour.chapter === tourChapters.length - 1;
  // Next and Back leave an unfinished chapter at once; the chapter they open plays from its first scene.
  const next = () => (last() ? undefined : play(router, tour.chapter + 1));
  const back = () => (tour.chapter > 0 ? play(router, tour.chapter - 1) : undefined);
  const replay = () => (tour.data.baseline ? play(router, tour.chapter) : start());

  function pause() {
    if (tour.status === 'playing') tour.paused = true;
  }
  function resume() {
    tour.paused = false;
    wake?.();
    wake = null;
  }

  function close() {
    controller?.abort();
    controller = null;
    wake = null;
    Object.assign(tour, { active: false, status: 'idle', paused: false, target: null, failure: null });
  }

  return { start, next, back, replay, pause, resume, close };
}
