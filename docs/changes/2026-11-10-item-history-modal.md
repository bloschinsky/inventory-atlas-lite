# Open the full Item History in a route-driven dialog (#59)

- **Completed:** 2026-11-10
- **Version:** 0.74.3
- **Branch:** `feature/59-item-history-modal`

## Summary

**View full history** used to leave Item details for a separate `ItemHistory.vue` page. The full
timeline now opens as a dialog over the same Item details page. The address is still
`/items/:id/history`. No API, schema, recorded events, or pagination changed.

- **Routing:** `/items/:id/history` is now a child route of `/items/:id` (`client/src/main.js`).
  Item details stays mounted when the dialog opens and closes, so its data, open state, and scroll
  position stay the same. A directly loaded or reloaded address shows the item page behind the
  dialog. `ItemDetails.vue` renders the child through its own `RouterView` and passes the item it
  already loaded, so the item is not requested a second time. `client/src/pages/ItemHistory.vue` was
  removed, along with its unused `history.backToItem` message.
- **Dialog:** the new `client/src/components/ItemHistoryDialog.vue` uses Tabler modal markup without
  Bootstrap JavaScript, following the Settings dialog, and is teleported to `body`. Width and layout:
  `--tblr-modal-width: 54rem` on desktops and `modal-fullscreen-md-down` on phones. It has the **Item
  History** / **Історія предмета** title, the item name as its description, **Close history** /
  **Закрити історію**, and a scrolling body. That body holds the existing `ItemHistoryTimeline.vue`
  with its filters, grouped entries, Load more, and loading, empty, and error states.
- **Navigation:** Close, Escape, and a backdrop click call `router.back()` when the previous history
  entry is the item, so Forward reopens the dialog. In every other case they replace the address with
  `/items/:id`, so Back never reopens a directly loaded dialog. A timeline link to another item opens
  that item without the dialog.
- **Accessibility:** the dialog's exported `itemHistoryOpen` makes `App.vue` set `inert` and
  `aria-hidden` on the page while the dialog is open. Other behavior:
  - `body.modal-open` locks the page scroll, and it is removed on every exit path.
  - Tab wraps inside the dialog, and the focus starts on Close.
  - On close, the focus returns to **View full history** with `preventScroll`.
  - The shell's own dialogs open above it, on the same 1045/1040 layer as Settings.
  - A Settings address over it hides it until Settings closes.
- **Docs:** `docs/HOW-TO.md` and `docs/HOW-TO.uk.md` (See the history of an item),
  `docs/features/item-activity-history.md`, `docs/features/README.md`, and `AGENTS.md`.

## Verification

- Playwright `test/e2e/item-history.spec.js` has three new tests:
  - The in-app dialog: URL, title, and item name; one dialog only; the page is inert, its scroll is
    kept, and it cannot be scrolled behind the dialog; focus starts on Close and the Tab trap holds;
    Escape returns focus to the link with the scroll unchanged; Forward and Back work; Close and a
    backdrop click leave no history entry; a timeline link opens another item cleanly.
  - A direct load and a reload show the item page behind the dialog, and Close replaces the address
    so Back leaves the item.
  - The full-screen 390 px phone dialog scrolls on its own, while the page neither scrolls nor
    overflows.

  The existing tests now expect the dialog headings in English and Ukrainian.
- `npm run lint`: passed. `npm run build`: passed.
- `npm test`: 442 of 445 passed (1 skipped). The 2 failures are the known Windows-only guide tests in
  `test/landing.test.js` that also fail on a clean `master`, because `core.autocrlf` checks the guides
  out with CRLF. The guide parity checks pass.
- `APP_VERSION=0.74.3 npm run test:e2e` (with `E2E_*_PORT` overrides for reserved Windows ports):
  318 of 319 passed. The one failure, `settings-navigation.spec.js` › unsaved changes are kept unless
  discarding them is confirmed (a prompt count on `/items`, no item page involved), passed when rerun
  together with `item-history.spec.js` (17 of 17), which also covers the final dialog code.
