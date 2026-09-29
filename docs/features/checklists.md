# Checklists (Phase 1)

Reusable packing and verification checklists that reference existing inventory items, with a
separate, durable run for every use. A checklist is a definition; a run is one concrete check session.
The check state belongs to the run, never to the checklist or to the item.

```text
Checklist            reusable definition: name, description, mode
  Checklist items    ordered references to existing items
Checklist run        one use, copied from the checklist when it starts
  Run items          per-item state of that run: pending, confirmed, or missing
```

## Behavior

- **Checklists** is a main navigation entry after **Templates** (`/checklists`). Each checklist is a
  card with its name, mode, item count, the start time and status of its last run, and the last
  result (`n / m checked` with the packed or present and missing counts). The card offers **Open**,
  **Start**, **Edit**, and **Delete** (after a browser confirmation). An empty list shows an empty
  state. Below the cards, **Runs of deleted checklists** lists the runs whose checklist was deleted.
- The editor (`/checklists/new`, `/checklists/:id/edit`) has **Name** (required), **Description**, and
  **Mode** (**Packing** or **Verification**, each with a one-line purpose). **Add inventory items**
  searches the inventory through the regular `GET /api/items` search (name, description, serial
  number, Transferred To, text custom fields; 20 results) and shows each result's thumbnail,
  category, effective location, and direct container. **Add** appends an item and turns into a
  disabled **Added** for items already in the list, so several items are added without leaving the
  form and none twice. **Checklist items** lists the entries in their order with move up, move down,
  and remove buttons; the moved entry keeps the keyboard focus. Items cannot be created here.
- The checklist page (`/checklists/:id`) shows the name, mode, description, the expected items in
  order (thumbnail, current name linking to the item, category and effective location), and the
  **Run history**. **Start** becomes **Run again** once the checklist has runs, and **Continue run**
  opens the newest run that is still in progress.
- A run page (`/checklists/runs/:runId`) is laid out for a phone: a progress card
  (`7 / 9 checked`, a two-color bar, and `Packed: 6`, `Missing: 1`, `Pending: 2` badges) and one card
  per item with its thumbnail, snapshot name, state badge, an open-item link while the item exists,
  three equal 44 px buttons (**Packed**/**Present**, **Missing**, **Pending**) with `aria-pressed`,
  and an optional note saved when the field changes. The state is always written in words; the
  colors of the buttons, badges, and card edge are only a second cue.
- Every state change and note is sent at once and the server's run replaces the page state, so a
  reload never loses progress. **Complete checklist** asks `n items are still pending. Complete this
  run anyway?` when pending items remain. A completed run shows a read-only notice with the completion
  time, the notes as text, and **Run again** while its checklist exists.
- Run history rows (checklist page and deleted-checklist history) show the start time linking to the
  run, the status (**In progress** or **Completed**), and the confirmed, missing, and pending counts
  labeled for the run's mode.

## Modes and states

- Both modes share one state model: `pending`, `confirmed`, and `missing`. Only the label of
  `confirmed` differs: **Packed** in Packing mode, **Present** in Verification mode. There is one run
  engine for both.
- `checked = confirmed + missing`: a missing item counts as explicitly checked, never as confirmed.
- `checked_at` is stamped on every explicit Packed/Present or Missing, and cleared by returning the
  item to Pending.
- A run is `in_progress` until it is completed; `completed_at` is then set and every later change,
  including another completion, is refused with `CHECKLIST_RUN_COMPLETED`. Completed runs are never
  edited or deleted in Phase 1.

## Snapshots, history, and inventory changes

- Starting a run copies, on the server, the checklist's name and mode and every entry still linked to
  an item, in order and under the item's current name. The browser never sends a snapshot. Editing
  the checklist afterwards (name, mode, membership, order) changes only future runs.
- **Run again** and **Start** always create a new run with every item pending. An earlier run is never
  reset or overwritten; several runs of one checklist may be in progress at once.
- **Item renamed:** the checklist shows the current name; runs keep their snapshot name.
- **Item deleted:** item deletion is never blocked by a checklist. The checklist entry loses its link
  (`ON DELETE SET NULL`) and is shown as **Deleted item** under its last known name, which is refreshed
  whenever the checklist is saved or started. It stays until the user removes it; it is skipped when a
  run starts. A run item of a deleted item keeps its snapshot name, state, and note and is marked
  **Deleted from inventory**, without the open-item link. A checklist left without any linked item
  refuses to start with `CHECKLIST_HAS_NO_ITEMS`.
- **Item moved:** membership references the item identity, so moves between locations or containers
  change nothing; the checklist shows the new effective location.
- **Checklist deleted:** the checklist and its entries are removed (`ON DELETE CASCADE`), its runs stay
  with `checklist_id = NULL` and remain readable through their snapshots, listed under **Runs of
  deleted checklists**.

## Storage and API

- Schema version 4 adds four tables, created for new databases and added in place to existing ones by
  the usual additive `applySchema()` path. They are part of `CURRENT_SCHEMA` and `TRACKED_TABLES`, so
  checklist writes advance the database's `last_updated_at`.
  - `checklists`: `name`, `description`, `mode` (`CHECK` packing/verification), timestamps.
  - `checklist_items`: `checklist_id` (cascade), nullable `item_id` (`ON DELETE SET NULL`),
    `item_name_snapshot`, `sort_order`, `created_at`. A unique index on `(checklist_id, item_id)`
    prevents a second live reference to the same item; deleted entries (`NULL`) never collide.
  - `checklist_runs`: nullable `checklist_id` (`ON DELETE SET NULL`), `checklist_name_snapshot`,
    `mode`, `status` (`CHECK` in_progress/completed), `started_at`, `completed_at`, `created_at`.
  - `checklist_run_items`: `run_id` (cascade), nullable `item_id` (`ON DELETE SET NULL`),
    `item_name_snapshot`, `position`, `status` (`CHECK` pending/confirmed/missing), `checked_at`,
    `note`.
- The tables live in the main SQLite database: backups, restores, cloud backups, and resets include
  them, and the restore summary and reset impact count `checklists` and `checklistRuns`.
- `ChecklistRepository` and `ChecklistRunRepository` own the SQL, `ChecklistService` the definitions,
  `ChecklistRunService` the runs, and `routes/checklistRoutes.js` the endpoints.
  `shared/checklists.js` holds the modes, states, note limit, and the count rule shared with the
  browser.

| Endpoint | Purpose |
| --- | --- |
| `GET /api/checklists` | Checklists by name with `item_count` and `last_run` (summary or `null`). |
| `POST /api/checklists` | Create from `{ name, description, mode, items }`. |
| `GET /api/checklists/:id` | The checklist with its ordered `items` (`id`, `item_id`, `item_uuid`, `name`, `deleted`, `category_name`, `effective_location`, `thumbnail_id`). |
| `PUT /api/checklists/:id` | Replace name, description, mode, and the whole membership. |
| `DELETE /api/checklists/:id` | Delete the definition; its runs stay. |
| `POST /api/checklists/:id/runs` | Start a new run from the current checklist (`201`). |
| `GET /api/checklists/:id/runs` | Run summaries of one checklist, newest first. |
| `GET /api/checklist-runs` | Every run summary, including runs of deleted checklists. |
| `GET /api/checklist-runs/:runId` | One run with `counts` and its ordered `items`. |
| `PATCH /api/checklist-runs/:runId/items/:runItemId` | Set `status` and/or `note` of one run item. |
| `POST /api/checklist-runs/:runId/complete` | Complete the run. |

- `items` is the whole ordered membership: `{ id }` keeps an existing entry of this checklist (the
  only way to keep a deleted item's entry), `{ item_id }` adds a reference to an existing item.
  Unknown or foreign entry ids and malformed entries answer `CHECKLIST_ITEMS_INVALID`, unknown item ids
  `CHECKLIST_ITEMS_NOT_FOUND` (`count`), and a second reference to one item `CHECKLIST_ITEM_DUPLICATE`
  (`name`). The whole save is one transaction.
- A run summary is `{ id, checklist_id, checklist_name, mode, status, started_at, completed_at,
  counts: { total, confirmed, missing, pending, checked } }`.
- A note is optional text of at most 500 characters (`CHECKLIST_NOTE_TOO_LONG`); an empty note is
  stored as `NULL`. Other errors: `CHECKLIST_NOT_FOUND`, `CHECKLIST_NAME_REQUIRED`,
  `CHECKLIST_MODE_INVALID`, `CHECKLIST_RUN_NOT_FOUND`, `CHECKLIST_RUN_ITEM_NOT_FOUND`,
  `CHECKLIST_RUN_STATUS_INVALID`, `CHECKLIST_NOTE_INVALID`, and `INVALID_REQUEST` for a patch without
  `status` or `note`.

## Localization

Every label, state, count, confirmation, and error is translated in English and Ukrainian under
`checklists.*`, `counts.checklists`, `counts.checklistRuns`, and `errors.CHECKLIST_*`. Checklist names,
descriptions, notes, item names, and category names are user data and are never translated.

## Tests

- `test/checklists.test.js` — services against an in-memory database: both modes, ordering and
  reordering, validation and duplicates, pending start, every state change and correction, counts,
  completion and read-only history, run again without touching older runs, snapshots unaffected by
  checklist edits and item renames, deleted items in checklists and runs, checklist deletion keeping
  runs, and the in-place migration of a version 3 database.
- `test/e2e.test.js` — the HTTP contract, item deletion not blocked, the backup file contents, and
  persistence over a restart. `test/restore.test.js` and `test/reset.test.js` cover restore, the
  summaries, and the reset of the checklist tables.
- `test/e2e/checklists.spec.js` — the browser workflow (create, add, reorder, start, mark, correct,
  note, reload, pending confirmation, complete, history, run again, old run unchanged), Verification
  labels, deleted items and deleted checklists, and a phone-width run without horizontal scrolling.

## Phase 1 limitations

- Entries are always existing inventory items; there are no free-text entries.
- No QR or barcode scanning inside a run, no reminders, schedules, or collaboration, no automatic
  suggestions, and no AI-generated checklists.
- Checking an item never changes it: no `last_verified_at`, no location or container changes.
  Container audits and verification timestamps are planned for Phase 2.
- Completed runs cannot be edited, reopened, or deleted, and in-progress runs cannot be discarded.
