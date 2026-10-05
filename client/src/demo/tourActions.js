/*
  The small set of DOM actions the guided tour drives the real interface with. They act like a visitor:
  values go into the real form controls through the same input and change events typing or choosing
  fires, so the page's own v-model state, validation, and save path take over from there.

  `createTourActions(signal, gate)` binds every action to one chapter run: once the visitor moves on,
  replays, or closes the tour, the next wait of that run stops it instead of touching the new page,
  and `gate()` holds a paused presentation before its next action.
*/

export const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/*
  The presentation timing, in milliseconds, in one place. Reduced motion drops the decorative beats
  and the typing cadence, but keeps the reading time of every scene (`view` and `longView`).
*/
export const TIMING = {
  // A minor beat: after a click, a choice, or a scroll.
  beat: 600,
  // An important transition: the spotlight moved, a page or a view changed.
  transition: 900,
  // How long a completed scene stays on screen before the next one.
  view: 1300,
  // Key moments that need a longer look, such as the Graph View.
  longView: 2600,
  // The typing cadence: `typeChunk` characters every `typeDelay`.
  typeDelay: 70,
  typeChunk: 2
};

// A scene that cannot find what it needs; the presenter offers Retry chapter instead of waiting forever.
export class TourTargetError extends Error {
  constructor(target) {
    super(`The guided tour could not find "${target}".`);
    this.name = 'TourTargetError';
  }
}

export const isShown = element => Boolean(element?.isConnected && element.getClientRects().length);
// The shown element of a hook: the Items table and the phone cards, for example, render the same hooks.
export const findHook = name => [...document.querySelectorAll(`[data-tour="${name}"]`)].find(isShown) ?? null;
// The first element under `root` matching `selector` whose own text is exactly `text`.
export const findByText = (root, selector, text) => [...(root?.querySelectorAll(selector) ?? [])]
  .find(element => element.textContent.trim() === text) ?? null;
const labeledControl = (root, label) => {
  const element = findByText(root, 'label', label);
  return element?.htmlFor ? document.getElementById(element.htmlFor) : null;
};

/*
  A spotlight target is a `data-tour` hook name, or `#<id>` for a labelled form control, which is
  highlighted together with its label. The presenter resolves it again on every frame, because the
  page may re-render the element at any time.
*/
export function resolveTarget(target) {
  if (!target) return [];
  if (!target.startsWith('#')) return [findHook(target)].filter(Boolean);
  const control = document.getElementById(target.slice(1));
  return [control, control && document.querySelector(`label[for="${control.id}"]`)].filter(isShown);
}

// Waits `ms`, or rejects at once when the run is aborted.
export function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const done = () => { signal?.removeEventListener('abort', stop); resolve(); };
    const stop = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(done, ms);
    signal?.addEventListener('abort', stop, { once: true });
  });
}

// Brings an element into view below the mobile header, smoothly unless motion is reduced.
export function scrollToElement(element, block = 'center') {
  element.scrollIntoView({ block, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
}

export function createTourActions(signal, gate = async () => {}) {
  const check = () => signal.throwIfAborted();
  const reduced = prefersReducedMotion();

  /*
    A presentation pause: `beat` and `transition` disappear with reduced motion, the reading times
    stay. A paused presentation stops here, before the next action.
  */
  async function pause(kind = 'beat') {
    check();
    const ms = typeof kind === 'number' ? kind : TIMING[kind];
    if (!reduced || kind === 'view' || kind === 'longView') await sleep(ms, signal);
    await gate();
    check();
  }

  // Polls `test` until it returns something truthy; a throw from `test` fails the scene at once.
  async function waitFor(test, description, timeout = 8000) {
    const end = Date.now() + timeout;
    for (;;) {
      check();
      const result = test();
      if (result) return result;
      if (Date.now() > end) throw new TourTargetError(description);
      await sleep(50, signal);
    }
  }

  const waitForHook = (name, timeout) => waitFor(() => findHook(name), name, timeout);
  const waitForText = (root, selector, text) => waitFor(() => findByText(root, selector, text), text);
  const waitForLabel = (root, label) => waitFor(() => labeledControl(root, label), label);

  async function focusControl(element) {
    scrollToElement(element);
    element.focus({ preventScroll: true });
    await pause();
  }

  // Types text into an input a few characters at a time, so the visitor sees it arrive.
  async function type(element, text) {
    await focusControl(element);
    if (element.value === text && !reduced) {
      // The same value again (a replay): clear it first, so the typing is still visible.
      element.value = '';
      element.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const chunk = reduced ? Math.max(text.length, 1) : TIMING.typeChunk;
    for (let length = chunk; ; length += chunk) {
      element.value = text.slice(0, length);
      element.dispatchEvent(new Event('input', { bubbles: true }));
      if (length >= text.length) break;
      // The cadence is not a pause point: a word is never left half typed.
      if (!reduced) await sleep(TIMING.typeDelay, signal);
    }
    await pause();
  }

  // Chooses the option of a <select> by its value, or by its visible text when `byText` is set.
  async function choose(select, wanted, { byText = false } = {}) {
    await focusControl(select);
    const option = [...select.options].find(entry => (byText ? entry.textContent.trim() : entry.value) === wanted);
    if (!option) throw new TourTargetError(wanted);
    select.value = option.value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await pause();
  }

  async function click(element) {
    scrollToElement(element);
    await pause();
    element.click();
    await pause();
  }

  // Hands a file to a file input the way choosing it in the file picker does.
  async function attachFile(input, file) {
    scrollToElement(input);
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await pause();
  }

  return { pause, waitFor, waitForHook, waitForText, waitForLabel, type, choose, click, attachFile };
}
