# Guided tour of the public demo

## Summary

The [public demo](public-demo.md) offers an optional guided tour: a small presenter in the lower
corner walks a visitor through the core workflow of Inventory Atlas Lite in six short steps, opening
the real pages and performing deterministic demo actions when the visitor presses **Next**. It runs on
the canonical demo fixture and the demo's in-browser data layer; there is no separate tour UI or
tour-only data. The self-hosted application never shows or bundles it.

## User-visible behaviour

- The demo opens as before, free to explore. A **Guided tour** button floats in the lower-right
  corner of every page; the tour starts only when it is pressed and never blocks the demo.
- The tour card shows *Step n of 6*, a progress bar, the step's title and explanation, **Back**,
  **Next**, and a close button (**Close tour**, also Escape). While a step is acting, the card shows
  *Showing it in the app…* and Next waits.
- The step's subject is highlighted by a spotlight: a ring around the element and a dimmed page.
  It lets clicks through, so the visitor can keep using the page; only while a step performs its
  actions does a transparent lock cover the page. The card always stays above both.
- The steps:
  1. **Welcome** — the Dashboard summary; explains locations, containers, categories, and items, and
     that placement and item details are separate.
  2. **Categories with their own fields** — opens Categories & Fields and selects *Photography*,
     showing Mount, Format, and Last tested.
  3. **Where everything lives** — opens Hierarchy, searches for *Camera Bag*, and opens it, showing
     *Home / Office → Camera Bag* and its contents, which inherit the location.
  4. **Add an item** — opens the real Add item form and fills in *Nikon F65 (spare body)* in a visible
     sequence: name, Photography, Condition Good, a serial number, Stored inside *Camera Bag* (searched
     and picked like a visitor would), Mount and Format, and the demo's generated `nikon-f65.webp`
     photo. **Next** saves it with the form's own Save.
  5. **Find it again** — opens Items, filters by Photography, and searches for *Nikon*; the new item
     is listed next to the seeded Nikon F65.
  6. **The whole inventory at a glance** — the Dashboard, which now counts 23 items. The card offers
     **Explore on your own**, **Reset demo**, **Get Inventory Atlas Lite** (the README's Official
     releases section), and **View on GitHub**.
- **Back** returns to the previous step. Going back to Add item after the item was saved opens that
  item's edit form instead of a new one, so Next updates it and never creates a second item.
- Pressing **Guided tour** again restarts from the canonical fixture: anything the visitor or an
  earlier tour changed is gone, so every tour shows the same data. The strip's **Reset demo** still
  reloads the demo from the fixture at any time, during or after a tour.
- If a page, target, or action does not work out within a few seconds, the card says *This step could
  not be shown* with **Retry** and **Skip step**; the spotlight and lock are removed and the page stays
  usable. The reason is logged to the browser console as `[demo tour] step "<id>" failed: …`.
- English and Ukrainian, following the demo's language setting. With *prefers-reduced-motion*, values
  appear at once instead of being typed, there are no pauses between actions, scrolling is instant,
  and the spotlight does not animate. On phones the card spans the width above the bottom edge and
  takes at most half the screen.

## Implementation overview

### Files

- `client/src/demo/tourSteps.js` — the ordered step definitions and their actions.
- `client/src/demo/tour.js` — the step engine and its shared state.
- `client/src/demo/tourActions.js` — the DOM actions steps use (type, choose, click, attach a file,
  wait for a hook), each bound to the running step's `AbortSignal`.
- `client/src/components/DemoTour.vue` — the launcher, the card, the spotlight, and the lock.
- `client/src/demo/fixture.js` — `tourItem`, the item the tour adds.
- `client/src/demo/backend.js` — `reset()`, a fresh seeded database without a reload;
  `client/src/api.js` exposes it as `resetDemoData()` with the `dataRevision` counter that
  `App.vue` keys the page on, so the open page reloads its data.
- `client/src/App.vue` — mounts `DemoTour` only when `__DEMO__` is set, through a dynamic import, so
  the normal build contains no tour code or tour asset.

### Step definition

```js
{
  id: 'categories',            // stable; copy under tour.steps.categories.title / .text
  route: data => '/categories', // the page to open; may be async and use the tour data
  target: 'category-fields',   // the data-tour hook to highlight
  enter: async context => {},  // optional actions once the target is shown
  leave: async context => {},  // optional actions Next performs first (Add item saves)
  keepScroll: false            // keep the scroll position enter left instead of returning to the target
}
```

`context` holds the actions of `tourActions.js` (`waitForHook`, `waitForText`, `waitForLabel`,
`waitFor`, `type`, `choose`, `click`, `attachFile`, `pause`), `data` (`itemId` of the saved tour
item), and the `router`. For each step the engine aborts the previous run, opens the route, waits for
the target hook (8 seconds at most), highlights it, runs `enter`, and scrolls back to the target. Any
throw marks the step failed, which removes the spotlight and the lock.

To add or reorder a step, edit the `tourSteps` array, give the step a new `id`, add
`tour.steps.<id>.title` and `.text` to both `en.json` and `uk.json`, add any `data-tour` hook it
needs, and update the step list in `test/e2e/tour.spec.js`. The card counts the steps itself.

### Stable tour hooks

Highlights and the controls without an id are found through `data-tour` attributes, never through
layout classes: `dashboard-summary` (Dashboard KPI row), `category-list` and `category-fields`
(Categories & Fields), `hierarchy-tree` (the Tree view card), `item-form`, `item-parent-search`,
`item-parent-results`, `item-photos`, and `item-save` (the item form), and `item-results` (a wrapper
around the Items table and cards). Form controls that already have ids (`item-name`,
`items-search`, `hierarchy-search`, …) or labels (the custom fields) are reached through those. The
attributes have no styles or behaviour of their own. Add a hook only when a step needs it.

### Deterministic state and idempotency

Starting the tour calls `resetDemoData()`, clears the Items selection, and forgets the tour item, so
each tour begins on the same fixture with the same numeric ids (the tour item is always item 23).
Values reach the real form state through `input` and `change` events, the item is saved by the form's
own Save button, and its id is read from the details page the form opens. `route()` of Add item
returns that item's edit form while it still exists, which makes Back and Next idempotent. There is no
undo: Back only shows the earlier step again.

### Demo assets

The tour adds no assets. `tourItem.photo` names `nikon-f65.webp`, one of the generated demo photos in
`client/src/demo/photos/` (see [Generated demo photos](public-demo.md#generated-demo-photos)), which
`tourSteps.js` imports as a URL and uploads as a `File` through the form's file input.

### Why only the public demo

The tour resets the inventory and creates an item, which is only acceptable in a throwaway demo
database. Self-hosted installations keep their behaviour; an onboarding feature for them would need
its own design.

## Running and testing locally

```bash
npm run demo:dev                              # the demo with hot reload, http://localhost:5173/#/dashboard
node test/e2e/run.js tour.spec.js demo.spec.js # the demo browser tests against the built demo
```

## Verification

- `test/e2e/tour.spec.js` (9 tests) runs the built demo under the Pages-style base path: every step's
  route, highlighted hook, and result; the saved item's details and photo; Back and Next without a
  duplicate; a deterministic restart; Close, Escape, and Reset demo during and after a tour; Retry
  and Skip step on a missing target without a lock; Ukrainian copy; reduced motion; the phone layout;
  and no tour in the self-hosted application.
- `test/demo.test.js` checks that the tour item uses a demo photo, is not seeded, and saves through the
  real services into the Camera Bag.
- `test/i18n.test.js` keeps the English and Ukrainian tour strings in parity.

## Notes and limitations

- Visitors may leave the step's page while the card waits; Next then opens the next step's page. On
  Add item, Next needs the form to save, so it reports the step as failed and Retry opens and fills
  the form again. Changes the visitor makes to the filled form before Next are saved with it.
- The demo data stays English in Ukrainian, as user data is never translated.
