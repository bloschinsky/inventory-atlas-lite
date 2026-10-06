import { nextTick, reactive } from 'vue';
import { api, reloadDemoPage, resetDemoData } from '../api.js';
import { i18n } from '../i18n/index.js';
import { labelSelection } from '../labelSelection.js';
import { createDemoFixture } from './fixture.js';
import { createTourActions, resolveTarget, scrollToElement, sleep, TIMING } from './tourActions.js';
import { tourChapters } from './tourChapters.js';

/*
  The chapter engine of the demo's guided tour. One shared state drives the presenter. A chapter
  opens its page on a fresh mount and shows its scenes one after another, manual-first: each scene
  moves the spotlight to its target and then waits for the visitor. Its contextual action button
  calls advance(), the one path that moves a scene on: the scene performs its action on the real
  interface, keeps the result on screen for its viewing time, and the next scene appears. Auto Play
  only calls the same advance() after a reading time.

  `status` is one of:
  - `opening` — the chapter opens its page, or the scene moves its spotlight (the page is locked);
  - `waiting` — the scene waits for its action button, or for Auto Play;
  - `acting` — the scene performs its action and shows the result (the page is locked);
  - `done` — the chapter is complete: Next opens the next chapter;
  - `failed` — a page, target, or action did not work out: the console names the chapter and
    scene, the spotlight and the lock go away, and Replay chapter or Next go on;
  - `idle` — the tour is closed.
  `paused` holds Auto Play: no scene advances on its own, and a running action stops at its next
  pause point. Each run gets its own AbortController, so Next, Back, Replay, Close, or a restart
  stops whatever the previous run still did, including its waiting scene and its Auto Play delay.
*/
export const tour = reactive({
  active: false,
  chapter: 0,
  // The ids of the scenes this run shows (a chapter may skip some), and the index of the shown one.
  scenes: [],
  scene: 0,
  status: 'idle',
  // Auto Play is off by default and lasts for the visit; Pause only applies while it is on.
  autoplay: false,
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
// The waiting scene: resolving it lets the run go on; it belongs to one run's signal.
let turn = null;
// The AbortController of the pending Auto Play delay.
let autoDelay = null;

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

function stopAutoDelay() {
  autoDelay?.abort();
  autoDelay = null;
}

function begin() {
  controller?.abort();
  wake = null;
  turn = null;
  stopAutoDelay();
  controller = new AbortController();
  return controller.signal;
}

/*
  The one way a scene moves on: from its action button, or from Auto Play. Only a waiting scene
  advances, so repeated clicks or a late delay never run an action twice.
*/
export function advance() {
  if (tour.status !== 'waiting' || !turn) return;
  const { resolve } = turn;
  turn = null;
  stopAutoDelay();
  tour.status = 'acting';
  resolve();
}

/*
  Auto Play gives the waiting scene its reading time, then advances it. The delay is bound to that
  one waiting scene: if anything else happened meanwhile, it does nothing.
*/
function scheduleAutoplay() {
  stopAutoDelay();
  if (!turn || !tour.autoplay || tour.paused) return;
  const waiting = turn;
  autoDelay = new AbortController();
  sleep(TIMING.read, autoDelay.signal).then(() => { if (turn === waiting) advance(); }, () => {});
}

// The scene waits here for its action button or Auto Play; an abort ends the wait.
function waitForTurn(signal) {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    turn = { resolve };
    tour.status = 'waiting';
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    scheduleAutoplay();
  });
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
  Object.assign(tour, { chapter: index, scenes: chapter.scenes.map(scene => scene.id), scene: 0, status: 'opening', paused: false, target: null, failure: null });
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
      Object.assign(tour, { scene: position, status: 'opening' });
      const target = typeof entry.target === 'function' ? entry.target(tour.data) : entry.target;
      if (target) await spotlight(target);
      else tour.target = null;
      await actions.pause('transition');
      // The last scene of a chapter has nothing to wait for unless it has an action of its own.
      if (!entry.action && position === scenes.length - 1) break;
      await waitForTurn(signal);
      if (entry.action) {
        await entry.action(context);
        await actions.pause(entry.hold ?? 'view');
      }
    }
    tour.status = 'done';
  } catch (error) {
    if (signal.aborted) return;
    turn = null;
    stopAutoDelay();
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
    Object.assign(tour, { active: true, chapter: 0, scenes: tourChapters[0].scenes.map(scene => scene.id), scene: 0, status: 'opening', paused: false, target: null, failure: null });
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
  // Next and Back leave an unfinished chapter at once; the chapter they open starts from its first scene.
  const next = () => (last() ? undefined : play(router, tour.chapter + 1));
  const back = () => (tour.chapter > 0 ? play(router, tour.chapter - 1) : undefined);
  const replay = () => (tour.data.baseline ? play(router, tour.chapter) : start());

  function resume() {
    tour.paused = false;
    wake?.();
    wake = null;
    scheduleAutoplay();
  }
  function pause() {
    if (!tour.autoplay) return;
    tour.paused = true;
    stopAutoDelay();
  }
  // Switching Auto Play off leaves the scene waiting for its action button again.
  function toggleAutoplay() {
    tour.autoplay = !tour.autoplay;
    if (tour.autoplay) scheduleAutoplay();
    else resume();
  }

  function close() {
    controller?.abort();
    controller = null;
    wake = null;
    turn = null;
    stopAutoDelay();
    Object.assign(tour, { active: false, status: 'idle', paused: false, target: null, failure: null });
  }

  return { start, next, back, replay, advance, toggleAutoplay, pause, resume, close };
}
