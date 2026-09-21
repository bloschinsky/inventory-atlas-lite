# Effective location inherited from the parent container

Completed on 2026-09-21 for version `0.19.0`.

An item stored inside another item is now displayed at the location of the outermost container of
its chain, at any nesting depth. The value is calculated on every read. No column was added, nothing
is persisted, and `items.location` keeps the exact text the user saved, so taking an item out of its
container shows its own location again without any migration, and moving a container immediately
moves everything it holds without writing a single contained row.

The list query resolves the whole page in one statement. `ItemRepository.search()` is prefixed with
a recursive CTE that walks down from every top-level item, labels each row with its root container,
and joins that root for its id, uuid, name, and location; a count and the page are still the only
two statements the endpoint prepares, whatever the nesting depth is. Walking downwards also means a
row inside a hypothetical cycle is never reached instead of looping. `ItemRepository.findRoot(id)`
resolves a single item upwards through its parents with a depth guard, and `ItemService` shapes both
into `effective_location` (`null` when the resolved location is empty) and
`effective_location_source` (`{ id, uuid, name }`, or `null` for an item that provides its own
location). `GET /api/items`, `GET /api/items/:id`, `POST /api/items`, and `PUT /api/items/:id` carry
both fields. The existing cycle protection in `ItemService.resolveParentId` is untouched.

The item details page, the items table, the narrow-screen line under the item name, and the phone
cards display `effective_location`. Item details adds the note *Displayed location is inherited from
the parent container.* while the item sits in a container. The item form keeps editing the item's
own **Location**; the input is neither disabled nor cleared, and hints under it and under **Stored
inside** explain the inheritance. The dashboard placement metrics keep their previous meaning and
still use each item's own saved location.

Documentation: the new feature document `docs/features/effective-location-inheritance.md` with its
index entry, the corrected `Location`/`Stored inside` statement in `docs/features/nested-items.md`,
the glossary, items list, nesting walkthrough, and dashboard notes in `docs/HOW-TO.md`, the removed
roadmap entry, and the deleted task file `docs/issues/TASK-effective-location-inheritance.md`.

## Verification

- `npm run lint` — clean.
- `npm test` — 9 tests pass, including the new service-level inheritance rules, the two-statement
  list assertion, and the HTTP-level test that checks the stored SQLite row after a container move.
- `npm run build` — the client compiles.
- `npm run test:e2e` — 37 Playwright tests pass, including the new browser coverage of the inherited
  location on item details and in the items list, and the own location returning after **Clear**.
