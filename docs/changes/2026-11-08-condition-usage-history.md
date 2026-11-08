# Condition and New/Used changes in Item Activity History (#75)

- **Completed:** 2026-11-08
- **Version:** 0.74.0
- **Branch:** `feature/75-condition-usage-history`

## Summary

The existing Item Activity History now records two more event types, with no new table, page, or
history subsystem:

- `new_status_changed` — the item's own `is_new` changed; stored as the stable keys `new` / `used`.
- `condition_changed` — the item's own `condition_grade` changed in either direction, including to
  and from Not set; stored as the grade key or `NULL`.

`ItemHistoryRepository.snapshot()` now also reads each item's `is_new` and `condition_grade`, and
`detectChanges()` compares them per item, so `ItemService.update()` records them inside its existing
`item_update` transaction, in the same operation as any move or Transferred To change of that save.
Only real changes are recorded: unchanged saves, Condition Notes edits, and a container's own change
(for its contents) add nothing, the two values are never inferred from each other, and creating an
item (form, template, duplicate, batch import) records nothing.

Schema version 14 widens the `item_events.event_type` CHECK. SQLite cannot alter a CHECK, so the
version 10 rebuild of `custom_fields` became a shared `rebuildTable()` over a list of list-CHECK
rebuilds; an older `item_events` is rebuilt from its own definition with only the CHECK replaced,
keeping every row, id, the `AUTOINCREMENT` counter, foreign keys, and (recreated) indexes and
triggers, without advancing `last_updated_at`. No events are fabricated for existing items.

`GET /api/items/:id/history` gains `type=condition_usage` (both new types; `all` includes them; the
other filters are unchanged). The timeline shows **Usage status changed** and **Condition changed**
with the shared New/Used and Condition badges, adds the **Condition & Usage** filter in English and
Ukrainian, and its filter buttons now wrap on narrow phones. The MCP adapter's `get_item_history`
accepts `condition_usage` and describes the new events. Feature documents, the user guide (EN/UK),
the MCP adapter document, and the release history were updated. The optional *Item added* milestone
was not added.

## Verification

- `npm run lint` — passed.
- `npm test` — 442 of 445 passed, 1 skipped; the 2 failures are the known Windows-only guide tests in
  `test/landing.test.js` that also fail on a clean `master`.
- `npm run mcp:test` — 85 passed.
- `npm run build` and `npm run demo:build` — passed.
- `test/e2e/item-history.spec.js` — 7 passed, including the three new tests (grouped New → Used and
  Excellent → Good entry with badges and the filter, Load more across a page boundary, Ukrainian dark
  mode on a 360 px phone).
- Full `npm run test:e2e` (with `APP_VERSION=0.74.0` and the `E2E_*_PORT` overrides needed on this
  machine, which include the landing and demo builds) — 314 passed in 21.9 minutes.
