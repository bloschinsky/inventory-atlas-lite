# Guided tour of the public demo

## Summary

The [public demo](public-demo.md) offers an optional guided presentation: a small presenter in the
lower corner leads through eight chapters about Inventory Atlas Lite on the real pages. Each chapter
is a short series of scenes. The tour is manual-first: a scene moves the spotlight, explains one
thing, and waits; the visitor presses its contextual action button (*Group by Category*, *Search for
Nikon*, *Add a photo*), the real interface performs that action, and the next scene appears. When a
chapter is complete, **Next** opens the next one. An optional **Auto Play** mode presses the same
buttons after a reading time. The tour runs on the canonical demo fixture and the demo's in-browser
data layer; there is no separate tour UI or tour-only data. The self-hosted application never shows
or bundles it.

## User-visible behaviour

- The demo opens as before, free to explore. A **Guided tour** button floats in the lower-right
  corner of every page; the tour starts only when it is pressed and never blocks the demo.
- The presenter card shows *Chapter n of 8* with a progress bar, the chapter title, the current
  scene's explanation, scene dots (completed scenes filled, the current one wide, the remaining ones
  hollow; announced as *Scene n of m*), and a status line (*Showing it in the app…* while a scene
  acts, *Auto Play is paused…* while Auto Play is paused). The close button (**Close tour**, also
  Escape) sits in the header.
- **Controls.** The footer holds compact icon buttons — **Back**, **Replay chapter**, **Skip
  chapter** (only while the chapter is unfinished), **Auto Play** (a toggle with a pressed state),
  and **Pause** / **Resume** (only while Auto Play is on and the chapter still plays) — and one
  primary text button:
  - while the chapter is unfinished, the **scene action** with a contextual label. It is disabled
    while the spotlight moves and while the action runs (with a spinner), so a double click never
    runs an action twice;
  - once the last scene is complete, **Next**, which opens the next chapter;
  - in the last chapter, **Explore on your own**, with **Reset demo**, **Get Inventory Atlas Lite**
    (the README's Official releases section), and **View on GitHub** below it.
- **Scene action and chapter navigation are separate.** The scene action only moves the current
  chapter on, one scene at a time. Next appears only when the chapter is complete. **Back** opens the
  previous chapter and **Skip chapter** the next one at any time; both leave an unfinished chapter at
  once. **Replay chapter** starts the current chapter again from its first scene on a freshly opened
  page; it never restarts the whole tour or duplicates data.
- **Contextual labels.** A scene with an action names it (*Select Photography*, *Open Graph View*,
  *Save the Item*). A scene without an action still waits; its button names what the next scene
  shows (*Show Condition breakdown*, *Show the matching Item*). The last scene of a chapter has no
  button unless it has an action of its own.
- **Waiting has no time limit.** In the default manual mode a scene waits for its button as long as
  the visitor wants, and the page is not locked meanwhile: the visitor can scroll and look around.
- **Auto Play** is off by default and stays as chosen for the visit (it is not saved). When it is
  on, a waiting scene gets a reading time and then Auto Play presses its action, through the same
  path as the button; it continues into the next chapters after Next. **Pause** holds the
  presentation: no scene advances, and a running action stops at its next pause point; **Resume**
  continues. Switching Auto Play off leaves the scene waiting for its button again. A new chapter
  always starts unpaused.
- **Focus.** When the tour moves on (a chapter opened, a scene finished its action, the chapter is
  complete or failed), the focus goes to the new primary button, so Enter or Space continues the
  tour. A focus the visitor put on the page is left alone. Escape closes the tour from the card, and
  from anywhere while the tour itself changes the page.
- **Inverse theme.** The card uses the opposite color mode of the application: a dark card on the
  light theme and a light card on the dark theme. Only the card is inverted; the page and the
  spotlight keep the application's mode.
- The spotlight is a ring around the scene's subject with a dimmed page around it. It lets clicks
  through. While the tour itself changes the page — a chapter opens, the spotlight moves, or a scene
  action runs — a transparent lock covers the page so the visitor's clicks cannot fight the
  automation; the card always stays above both. While the tour is open, the page keeps extra room at
  its end, so any target can scroll above the card.
- The eight chapters, with the presses that move them on:
  1. **The Dashboard** — the summary cards, then *Show Items by category*, *Show Condition
     breakdown*, *Show Field coverage*, and *Show Items by location*, one area per scene.
  2. **Categories & Fields** — what Categories are for; *Select Photography* shows its Fields
     (Mount, Format, Last tested); *Compare with Location* explains a Category against a Location.
  3. **Hierarchy** — the Group by and View switches; *Show Location grouping* opens *Home / Office
     → Camera Bag*; *Group by Category*; *Open Photography* in the Tree View; *Open Graph View*.
  4. **Add an Item** — the real Add item form, one press per value: *Enter the name*, *Select
     Photography*, *Set the Condition* (New stays off), *Add the serial number*, *Place in Camera
     Bag*, *Fill in the Fields*, *Add a photo* (the generated `nikon-f65.webp`), and *Save the Item*.
     The chapter saves *Nikon F65 (spare body)* itself and ends on its details page.
  5. **Find Items** — the Items list; *Filter by Photography*; *Sort by Condition* (the table header
     on wide screens, the Sort select on phones); *Search for Nikon*, typed visibly; *Show the
     matching Item* highlights the tour item in the results.
  6. **Templates** — the template list; *Open 35mm film roll* opens it in its editor; *Show the
     preset Fields*; *Show how to use it* explains how Use starts a new Item from it. Nothing is
     saved.
  7. **Checklists** — the checklist cards; *Open Weekend photo walk* shows its expected items; *Start
     the Checklist* starts (or continues) a run; *Mark as Packed* marks *Nikon F65* **Packed**
     through the real state button; then what checklists are for.
  8. **Your inventory changed** — the Dashboard again, but only the changes the tour really made:
     what was added, then *Show Total items*, *Show the Category change*, *Show the Condition
     change*, and *Show the Location change* with `before → after` values from the real demo state,
     and *Finish the tour*. Each button names the next change that is actually shown. If the item
     was never saved (the visitor skipped Add an Item), the chapter says so instead.
- Pressing **Guided tour** again restarts from the canonical fixture: anything the visitor or an
  earlier tour changed is gone, so every tour shows the same data. The strip's **Reset demo** still
  reloads the demo from the fixture at any time, during or after a tour.
- If a page, target, or action does not work out within a few seconds, the chapter stops, the card
  says *This chapter could not be shown* in an alert, the spotlight and lock are removed, and the
  page stays usable. **Replay chapter** retries it and **Next** goes on. The console gets
  `[demo tour] chapter "<id>", scene "<id>" failed: …`.
- English and Ukrainian, following the demo's language: the presenter copy, the action labels, and
  the demo inventory it works on are in the same language, so the tour selects *Фототехніка*, opens
  *Сумка для камери*, and adds *Nikon F65 (запасний корпус)* in Ukrainian. Changing the language
  while the tour is open closes it — the demo is seeded again in the new language (see
  [Languages](public-demo.md#languages)), so the tour's baseline no longer applies — and **Guided
  tour** then starts it afresh in the new language. Settings, Cloud Backup, and Data Backup are
  deliberately not part of the tour: the static demo cannot show their real behaviour.

### Timing and reduced motion

All presentation timing lives in `TIMING` in `client/src/demo/tourActions.js`:

| Key | Default | Used for |
| --- | --- | --- |
| `beat` | 600 ms | after a click, a choice, a focus, or a scroll |
| `transition` | 900 ms | after the spotlight moved, before the scene waits for its button |
| `view` | 1300 ms | how long the result of a scene action stays on screen before the next scene |
| `longView` | 2600 ms | a longer `hold` for a result that needs it |
| `read` | 4000 ms | Auto Play only: the reading time of a waiting scene before Auto Play presses its action |
| `typeDelay` / `typeChunk` | 70 ms / 2 characters | the typing cadence |

A scene without an action moves on at once after its button; there is no result to look at. In the
default manual mode nothing times out while a scene waits. With *prefers-reduced-motion*, `beat` and
`transition` are skipped, values appear at once instead of being typed, scrolling is instant, and the
spotlight and scene dots do not animate; scenes still wait for their buttons, and the `view`,
`longView`, and `read` times stay, so every result is shown long enough and Auto Play still leaves
time to read.

### Phones

At the phone breakpoint (`max-width: 575.98px`) the card is a purpose-built compact strip across the
bottom edge, 8 px from the sides and above the bottom safe area:

- one header line, *3/8 · Hierarchy*, with the scene dots and Close; the avatar and the *Guided
  tour* / *Chapter n of 8* block are not shown (the progress bar still announces *Chapter n of 8*);
- a 2 px progress bar, a 1rem chapter title, 10–12 px padding, and the scene copy at its normal size;
- one controls row: the 36 px icon buttons, with accessible names and tooltips, and the scene action,
  which takes the remaining width and wraps its label onto a second line when needed;
- a normal scene keeps the card at about 180–240 px; the card is never taller than 35% of the
  dynamic viewport (at least 14rem), and longer copy scrolls inside the card while the controls row
  stays visible.

Spotlight targets are scrolled to the top of the screen (form fields to its middle), and while the
tour is open the page keeps 40% of the screen height of extra room at its end, so the card does not
cover them. The card always stays at the bottom edge; it does not move to the top.

## Implementation overview

### Files

- `client/src/demo/tourChapters.js` — the ordered chapter and scene definitions, their actions, and
  `actionLabelKey()`.
- `client/src/demo/tour.js` — the chapter engine, its shared state, and `advance()`.
- `client/src/demo/tourActions.js` — `TIMING`, target resolution, and the DOM actions scenes use
  (type, choose, click, attach a file, wait for a hook or text), each bound to the running chapter's
  `AbortSignal` and pause gate.
- `client/src/components/DemoTour.vue` — the launcher, the card and its controls, the focus rule,
  the spotlight, and the lock.
- `client/src/demo/fixture.js` — `tourItem`, the item the tour adds (its category and container are
  keys), and the template (`film-roll`) and checklist (`weekend-photo-walk`) the Templates and
  Checklists chapters open.
- `client/src/api.js` — `resetDemoData()` (a fresh seeded database) and `reloadDemoPage()`, which
  both advance `dataRevision`; `App.vue` keys the routed page on it, so the page mounts again.
- `client/src/App.vue` — mounts `DemoTour` only when `__DEMO__` is set, through a dynamic import, so
  the normal build contains no tour code or tour asset.

### Stable semantic keys

The tour never identifies an entity by English text. `tourChapters.js` names fixture entities by
semantic key (`photography`, `camera-bag`, `nikon-f65`, `cordless-drill`, `film-rolls`,
`film-roll`, `weekend-photo-walk`, the `mount` and `format` fields); `tour.data.fixture` —
`createDemoFixture(locale)` for the language the tour started in — turns a key into the name the page
shows, at the moment a scene needs it. Seeded items are found by their fixed UUID
(`demoItemUuid(key)`) and then by their row hook `item-row-<id>`, and the tour item by its unique
serial number. The `data-tour` hooks stay language-neutral. Scene copy and action labels name fixture
entities through placeholders (`{category}`, `{fields}`, `{container}`, `{location}`, `{camera}`,
`{template}`, `{templateField}`, `{checklist}`, `{search}`) that `copyParams()` fills from the same
fixture, so one set of chapters, with no per-language branch, plays on the inventory of every
language.

### Chapters and scenes

```js
{
  id: 'hierarchy',                 // stable; title under tour.chapters.hierarchy.title
  route: data => '/hierarchy',     // the page the chapter opens; may be async and use the tour data
  prepare: async context => {},    // optional, after the page opened and before the first scene
  scenes: [
    {
      id: 'tree',                  // stable; copy under tour.chapters.hierarchy.scenes.tree
      target: 'hierarchy-tree',    // spotlight at the scene's start: a data-tour hook, '#<control id>',
                                   // or a function of the tour data that returns one
      action: async context => {}, // optional; runs when the scene's button is pressed
      hold: 'view',                // the viewing time after the action (a TIMING key, default 'view')
      skip: data => false,         // optional: leave the scene out of this run
      params: (data, t) => ({})    // optional values for the scene's copy
    }
  ]
}
```

**How a scene names its button.** `actionLabelKey(chapter, sceneIds, position)` picks the label:

- a scene with an `action` uses `tour.chapters.<chapter>.actions.<scene id>` — what the action does
  (`actions.tree`: *Open Graph View*);
- a scene without an action uses `tour.chapters.<chapter>.continue.<next scene id>` — what the next
  shown scene presents (`continue.locations`: *Show Items by location*). Because it is keyed by the
  next scene that is actually shown, skipped scenes (the final chapter) never get a wrong label;
- the last scene without an action has no button; the chapter is complete once it is shown.

Write the action so that the next scene's copy explains its result (*Group by Category* → "Group by
Category shows what each Item is…"), or so that the scene's own copy explains what the press will do
(the Add an Item scenes). Labels follow the copy rules below: one short command that starts with a
verb, the exact UI term, no *Continue*, *Go*, *Do it*, or *See more*.

### Scene engine

For each chapter run the engine aborts the previous run, opens the route (pushing it, and mounting
the page again through `reloadDemoPage()` when it is the same page), runs `prepare`, and then shows
every scene that is not skipped. `tour.status` tracks where it is:

| Status | Meaning | Card |
| --- | --- | --- |
| `opening` | the chapter opens its page, or the scene waits for its target (8 seconds at most), moves the spotlight, and waits `transition` | scene action disabled; page locked |
| `waiting` | the scene waits for its button, or for Auto Play's `read` delay | scene action enabled; page free |
| `acting` | `advance()` was called: the action runs, then the scene's `hold` | scene action disabled with a spinner; page locked |
| `done` | the chapter is complete | **Next** (or the final choices) |
| `failed` | a target, page, or action threw | alert, **Next**, highlighted Replay; spotlight and lock removed |
| `idle` | the tour is closed | — |

`tour.paused` is the Auto Play pause on top of these states. A scene that has no action and is the
last of its chapter goes from `opening` straight to `done`.

`advance()` is the one canonical way a scene moves on: the scene action button calls it, and Auto
Play calls it after its delay. It only does anything while the status is `waiting`, so a double
click, Enter held down, or a late Auto Play delay can never run an action twice or skip a scene.
Auto Play's delay is an `AbortController`-bound `sleep()` that belongs to one waiting scene: it is
aborted by Pause, by switching Auto Play off, by `advance()`, and by every Next, Back, Replay, Skip,
Close, or restart, and it checks on firing that its scene is still the waiting one. There is no
separate Auto Play implementation.

`context` holds the actions of `tourActions.js` (`waitForHook`, `waitForText`, `waitForLabel`,
`waitFor`, `type`, `choose`, `click`, `attachFile`, `pause`), `spotlight(target)` to move the
spotlight in the middle of an action, `data` (the tour's own state), and the `router`. Any throw
stops the chapter, logs the chapter and scene ids, and removes the spotlight and the lock.

A `#<id>` target highlights a labelled form control together with its label, so the Add item scenes
point at single fields without extra hooks.

**To add a chapter:** add an entry to `tourChapters` at its place, give it and its scenes stable ids,
add `tour.chapters.<id>.title`, one `scenes.<sceneId>` message per scene, and the `actions` and
`continue` labels its scenes need to both `en.json` and `uk.json`, add any `data-tour` hook it needs,
and update the chapter list and the `steps` of `test/e2e/tour.spec.js` and the chapter count in
`test/demo.test.js`. The card counts chapters and scenes itself.

**To add or reorder scenes:** edit the chapter's `scenes` array, its copy, and its labels in both
locales. A scene must work again on a replay, so an action checks the state it finds before acting.

### Pause, abort, and navigation safety

Every chapter run owns one `AbortController`. Next, Back, Skip chapter, Replay, Close, and a restart
abort the current run before anything else; the waiting scene's promise and every wait (`pause`,
`waitFor`, the timers inside them) reject on that signal, so a delayed action of an old chapter can
never touch the newly opened page. With Auto Play on, Pause sets `tour.paused`: the waiting scene's
delay is cancelled, and a running action's next `pause()` waits at a gate until Resume, Auto Play
off, or an abort. The gate is never inside the typing cadence, so a word is never left half typed.
The lock is only shown while the status is `opening` or `acting` and Auto Play is not paused; a
failure clears it.

### Deterministic replay and idempotency

Starting the tour calls `resetDemoData()`, clears the Items selection, forgets the tour data, and
stores the Dashboard as `data.baseline`, so each tour begins on the same fixture with the same
numeric ids (the tour item is always item 23).

- **Add an Item:** `route()` looks the tour item up by its unique serial number. If it exists, the
  chapter opens its edit form, types the same values again, skips the Stored inside search when the
  container is already set, skips the photo when it is already shown, and saves the edit. Back, Next,
  and Replay therefore never create a second item or upload a second photo.
- **Find Items:** `route()` resets the Items sort to Name in the stored table view, so the Condition
  sort is a visible change on every replay, and finds the item the search ends on (the tour item, or
  the seeded Nikon F65); the page mounts again with empty filters.
- **Hierarchy:** the route has no `group` or `view` query and the page mounts again, so every replay
  starts on Location and Tree with closed branches.
- **Templates:** nothing is saved; the editor is left without saving.
- **Checklists:** *Start the Checklist* continues an open run of the checklist (**Continue run**)
  instead of starting another one; when Nikon F65 is already Packed, *Mark as Packed* sets it back to
  Pending first so the check is visible again.
- **Your inventory changed:** `prepare` loads the Dashboard again and compares it with the baseline.
  A scene is skipped when its value did not change, so only real changes are presented.

There is no undo: Back only opens the earlier chapter again.

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
tokens, lays out its grid (one grid with different areas on desktops and phones), and styles the
scene dots.

### Presenter copy rules

The English presenter copy follows an ASD-STE100-inspired controlled English, at roughly 70–80%
alignment rather than formal compliance:

- one or two short sentences per scene, one idea per sentence, active voice, a clear subject;
- direct verbs (*open*, *select*, *add*, *find*, *sort*, *show*, *save*, *check*) and imperatives for
  the actions the visitor triggers (*Select the Photography Category.*);
- the product's terms, always the same: Item, Category, Field, Location, Hierarchy, Tree View, Graph
  View, Template, Checklist, Dashboard, Condition, New; UI labels exactly as the interface shows them
  (*Items by category*, *Stored inside*, *Group by*);
- no idioms, filler, or marketing words, and no sentence that starts with a vague *It*, *This*,
  *That*, or *They*;
- prefer the pattern *what this is* followed by *what it does or why it matters*;
- action labels are one short command (at most five words) that starts with a verb and says what
  will happen (*Search for Nikon*, *Show the Condition change*), never *Continue*, *Go*, *Do it*, or
  *See more*, and with no closing period.

Review checklist for new or changed copy: sentence length; ambiguous pronouns; terminology drift;
unneeded synonyms; passive voice; filler words; multi-clause sentences that can be split; scene text
that grew without adding value; labels that do not say what will happen. `test/demo.test.js`
enforces the measurable part: at most two sentences and 160 characters per scene in both languages,
at most 22 words per English sentence, no banned synonyms or filler words, no vague opening pronoun,
every canonical term in use, and for the labels: the same keys in both languages, a real scene for
every key, at most five words and 40 characters, a leading English verb, no generic label, and no
label used twice in a chapter.

Ukrainian copy keeps the same qualities — short sentences, one idea at a time, direct verbs, stable
terms (предмет, категорія, поле, місце, ієрархія, шаблон, чек-лист, панель, стан), and the same
information density — without a literal translation of the English. Ukrainian labels are infinitive
commands (*Вибрати «Фототехніка»*, *Відкрити вигляд «Граф»*). Fixture names reach the copy only
through placeholders, quoted with «» in Ukrainian, so the copy reads the same whatever inventory
language fills them; `test/demo.test.js` fails when a scene names a fixture entity directly.

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

To try a chapter by hand, start the tour and use **Skip chapter** to reach it: in manual mode press
each scene action and check the copy, the spotlight, and the page after each press; then press
**Replay chapter**, switch **Auto Play** on, and watch the same chapter play to its end, with
**Pause** and **Resume** in between. A browser test does the same with the chapter's labels in the
`steps` table of `test/e2e/tour.spec.js` (`playChapter()`), and proves that nothing happens on its
own with Playwright's page clock (`page.clock.install()` and `fastForward()`) instead of fixed waits.

## Verification

- `test/e2e/tour.spec.js` (16 tests) runs the built demo under the Pages-style base path: all eight
  chapters pressed scene by scene, with their copy, spotlight targets, focus, and results (every
  Dashboard area; Photography's Fields only after *Select Photography*; Location and Category
  grouping, Tree View, and Graph View; the form filled one press at a time and saved only by *Save
  the Item*, with the generated photo; filter, Condition sort, Nikon search, and the highlighted
  item; the template's values; a real checklist check; the payoff with the real before/after
  values, one press per change; the final actions); a waiting scene that never acts when the page
  clock jumps a minute ahead, and a double click that shows one scene only; Auto Play off by
  default, playing chapters on its own, Pause holding a scene, Resume, Auto Play off returning to
  manual waiting, a stale delay that never fires, and Replay in both modes; Replay, Back, and Next
  without a duplicate item, photo, or checklist run, Back during a running action, and Reset demo
  restoring the checklist; Close and Escape stopping a running action; a failing scene action naming
  its chapter and scene with Replay and Next; the inverse card in both color modes; Enter and Space
  on the focused scene action; Ukrainian labels and copy; reduced motion; the whole tour pressed on
  a 390 × 844 phone with the compact card measured at every scene (at most 35% of the screen, a
  median of at most 240 px, the scene action visible, the target above the card, no horizontal
  overflow, named 36 px icon buttons); the controls row on 360 × 800 and 430 × 932 phones; and no
  tour in the self-hosted application. On the Ukrainian demo (`?lang=uk`) it presses the Categories,
  Hierarchy, Add an Item (with Replay editing the same item), Find Items, and final chapters with the
  Ukrainian labels, copy, and fixture values, and a language change during the tour closes it, seeds
  the Ukrainian inventory, and lets the tour start again in Ukrainian.
- `test/demo.test.js` checks, in every language, that the tour item uses a demo photo, is not
  seeded, saves through the real services into the Camera Bag, and is found again by its serial
  number; that the fixture's template and checklist fit their chapters; and the copy and label
  rules above, including no fixture name in the copy.
- `test/i18n.test.js` keeps the English and Ukrainian tour strings in parity.

## Notes and limitations

- Visitors may leave the chapter's page while a scene waits or after the chapter is complete; the
  next scene action then fails with Replay chapter and Next, and Replay opens the chapter's page
  again. Changes the visitor makes to the Add item form while a scene waits are saved with the tour
  item.
- Skipping Add an Item before *Save the Item* leaves the form unsaved; the later chapters then work
  with the seeded Nikon F65, and the final chapter says that no item was added.
- The presenter stays at the bottom edge on phones; it never moves to the top. The extra room at the
  end of the page keeps targets above it instead.
