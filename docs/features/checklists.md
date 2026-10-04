# Checklists

Reusable packing and verification checklists that reference existing inventory items, with a
separate, durable run for every use. A checklist is a definition; a run is one concrete check session.
The check state belongs to the run, never to the checklist or to the item. Phase 2 adds container
audits (verification runs taken from what a container holds) and the item's **Last verified** time,
recorded only by a completed verification run.

```text
Checklist            reusable definition: name, description, mode
  Checklist items    ordered references to existing items
Checklist run        one use, copied from the checklist when it starts,
                     or a container audit, copied from the container's contents
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
  edited, reopened, or deleted: a correction is a new run.

## Last verified

- `items.last_verified_at` is the most recent time the application recorded the item as physically
  present during a completed verification run. It is `NULL` (shown as **Never**) until then, including
  for every existing item after the migration and every new item.
- It is written only when a **Verification** run is completed, for the run items whose final state is
  **Present** (`confirmed`) and that are still linked to an item. The value is that run item's
  `checked_at`, the time it was last marked Present, in the same `YYYY-MM-DD HH:MM:SS` UTC format as
  the other timestamps. An item keeps a newer value it already has, so completing an older run never
  moves it back, and several runs always leave the newest verification.
- Nothing else records it: not creating, editing, or moving an item, not opening or starting a run,
  not marking Present in a run that is still in progress (taking it back to Pending before completion
  leaves no trace), not Missing or Pending, and never a **Packing** run, even when everything is Packed.
- Completion and the Last verified updates are one SQLite transaction: the run is checked to be still
  in progress, marked completed, and the items updated, or nothing changes at all.
- Recording a verification changes no other item column: not `updated_at`, `location`,
  `parent_item_id`, `condition_grade`, `condition_notes`, or `transferred_to`.
- **Item details** shows a read-only **Last verified** row in the Details card with the time in the
  interface language, or **Never**. The item form has no field for it.

## Container audits

- The **Contents** section of an item that holds other items has an **Audit contents** button. It opens
  a dialog with the number of items to check and **Start audit**. When the contents are nested deeper
  than the direct children, the dialog offers **Scope**: **Direct contents** (default; the items whose
  container is this item) or **All nested contents** (every descendant at any depth), each with its
  count. The audited container itself is never included.
- Starting an audit creates a Verification run on the server from the database as it is at that
  moment: the recursive walk runs in SQL, each descendant is listed once under its own container with
  siblings by name, and a damaged cycle cannot repeat an item. The browser only sends the scope.
- The run is a snapshot. Items moved in or out, or renamed, after it started never change it: it keeps
  expecting what the container held when it began. The run page is the normal run page, titled
  **Audit: <container name>**, with the scope in the subtitle, **Back to container**, and **Run
  again**, which audits the container again with the same scope.
- Audits are not reusable checklists. They never appear among the checklist cards, however often they
  run; they are listed under **Audit history** on the **Checklists** page with their title and scope,
  and the container's page lists its **Recent audits** (the five newest, with **All audits** linking to
  the Checklists page when there are more) through the usual run history table.
- The run keeps the container's name as a snapshot, so a renamed container's old audits keep the name
  it had. Deleting the container is not blocked by its audits; their container link becomes `NULL`,
  the run page says the container was deleted, and the history stays readable.
- An audit records evidence only. Completing it never moves a Present item into the container, never
  takes a Missing item out, and never changes any item's `location`, `parent_item_id`, effective
  location, Condition, Condition Notes, or Transferred To. A Missing result stays in the run history; the item's own
  page is one tap away to decide what to do.

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
    `mode`, `status` (`CHECK` in_progress/completed), `started_at`, `completed_at`, `created_at`, and
    since schema version 5 `source` (`checklist` or `container_audit`, default `checklist`),
    `source_container_item_id` (`ON DELETE SET NULL`), `source_container_name_snapshot`, and
    `audit_scope` (`direct` or `nested`). An audit has no `checklist_id`, mode `verification`, and the
    container's name in both name snapshots.
  - `checklist_run_items`: `run_id` (cascade), nullable `item_id` (`ON DELETE SET NULL`),
    `item_name_snapshot`, `position`, `status` (`CHECK` pending/confirmed/missing), `checked_at`,
    `note`.
- Schema version 5 adds the nullable `items.last_verified_at` and the four `checklist_runs` columns
  in place (`ALTER TABLE ... ADD COLUMN`); existing items start at `NULL` and existing runs are
  `checklist` runs. Both are part of `CURRENT_SCHEMA`, so an older backup is migrated on its staged
  copy during restore.
- The tables live in the main SQLite database: backups, restores, cloud backups, and resets include
  them, and the restore summary and reset impact count `checklists` and `checklistRuns` (audits
  included).
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
| `PATCH /api/checklist-runs/:runId/inventory-items/:itemId` | The same change addressed by the inventory item's id or UUID. |
| `POST /api/checklist-runs/:runId/complete` | Complete the run; a Verification run also records Last verified. |
| `POST /api/items/:id/audits` | Start an audit of the item's contents from `{ scope }` (`direct` by default) (`201`). |
| `GET /api/items/:id/audits` | Audit summaries of one container, newest first. |

- `GET /api/items/:id` also returns `last_verified_at` and `descendant_count` (every item below it,
  the size of a nested audit).
- Run items can be changed by their stable inventory identity, not only by run item id, so a later
  QR-driven verification can resolve `item UUID → run item → Present` without depending on page
  positions. No QR data is stored in the checklist tables.

- `items` is the whole ordered membership: `{ id }` keeps an existing entry of this checklist (the
  only way to keep a deleted item's entry), `{ item_id }` adds a reference to an existing item.
  Unknown or foreign entry ids and malformed entries answer `CHECKLIST_ITEMS_INVALID`, unknown item ids
  `CHECKLIST_ITEMS_NOT_FOUND` (`count`), and a second reference to one item `CHECKLIST_ITEM_DUPLICATE`
  (`name`). The whole save is one transaction.
- A run summary is `{ id, checklist_id, checklist_name, mode, status, started_at, completed_at, source,
  container_id, container_name, audit_scope, counts: { total, confirmed, missing, pending, checked } }`;
  a full run adds `items`. `container_id` is the live link and `container_name` the snapshot.
- Audit errors: `CHECKLIST_AUDIT_SCOPE_INVALID`, `CHECKLIST_AUDIT_NO_CONTENTS` (`409`, an item with
  nothing inside), and `ITEM_NOT_FOUND`.
- A note is optional text of at most 500 characters (`CHECKLIST_NOTE_TOO_LONG`); an empty note is
  stored as `NULL`. Other errors: `CHECKLIST_NOT_FOUND`, `CHECKLIST_NAME_REQUIRED`,
  `CHECKLIST_MODE_INVALID`, `CHECKLIST_RUN_NOT_FOUND`, `CHECKLIST_RUN_ITEM_NOT_FOUND`,
  `CHECKLIST_RUN_STATUS_INVALID`, `CHECKLIST_NOTE_INVALID`, and `INVALID_REQUEST` for a patch without
  `status` or `note`.

## Localization

Every label, state, count, confirmation, and error is translated in English and Ukrainian under
`checklists.*` (audits under `checklists.audit.*`), `itemDetails.lastVerified`,
`itemDetails.neverVerified`, `counts.checklists`, `counts.checklistRuns`, and `errors.CHECKLIST_*`. Checklist
names, container name snapshots, descriptions, notes, item names, and category names are user data
and are never translated.

## Tests

- `test/checklists.test.js` — services against an in-memory database: both modes, ordering and
  reordering, validation and duplicates, pending start, every state change and correction, counts,
  completion and read-only history, run again without touching older runs, snapshots unaffected by
  checklist edits and item renames, deleted items in checklists and runs, checklist deletion keeping
  runs, and the in-place migrations of version 3 and version 4 databases. Phase 2: Last verified only
  on completion of a Verification run and only for Present items (never Packing, Missing, Pending,
  deleted, or taken-back items), the newest time kept whatever order runs complete in, a second
  completion refused, completion and Last verified rolled back together, direct and nested audits
  (each descendant once, never the container, even over a damaged cycle), audits missing from the
  Checklists list, snapshots over moves, renames, and container deletion, item columns, containment,
  and effective location unchanged, and changes addressed by item UUID.
- `test/e2e.test.js` — the HTTP contract (including audits, the inventory-item route, and
  `last_verified_at`), item deletion not blocked, the backup file contents, and persistence over a
  restart. `test/restore.test.js` and `test/reset.test.js` cover restore (Last verified and audit
  history included), the summaries, and the reset of the checklist tables.
- `test/e2e/checklists.spec.js` — the browser workflow (create, add, reorder, start, mark, correct,
  note, reload, pending confirmation, complete, history, run again, old run unchanged), Verification
  labels, deleted items and deleted checklists, the container audit (Never, Audit contents, scope
  choice, Present/Missing, completion, the localized Last verified, Recent audits, Audit history), and
  a phone-width run without horizontal scrolling.

## Limitations

- Entries are always existing inventory items; there are no free-text entries.
- No QR or barcode scanning inside a run yet (the API can already address a run item by item UUID),
  no reminders, schedules, notifications, or collaboration, no automatic suggestions, and no
  AI-generated checklists.
- Checking an item never changes where it is: audits and verification runs record evidence only, with
  no automatic moves, location corrections, or reconciliation of Missing items. There is no manual
  **Mark verified now**; only a completed Verification run records Last verified.
- Completed runs cannot be edited, reopened, or deleted, and in-progress runs cannot be discarded.
