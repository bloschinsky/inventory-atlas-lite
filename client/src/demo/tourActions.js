/*
  The small set of DOM actions the guided tour drives the real interface with. They act like a visitor:
  values go into the real form controls through the same input and change events typing or choosing
  fires, so the page's own v-model state, validation, and save path take over from there.

  `createTourActions(signal)` binds every action to one step's AbortSignal: once the visitor moves on
  or closes the tour, the next wait or pause of that step stops it instead of touching the new page.
*/

export const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// A step that cannot find what it needs; the tour shows Retry and Skip step instead of waiting forever.
export class TourTargetError extends Error {
  constructor(target) {
    super(`The guided tour could not find "${target}".`);
    this.name = 'TourTargetError';
  }
}

export const findHook = name => document.querySelector(`[data-tour="${name}"]`);
export const isShown = element => Boolean(element?.isConnected && element.getClientRects().length);
// The first element under `root` matching `selector` whose own text is exactly `text`.
export const findByText = (root, selector, text) => [...(root?.querySelectorAll(selector) ?? [])]
  .find(element => element.textContent.trim() === text) ?? null;
const labeledControl = (root, label) => {
  const element = findByText(root, 'label', label);
  return element?.htmlFor ? document.getElementById(element.htmlFor) : null;
};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Brings an element into view below the mobile header, smoothly unless motion is reduced.
export function scrollToElement(element, block = 'center') {
  element.scrollIntoView({ block, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
}

export function createTourActions(signal) {
  const check = () => signal.throwIfAborted();

  // A short visible beat between automated actions; none when motion is reduced.
  async function pause(ms = 250) {
    check();
    if (!prefersReducedMotion()) await sleep(ms);
    check();
  }

  // Polls `test` until it returns something truthy; a throw from `test` fails the step at once.
  async function waitFor(test, description, timeout = 8000) {
    const end = Date.now() + timeout;
    for (;;) {
      check();
      const result = test();
      if (result) return result;
      if (Date.now() > end) throw new TourTargetError(description);
      await sleep(50);
    }
  }

  const waitForHook = (name, timeout) => waitFor(() => { const element = findHook(name); return isShown(element) && element; }, name, timeout);
  const waitForText = (root, selector, text) => waitFor(() => findByText(root, selector, text), text);
  const waitForLabel = (root, label) => waitFor(() => labeledControl(root, label), label);

  async function focusControl(element) {
    scrollToElement(element);
    element.focus({ preventScroll: true });
    await pause(200);
  }

  // Types text into an input, a few characters at a time so the visitor sees it arrive.
  async function type(element, text) {
    await focusControl(element);
    const chunk = prefersReducedMotion() ? text.length : 3;
    for (let length = chunk; ; length += chunk) {
      element.value = text.slice(0, length);
      element.dispatchEvent(new Event('input', { bubbles: true }));
      if (length >= text.length) break;
      await pause(30);
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
    await pause(200);
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
