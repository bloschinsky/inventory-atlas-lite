# Guided tour of the public demo

## Summary

The [public demo](public-demo.md) offers an optional guided presentation: a small presenter in the
lower corner plays eight chapters about Inventory Atlas Lite on the real pages. Each chapter is a
short series of automated scenes that move the spotlight, change the presenter copy, and operate the
real interface; the visitor moves between chapters with **Next** and **Back** instead of pressing a
button for every small step. It runs on the canonical demo fixture and the demo's in-browser data
layer; there is no separate tour UI or tour-only data. The self-hosted application never shows or
bundles it.

## User-visible behaviour

- The demo opens as before, free to explore. A **Guided tour** button floats in the lower-right
  corner of every page; the tour starts only when it is pressed and never blocks the demo.
- The presenter card shows *Chapter n of 8* with a progress bar, the chapter title, the current
  scene's explanation, small scene dots (announced as *Scene n of m*), and a status line
  (*Showing it in the app…* while it plays, *Paused…* while paused). Its footer holds **Back**,
  **Pause** / **Resume**, **Replay chapter** (an icon button), and **Next**; the close button
  (**Close tour**, also Escape) sits in the header.
- **Inverse theme.** The card uses the opposite color mode of the application: a dark card on the
  light theme and a light card on the dark theme. Only the card is inverted; the page and the
  spotlight keep the application's mode.
- The spotlight is a ring around the scene's subject with a dimmed page around it. It lets clicks
  through. While a chapter plays (and is not paused), a transparent lock covers the page so the
  visitor's clicks cannot fight the automation; the card always stays above both.
- **Pause** stops the chapter before its next action and removes the lock, so the page is usable;
  **Resume** continues from there. When the chapter has played all its scenes, Pause disappears and
  Replay chapter becomes the highlighted control.
- **Replay chapter** plays the current chapter again from its first scene on a freshly opened page;
  it never restarts the whole tour or duplicates data. **Next** and **Back** stop an unfinished
  chapter at once and play the other chapter from its first scene.
- The eight chapters:
  1. **The Dashboard** — the summary cards, Items by category, Condition breakdown, Field coverage,
     and Items by location, one scene each, scrolling between them.
  2. **Categories & Fields** — what Categories are for, then selecting *Photography* and its Fields
     (Mount, Format, Last tested), and the difference between a Category and a Location.
  3. **Hierarchy** — the Group by and View switches; Group by Location with *Home / Office → Camera
     Bag* opened; Group by Category; the Tree View with *Photography* opened; and the Graph View,
     which stays on screen longer.
  4. **Add an Item** — the real Add item form, narrated scene by scene: name, Category, Condition
     (New stays off), serial number, Stored inside *Camera Bag*, the Photography Fields, the
     generated `nikon-f65.webp` photo, and Save. The chapter saves *Nikon F65 (spare body)* itself and
     ends on its details page.
  5. **Find Items** — the Items list, the Photography filter, sorting by Condition (the table header
     on wide screens, the Sort select on phones), a visibly typed search for *Nikon*, and the tour
     item highlighted in the results.
  6. **Templates** — the template list, the *35mm film roll* template opened in its editor, its
     predefined values and Fields, and how Use starts a new Item from it. Nothing is saved.
  7. **Checklists** — the checklist cards, *Weekend photo walk* and its expected items, a run started
     from it with *Nikon F65* marked **Packed** through the real state button, and what checklists
     are for (packing, moving, verifying equipment).
  8. **Your inventory changed** — the Dashboard again, but only the changes the tour really made:
     what was added, then *Total items*, *Items by category*, *Condition breakdown*, and *Items by
     location* as `before → after` values from the real demo state. If the item was never saved
     (the visitor skipped Add an Item), the chapter says so instead. The card ends with **Explore on
     your own**, **Reset demo**, **Get Inventory Atlas Lite** (the README's Official releases
     section), and **View on GitHub**.
- Pressing **Guided tour** again restarts from the canonical fixture: anything the visitor or an
  earlier tour changed is gone, so every tour shows the same data. The strip's **Reset demo** still
  reloads the demo from the fixture at any time, during or after a tour.
- If a page, target, or action does not work out within a few seconds, the chapter stops, the card
  says *This chapter could not be shown* in an alert, the spotlight and lock are removed, and the
  page stays usable. **Replay chapter** retries it and **Next** skips it. The console gets
  `[demo tour] chapter "<id>", scene "<id>" failed: …`.
- English and Ukrainian, following the demo's language: the presenter copy and the demo inventory it
  works on are in the same language, so the tour selects *Фототехніка*, opens *Сумка для камери*,
  and adds *Nikon F65 (запасний корпус)* in Ukrainian. Changing the language while the tour is open
  closes it — the demo is seeded again in the new language (see
  [Languages](public-demo.md#languages)), so the tour's baseline no longer applies — and **Guided
  tour** then starts it afresh in the new language. Settings, Cloud Backup, and Data Backup are
  deliberately not part of the tour: the static demo cannot show their real behaviour.

### Timing and reduced motion

All presentation timing lives in `TIMING` in `client/src/demo/tourActions.js`:

| Key | Default | Used for |
| --- | --- | --- |
| `beat` | 600 ms | after a click, a choice, a focus, or a scroll |
| `transition` | 900 ms | after the spotlight moved, before the scene's action |
| `view` | 1300 ms | how long a finished scene stays on screen |
| `longView` | 2600 ms | key moments: Group by Category and the Graph View |
| `typeDelay` / `typeChunk` | 70 ms / 2 characters | the typing cadence |

A full presentation takes about two minutes. With *prefers-reduced-motion*, `beat` and `transition`
are skipped, values appear at once instead of being typed, scrolling is instant, and the spotlight
and scene dots do not animate; the `view` and `longView` reading times stay, so every scene and its
result are still shown long enough to read.

### Phones

On phones the card spans the width above the bottom edge, takes at most half the screen, and scrolls
inside when needed; its buttons keep the regular 36 px height. Spotlight targets are scrolled to the
top of the screen (form fields to its middle), so the card below does not cover them.

## Implementation overview

### Files

- `client/src/demo/tourChapters.js` — the ordered chapter and scene definitions and their actions.
- `client/src/demo/tour.js` — the chapter engine and its shared state.
- `client/src/demo/tourActions.js` — `TIMING`, target resolution, and the DOM actions scenes use
  (type, choose, click, attach a file, wait for a hook or text), each bound to the running chapter's
  `AbortSignal` and pause gate.
- `client/src/components/DemoTour.vue` — the launcher, the card, the spotlight, and the lock.
- `client/src/demo/fixture.js` — `tourItem`, the item the tour adds (its category and container are
  keys), and the template (`film-roll`) and checklist (`weekend-photo-walk`) the Templates and
  Checklists chapters open.

### Stable semantic keys

The tour never identifies an entity by English text. `tourChapters.js` names fixture entities by
semantic key (`photography`, `camera-bag`, `nikon-f65`, `cordless-drill`, `film-rolls`,
`film-roll`, `weekend-photo-walk`, the `mount` and `format` fields); `tour.data.fixture` —
`createDemoFixture(locale)` for the language the tour started in — turns a key into the name the page
shows, at the moment a scene needs it. Seeded items are found by their fixed UUID
(`demoItemUuid(key)`) and then by their row hook `item-row-<id>`, and the tour item by its unique
serial number. The `data-tour` hooks stay language-neutral. Scene copy names fixture entities through
placeholders (`{category}`, `{fields}`, `{container}`, `{location}`, `{camera}`, `{template}`,
`{templateField}`, `{checklist}`, `{search}`) that `copyParams()` fills from the same fixture, so
one set of chapters, with no per-language branch, plays on the inventory of every language.
- `client/src/api.js` — `resetDemoData()` (a fresh seeded database) and `reloadDemoPage()`, which
  both advance `dataRevision`; `App.vue` keys the routed page on it, so the page mounts again.
- `client/src/App.vue` — mounts `DemoTour` only when `__DEMO__` is set, through a dynamic import, so
  the normal build contains no tour code or tour asset.

### Chapters and scenes

```js
{
  id: 'hierarchy',                 // stable; title under tour.chapters.hierarchy.title
  route: data => '/hierarchy',     // the page the chapter opens; may be async and use the tour data
  prepare: async context => {},    // optional, after the page opened and before the first scene
  scenes: [
    {
      id: 'graph',                 // stable; copy under tour.chapters.hierarchy.scenes.graph
      target: 'hierarchy-view',    // spotlight at the scene's start: a data-tour hook or '#<control id>'
      action: async context => {}, // optional actions on the real interface
      hold: 'longView',            // the viewing time after the action (a TIMING key, default 'view')
      skip: data => false,         // optional: leave the scene out of this run
      params: (data, t) => ({})    // optional values for the scene's copy
    }
  ]
}
```

For each chapter run the engine aborts the previous run, opens the route (pushing it, and mounting
the page again through `reloadDemoPage()` when it is the same page), runs `prepare`, and then plays
every scene that is not skipped: it waits for the target (8 seconds at most), moves the spotlight
there, waits `transition`, runs the action, and waits the scene's `hold`. `context` holds the actions
of `tourActions.js` (`waitForHook`, `waitForText`, `waitForLabel`, `waitFor`, `type`, `choose`,
`click`, `attachFile`, `pause`), `spotlight(target)` to move the spotlight in the middle of an
action, `data` (the tour's own state), and the `router`. Any throw stops the chapter, logs the chapter
and scene ids, and removes the spotlight and the lock.

A `#<id>` target highlights a labelled form control together with its label, so the Add item scenes
point at single fields without extra hooks.

**To add a chapter:** add an entry to `tourChapters` at its place, give it and its scenes stable ids,
add `tour.chapters.<id>.title` and one `scenes.<sceneId>` message per scene to both `en.json` and
`uk.json`, add any `data-tour` hook it needs, and update the chapter list in `test/e2e/tour.spec.js`
and the chapter count in `test/demo.test.js`. The card counts chapters and scenes itself.

**To add or reorder scenes:** edit the chapter's `scenes` array and its copy in both locales. A scene
must work again on a replay, so an action checks the state it finds before acting.

### Pause, abort, and navigation safety

Every chapter run owns one `AbortController`. Next, Back, Replay, Close, and a restart abort the
current run before anything else, and every wait (`pause`, `waitFor`, the timers inside them) rejects
on that signal, so a delayed action of an old chapter can never touch the newly opened page. Pause
sets `tour.paused`; the next `pause()` of the run then waits at a gate until Resume or an abort. The
gate is never inside the typing cadence, so a word is never left half typed. The lock is only shown
while a chapter plays and is not paused, and a failure clears it.

### Deterministic replay and idempotency

Starting the tour calls `resetDemoData()`, clears the Items selection, forgets the tour data, and
stores the Dashboard as `data.baseline`, so each tour begins on the same fixture with the same
numeric ids (the tour item is always item 23).

- **Add an Item:** `route()` looks the tour item up by its unique serial number. If it exists, the
  chapter opens its edit form, types the same values again, skips the Stored inside search when the
  container is already set, skips the photo when it is already shown, and saves the edit. Back, Next, and
  Replay therefore never create a second item or upload a second photo.
- **Find Items:** `route()` resets the Items sort to Name in the stored table view, so the Condition
  sort is a visible change on every replay; the page mounts again with empty filters.
- **Hierarchy:** the route has no `group` or `view` query and the page mounts again, so every replay
  starts on Location and Tree with closed branches.
- **Templates:** nothing is saved; the editor is left without saving.
- **Checklists:** the chapter continues an open run of the checklist (**Continue run**) instead of
  starting another one; when Nikon F65 is already Packed, it sets it back to Pending first so the
  check is visible again.
- **Your inventory changed:** `prepare` loads the Dashboard again and compares it with the baseline.
  A scene is skipped when its value did not change, so only real changes are presented.

There is no undo: Back only plays the earlier chapter again.

### Stable tour hooks

Highlights and the controls without an id are found through `data-tour` attributes, never through
layout classes or DOM positions:

| Page | Hooks |
| --- | --- |
| Dashboard | `dashboard-summary`, `dashboard-categories`, `dashboard-condition`, `dashboard-fields`, `dashboard-locations` |
| Categories & Fields | `category-list`, `category-fields` |
| Hierarchy | `hierarchy-controls`, `hierarchy-group`, `hierarchy-view`, `hierarchy-tree`, `hierarchy-graph` |
| Add item | `item-form`, `item-parent`, `item-parent-search`, `item-parent-results`, `item-custom-fields` (also in the template editor), `item-photos`, `item-save` |
| Items | `item-filters`, `item-results`, `item-sort-<column>` (sortable headers), `item-row-<id>` (the table row and the phone card of an item) |
| Templates | `template-list`, `template-form` |
| Checklists | `checklist-list`, `checklist-items`, `checklist-start`, `checklist-continue`, `checklist-progress`, `checklist-run-item` |

When the same hook exists twice (the Items table and its phone cards), the shown element is used.
Form controls that already have ids (`item-name`, `items-search`, `hierarchy-group-category`, …) or
labels (the custom fields) are reached through those. The attributes have no styles or behaviour of
their own. Add a hook only when a scene needs it.

### Inverse-theme presenter

The card carries `data-bs-theme` with the opposite of `theme` from `client/src/theme.js`. Tabler
scopes its color tokens to that attribute, so the card's background, text, secondary text, borders,
progress bar, avatar, buttons, and alert all come from the inverse token set without hardcoded
colors. `client/src/style.css` only sets the card's own color, background, and border from those
tokens and styles the scene dots.

### Presenter copy rules

The English presenter copy follows an ASD-STE100-inspired controlled English, at roughly 70–80%
alignment rather than formal compliance:

- one or two short sentences per scene, one idea per sentence, active voice, a clear subject;
- direct verbs (*open*, *select*, *add*, *find*, *sort*, *show*, *save*, *check*) and imperatives for
  the actions the tour performs (*Select the Photography Category.*);
- the product's terms, always the same: Item, Category, Field, Location, Hierarchy, Tree View, Graph
  View, Template, Checklist, Dashboard, Condition, New; UI labels exactly as the interface shows them
  (*Items by category*, *Stored inside*, *Group by*);
- no idioms, filler, or marketing words, and no sentence that starts with a vague *It*, *This*,
  *That*, or *They*;
- prefer the pattern *what this is* followed by *what it does or why it matters*.

Review checklist for new or changed copy: sentence length; ambiguous pronouns; terminology drift;
unneeded synonyms; passive voice; filler words; multi-clause sentences that can be split; scene text
that grew without adding value. `test/demo.test.js` enforces the measurable part: at most two
sentences and 160 characters per scene in both languages, at most 22 words per English sentence, no
banned synonyms or filler words, no vague opening pronoun, and every canonical term in use.

Ukrainian copy keeps the same qualities — short sentences, one idea at a time, direct verbs, stable
terms (предмет, категорія, поле, місце, ієрархія, шаблон, чек-лист, панель, стан), and the same
information density — without a literal translation of the English. Fixture names reach the copy
only through placeholders, quoted with «» in Ukrainian, so the copy reads the same whatever
inventory language fills them; `test/demo.test.js` fails when a scene names a fixture entity
directly.

### Demo assets

The tour adds no assets. `tourItem.photo` names `nikon-f65.webp`, one of the generated demo photos in
`client/src/demo/photos/` (see [Generated demo photos](public-demo.md#generated-demo-photos)), which
`tourChapters.js` imports as a URL and uploads as a `File` through the form's file input.

### Why only the public demo

The tour resets the inventory, creates an item, and starts a checklist run, which is only acceptable
in a throwaway demo database. Self-hosted installations keep their behaviour; an onboarding feature
for them would need its own design.

## Running and testing locally

```bash
npm run demo:dev                               # the demo with hot reload, http://localhost:5173/#/dashboard
node test/e2e/run.js tour.spec.js demo.spec.js # the demo browser tests against the built demo
```

## Verification

- `test/e2e/tour.spec.js` (12 tests) runs the built demo under the Pages-style base path: all eight
  chapters with their scene copy, spotlight targets, and results (every Dashboard area; the
  Categories overview before Photography's Fields; Location and Category grouping, Tree View, and
  Graph View; the narrated form saved once with the generated photo; filter, Condition sort, Nikon
  search, and the highlighted item; the template's values; a real checklist check; the payoff with
  the real before/after values; the final actions); Replay, Back, and Next without a duplicate item,
  photo, or checklist run, and Reset demo restoring the checklist; Pause without a lock and Resume;
  Close and Escape stopping playback; a failing scene naming its chapter and scene with Replay and
  Next; the inverse card in both color modes; Ukrainian; reduced motion; the whole tour on a phone;
  and no tour in the self-hosted application. On the Ukrainian demo (`?lang=uk`) it plays the
  Categories, Hierarchy, Add an Item (with Replay editing the same item), Find Items, and final
  chapters with the Ukrainian scene copy and fixture values, and a language change during a paused
  tour closes it, seeds the Ukrainian inventory, and lets the tour start again in Ukrainian.
- `test/demo.test.js` checks, in every language, that the tour item uses a demo photo, is not
  seeded, saves through the real services into the Camera Bag, and is found again by its serial
  number; that the fixture's template and checklist fit their chapters; and the copy rules above,
  including no fixture name in the copy.
- `test/i18n.test.js` keeps the English and Ukrainian tour strings in parity.

## Notes and limitations

- Visitors may leave the chapter's page while it is paused or finished; Next or Replay then opens
  the chapter's page again. Changes the visitor makes to the Add item form while it is paused are
  saved with the tour item.
- Next in the middle of Add an Item leaves the form unsaved; the later chapters then work with the
  seeded Nikon F65, and the final chapter says that no item was added.
