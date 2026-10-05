import { reactive } from 'vue';
import { resetDemoData } from '../api.js';
import { labelSelection } from '../labelSelection.js';
import { createTourActions, findHook, scrollToElement } from './tourActions.js';
import { tourSteps } from './tourSteps.js';

/*
  The step engine of the demo's guided tour. One shared state drives the assistant: `status` is
  `working` while a step opens its page and performs its actions (the page is locked meanwhile),
  `ready` once its target is shown, and `failed` when a page, target, or action did not work out,
  which offers Retry and Skip step, never leaves a lock behind, and logs the reason to the console.
  Each run gets its own AbortController, so Back, Next, Close, or a restart stops whatever the
  previous step still did.
*/
export const tour = reactive({
  active: false,
  index: 0,
  status: 'idle',
  // The data-tour hook of the shown step rather than an element, which its page may re-render any time.
  target: null,
  data: { itemId: null }
});

let controller = null;

function begin(router) {
  controller?.abort();
  controller = new AbortController();
  const { signal } = controller;
  tour.status = 'working';
  return { signal, context: { ...createTourActions(signal), data: tour.data, router } };
}

function fail(signal, step, error) {
  if (signal.aborted) return;
  console.warn(`[demo tour] step "${step.id}" failed:`, error);
  tour.target = null;
  tour.status = 'failed';
}

async function show(router, index) {
  const step = tourSteps[index];
  const { signal, context } = begin(router);
  tour.index = index;
  tour.target = null;
  try {
    const path = await step.route(tour.data);
    signal.throwIfAborted();
    if (router.currentRoute.value.fullPath !== path) await router.push(path);
    const target = await context.waitForHook(step.target);
    tour.target = step.target;
    scrollToElement(target, 'start');
    if (step.enter) {
      await step.enter(context);
      // The actions may have scrolled elsewhere; the step ends on its target unless it says otherwise.
      if (!step.keepScroll) scrollToElement(findHook(step.target) ?? target, 'start');
    }
    if (!signal.aborted) tour.status = 'ready';
  } catch (error) {
    fail(signal, step, error);
  }
}

export function createTourController(router) {
  // Start always begins from the canonical fixture, so every tour, and every restart, is the same.
  async function start() {
    const { signal } = begin(router);
    Object.assign(tour, { active: true, index: 0, target: null });
    tour.data.itemId = null;
    labelSelection.clear();
    try {
      await resetDemoData();
    } catch (error) {
      fail(signal, tourSteps[0], error);
      return;
    }
    if (!signal.aborted) await show(router, 0);
  }

  async function next() {
    if (tour.status === 'working' || tour.index >= tourSteps.length - 1) return;
    const step = tourSteps[tour.index];
    if (step.leave) {
      const { signal, context } = begin(router);
      try {
        await step.leave(context);
      } catch (error) {
        fail(signal, step, error);
        return;
      }
      if (signal.aborted) return;
    }
    await show(router, tour.index + 1);
  }

  const back = () => (tour.index > 0 ? show(router, tour.index - 1) : undefined);
  const retry = () => show(router, tour.index);
  const skipStep = () => (tour.index < tourSteps.length - 1 ? show(router, tour.index + 1) : close());

  function close() {
    controller?.abort();
    controller = null;
    Object.assign(tour, { active: false, status: 'idle', target: null });
  }

  return { start, next, back, retry, skipStep, close };
}
