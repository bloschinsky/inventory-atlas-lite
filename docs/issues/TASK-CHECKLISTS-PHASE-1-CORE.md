# TASK: Checklists — Phase 1: Core Checklists and Check Sessions

**Status:** Planned
**Priority:** High
**Type:** Feature / inventory workflow
**Phase:** 1 of 2
**Blocked by:** None

---

## Goal

Add a reusable **Checklists** feature to Inventory Atlas Lite.

A checklist is not just a transient list of checkboxes. It is a reusable template containing references to existing inventory items. Every time the user uses a checklist, the application creates a separate **check session / checklist run** so previous results remain available as history.

Primary use cases:

1. **Packing checklist** — verify that a set of items has been collected for a trip, job, event, etc.
2. **Inventory verification checklist** — verify that expected inventory items are physically present.

Example:

```text
Film Trip Kit

Nikon F100
Nikon FM2
35mm f/2
50mm f/1.8
SB-28
Light meter
```

Running it creates a separate session:

```text
Film Trip Kit
Started: 2026-09-28 19:40

5 / 6 confirmed

✓ Nikon F100
✓ Nikon FM2
✓ 35mm f/2
✓ 50mm f/1.8
! SB-28 — Missing
✓ Light meter
```

Running the checklist again must create a new session instead of resetting or overwriting the previous result.

---

## Product model

Keep these concepts separate:

```text
Checklist
    ↓ reusable definition
Checklist Items
    ↓ expected inventory items
Checklist Run
    ↓ one concrete execution/session
Checklist Run Items
    ↓ per-item state captured for that run
```

Do not add a global `checked` boolean to `items`.

The same inventory item may be:

- packed in one run;
- missing in another;
- present in a later verification;
- included in multiple different checklists.

Checklist state therefore belongs to a run, not directly to the item.

---

## Checklist modes

Support two checklist modes.

### 1. Packing

Purpose:

```text
What do I need to take / pack?
```

Visible item states:

```text
Pending
Packed
Missing
```

### 2. Verification

Purpose:

```text
Are the expected items physically present?
```

Visible item states:

```text
Pending
Present
Missing
```

Internally, it is acceptable and preferred to use one shared normalized state model such as:

```text
pending
confirmed
missing
```

and derive the visible label from checklist mode:

```text
packing      confirmed -> Packed
verification confirmed -> Present
```

Do not create two independent run engines.

---

## Database model

Add normalized SQLite tables for checklists.

Exact names may vary only if the project conventions strongly justify it. Preferred schema:

```text
checklists
checklist_items
checklist_runs
checklist_run_items
```

### `checklists`

Minimum fields:

```text
id
name
description
mode
created_at
updated_at
```

`mode` must be restricted to:

```text
packing
verification
```

### `checklist_items`

Minimum fields:

```text
id
checklist_id
item_id
item_name_snapshot
sort_order
created_at
```

Requirements:

- `checklist_id` references `checklists` with `ON DELETE CASCADE`;
- `item_id` references `items` but must not prevent normal item deletion;
- prefer `ON DELETE SET NULL` for `item_id`;
- keep `item_name_snapshot` so the checklist can still explain which item used to be referenced if the inventory item is later deleted;
- prevent duplicate live item references inside one checklist unless a strong UX reason is documented;
- preserve explicit user order with `sort_order`.

A deleted inventory item should appear as an unavailable/deleted checklist entry rather than silently disappearing.

### `checklist_runs`

Minimum fields:

```text
id
checklist_id
checklist_name_snapshot
mode
status
started_at
completed_at
created_at
```

Recommended statuses:

```text
in_progress
completed
```

A run must remain understandable even if the original checklist is later renamed or deleted.

Prefer allowing `checklist_id` to become `NULL` on checklist deletion while preserving the run history.

### `checklist_run_items`

Minimum fields:

```text
id
run_id
item_id
item_name_snapshot
position
status
checked_at
note
```

Requirements:

- snapshot the run's item membership when the run is created;
- editing the reusable checklist later must not alter an existing run;
- `status` is one of:

```text
pending
confirmed
missing
```

- `checked_at` records the most recent moment that run item was explicitly marked `confirmed` or `missing`;
- returning an item to `pending` clears or appropriately resets its active check timestamp;
- `note` is optional and intended for a short run-specific remark;
- item deletion after a run must not destroy historical run data.

Update `SCHEMA_VERSION`, `CURRENT_SCHEMA`, restore validation, fresh database creation, and migrations according to the project's existing SQLite schema lifecycle.

Existing databases must migrate in place without inventory data loss.

---

## Checklist deletion and historical runs

Deleting a reusable checklist must not silently destroy completed run history.

Preferred behavior:

```text
Delete checklist template
    ↓
checklist definition + checklist_items removed
    ↓
historical checklist_runs remain readable
```

Use snapshots so completed history remains meaningful.

If project architecture makes this implementation unnecessarily complex, an alternative is acceptable only if:

- the deletion behavior is explicit to the user;
- historical runs are not silently lost;
- tests cover the chosen behavior.

---

## Backend architecture

Follow the current backend structure and existing OOP/SOLID project rules.

Prefer dedicated layers such as:

```text
checklistRoutes
checklistService
checklistRepository
```

and equivalent run-specific service/repository methods where appropriate.

Do not place raw SQL directly throughout route handlers.

Do not mix checklist logic into unrelated item CRUD code.

Reuse existing item lookup/search patterns where practical.

---

## Suggested API

Exact endpoint naming may follow project conventions, but the API should cover these capabilities.

### Checklist CRUD

```text
GET    /api/checklists
POST   /api/checklists
GET    /api/checklists/:id
PUT    /api/checklists/:id
DELETE /api/checklists/:id
```

### Checklist item membership

The create/update API may accept an ordered array of item IDs, or dedicated item endpoints may be used.

Required behavior:

- add inventory items;
- remove checklist items;
- reorder checklist items;
- validate unknown IDs;
- prevent accidental duplicates;
- return lightweight current item summaries where the linked item still exists.

### Runs

Suggested:

```text
POST /api/checklists/:id/runs
GET  /api/checklists/:id/runs
GET  /api/checklist-runs/:runId
PATCH /api/checklist-runs/:runId/items/:runItemId
POST /api/checklist-runs/:runId/complete
```

A new run must be created from a snapshot of the checklist as it exists at that moment.

Do not make the frontend submit or recreate the snapshot itself.

The server is authoritative.

---

## Run behavior

### Start

From a checklist:

```text
[ Start checklist ]
```

Create a new run.

All run items begin as:

```text
Pending
```

### During a run

Each row must support fast state changes.

Packing:

```text
Pending -> Packed
Pending -> Missing
```

Verification:

```text
Pending -> Present
Pending -> Missing
```

Allow correcting mistakes before completion.

Changes should persist immediately so reloading the page does not lose progress.

Show progress, for example:

```text
7 / 9 checked
6 confirmed
1 missing
2 pending
```

Do not count `Missing` as `confirmed`, but it does count as explicitly checked.

### Completion

Allow:

```text
[ Complete checklist ]
```

If pending items remain, show a concise confirmation:

```text
3 items are still pending.
Complete this run anyway?
```

Completion stores `completed_at`.

A completed run is historical data.

Completed runs should be read-only by default.

If editing completed runs is intentionally supported, document and test the semantics; otherwise do not add it.

### Run again

From a checklist or completed run:

```text
[ Run again ]
```

Create a completely new run with all entries reset to `Pending`.

Never erase/reset the old run.

---

## Checklists UI

Add a top-level **Checklists** section to the application navigation.

Use existing Tabler patterns and responsive behavior.

Minimum screens / states:

### Checklist list

Show:

```text
Name
Mode
Items
Last run
Last result / progress
```

Actions:

```text
Open
Start
Edit
Delete
```

Provide a clear empty state.

### Create / Edit checklist

Fields:

```text
Name
Description
Mode
Items
```

Item picker requirements:

- search existing items;
- show enough context to distinguish similarly named items;
- category and effective/current location are useful secondary context where already available;
- add multiple items without reopening the entire form each time;
- remove selected items;
- reorder items;
- do not create inventory items from this dialog in Phase 1.

### Checklist details

Show:

- checklist name;
- description;
- mode;
- ordered expected items;
- Start / Run again action;
- recent run history.

### Active run

Optimize for quick phone/tablet use.

Each run item should have:

- item name;
- optional small thumbnail when cheap to provide;
- current state;
- quick state controls;
- optional note;
- link/open-item action when the referenced item still exists.

Large touch targets are preferred.

Do not require opening each Inventory Item page to mark it.

### Run history

Show completed and in-progress runs with:

```text
date/time
status
confirmed count
missing count
pending count
```

Opening a historical run shows the captured snapshot and result.

---

## Deleted and changed inventory items

Checklist behavior must remain predictable when inventory changes.

### Item renamed

Reusable checklist may show the current live name while retaining snapshot fallback.

Existing run history must keep the run snapshot name so history does not retroactively change.

### Item deleted

Do not block item deletion solely because it appears in a checklist.

Template entry becomes unavailable/deleted and can be removed or replaced by the user.

Historical run entry remains readable through its snapshot.

### Item moved to another container/location

Checklist membership must remain unchanged.

Checklists reference item identity, not current location.

---

## Ordering

Checklist item order is user-controlled.

Support at minimum:

- move up/down controls; or
- drag/drop reorder with a non-drag accessible fallback.

The persisted order must be stable across reloads.

Do not sort checklist entries alphabetically behind the user's back.

---

## Responsive and accessibility requirements

This feature is expected to be useful on a phone while physically handling inventory.

Requirements:

- no mandatory horizontal page scrolling;
- status actions remain usable at narrow widths;
- state must not be conveyed only by color;
- keyboard users can change status and reorder/edit checklist membership;
- touch targets must be practical;
- destructive actions require the same level of confirmation used elsewhere in the app.

---

## Localization

All new user-facing strings must use the existing i18n system.

Add keys to every locale present in the repository at implementation time and keep locale completeness validation passing.

Do not translate:

- user-created checklist names;
- notes;
- inventory item names;
- category names;
- other user data.

---

## Backup / Restore

Checklist tables are part of the main SQLite database.

Therefore normal database backup/restore and cloud backup must preserve:

- checklist definitions;
- item membership;
- run history;
- run item states.

Add regression coverage proving checklist data survives a database snapshot/restore path where existing test infrastructure makes this practical.

Do not create a separate checklist storage file.

---

## Tests

Add automated coverage for at least:

1. create packing checklist;
2. create verification checklist;
3. add multiple inventory items;
4. duplicate item membership is rejected/prevented;
5. reorder checklist items and preserve order after reload;
6. edit checklist without changing existing run snapshots;
7. start a new run with all items pending;
8. mark packing item as Packed;
9. mark verification item as Present;
10. mark item Missing;
11. correct a run item state before completion;
12. progress counters are correct;
13. complete a run;
14. pending-items completion warning works;
15. completed run remains readable;
16. Run again creates a new independent run;
17. old run is not reset/overwritten;
18. renaming an inventory item does not rewrite historical run snapshot names;
19. deleting an inventory item does not destroy run history;
20. deleted item is clearly represented in a reusable checklist;
21. deleting a checklist follows the documented history-preservation rule;
22. checklist data survives application restart;
23. checklist data is included in normal SQLite backup/restore;
24. responsive active-run workflow works at phone width;
25. all existing inventory, hierarchy, backup, and item CRUD tests continue to pass.

Add E2E coverage for one complete workflow:

```text
create checklist
→ add items
→ start run
→ mark confirmed/missing
→ complete
→ inspect history
→ run again
```

---

## Documentation

Add:

```text
docs/features/checklists.md
docs/changes/<date>-checklists-phase-1.md
```

Update as appropriate:

```text
docs/HOW-TO.md
docs/features/README.md
docs/ROADMAP.md
```

Document:

- difference between checklist template and run;
- packing vs verification mode;
- history behavior;
- deleted-item behavior;
- backup behavior;
- Phase 1 limitations.

---

## Acceptance Criteria

1. A top-level Checklists section exists.
2. Users can create, edit, reorder, and delete reusable checklists.
3. A checklist references existing Inventory Atlas items rather than copying them into a second inventory.
4. Packing and Verification modes are supported.
5. Starting a checklist creates a new independent run snapshot.
6. Run item states support Pending, Confirmed, and Missing with mode-specific labels.
7. Run progress is persisted immediately.
8. Completing a run creates durable history.
9. Run again creates a new run and never resets old history.
10. Inventory item rename/delete does not corrupt historical runs.
11. Item deletion is not blocked merely because the item is in a checklist.
12. Checklist data is stored in the main SQLite database and survives normal backup/restore.
13. UI is practical on desktop and phone.
14. Existing inventory behavior is unchanged.
15. All new UI is localized through the current i18n system.
16. Lint, unit/integration tests, build, and E2E pass.

---

## Out of Scope

Do not add in Phase 1:

- global `items.checked` boolean;
- `last_verified_at` on items;
- automatic container audit generation;
- automatic Location changes;
- automatic parent/container changes;
- QR scanning inside a checklist;
- barcode scanning;
- AI-generated checklists;
- notifications/reminders;
- scheduled recurring audits;
- collaborative/multi-user assignment;
- arbitrary free-text checklist entries not linked to inventory items;
- automatic packing suggestions.
