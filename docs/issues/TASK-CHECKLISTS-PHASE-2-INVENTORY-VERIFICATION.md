# TASK: Checklists — Phase 2: Inventory Verification and Container Audits

**Status:** Planned
**Priority:** High
**Type:** Feature / inventory verification
**Phase:** 2 of 2
**Blocked by:** `TASK-CHECKLISTS-PHASE-1-CORE.md`

---

## Goal

Integrate Phase 1 Checklists with Inventory Atlas inventory state so checklists can be used as real physical inventory audits.

Phase 2 adds:

1. item-level **Last verified** information;
2. one-click **Audit contents** from a container/item with children;
3. generation of a verification checklist/run from current container contents;
4. durable audit history without modifying stored Location or hierarchy;
5. an API/domain boundary that can later be reused by QR-based verification without implementing QR workflow in this task.

Primary example:

```text
Box B4
Contents: 17 items

[ Audit contents ]
```

creates a verification session:

```text
Audit: Box B4
Expected: 17

Present: 16
Missing: 1
Pending: 0
```

Completing the audit updates `Last verified` only for items actually confirmed as present.

---

## Dependency

Do not start this task until Phase 1 is complete.

Phase 2 must reuse:

- `checklists`;
- checklist item membership model;
- checklist runs;
- run item state engine;
- run history;
- existing `items.parent_item_id` hierarchy;
- existing server-side hierarchy/domain rules;
- existing effective Location behavior.

Do not create a second audit/run system.

---

## 1. Last verified

Add a nullable field to inventory items:

```text
last_verified_at
```

Preferred storage:

```text
TEXT / ISO-compatible timestamp
```

Use the same timestamp conventions as the rest of the project.

Update:

- schema creation;
- additive migration;
- `CURRENT_SCHEMA`;
- schema version;
- restore validation;
- item repository/domain mapping;
- relevant item API responses;
- backup/restore regression coverage.

Existing items begin with:

```text
last_verified_at = NULL
```

---

## Semantics

`last_verified_at` means:

> The most recent time Inventory Atlas recorded this item as physically present during a completed verification workflow.

It must NOT mean:

- item record created;
- item edited;
- item moved;
- checklist opened;
- item marked Packed in packing mode;
- item merely included in an audit.

Only an explicit successful physical verification may update it.

---

## When Last verified is updated

Do not update `last_verified_at` while the verification run is still being edited.

Preferred behavior:

```text
Verification run
    ↓
user marks items Present / Missing
    ↓
user completes run
    ↓
single transaction:
    complete run
    + update last_verified_at for Present items only
```

This avoids confusing rollback semantics if the user changes `Present` back to `Pending` before completion.

For each run item with final status:

```text
confirmed / Present
```

set:

```text
items.last_verified_at = verification timestamp
```

Use the run item's `checked_at` where valid, or a consistently documented completion timestamp.

Do not update `last_verified_at` for:

```text
Missing
Pending
deleted/unlinked historical item
```

Packing checklist completion must never update it.

---

## Completed run immutability

Completed verification runs should remain read-only as established in Phase 1.

This is important because `last_verified_at` is derived from a completed verification event.

Do not allow a completed audit to be silently edited into a contradictory historical result.

If the application later needs corrections, the user should normally run a new verification.

---

## Item Details UI

Add a universal read-only row:

```text
Last verified
Sep 28, 2026, 19:46
```

If never verified:

```text
Last verified
Never
```

Use locale-aware date/time formatting.

Do not expose this as a normal editable text/date field in Add/Edit Item.

The value is workflow-generated.

It may also be displayed in item list/table/card column controls if the current column chooser architecture makes this clean, but the Item Details display is mandatory.

Do not overcrowd the default Items table solely for this task.

---

## 2. Audit contents

For an item/container that currently has child items, add:

```text
[ Audit contents ]
```

Primary surface:

```text
Item Details → Contents
```

The action creates a **Verification** run from current hierarchy contents.

Do not require the user to manually build a checklist first.

---

## Audit creation model

An audit generated from a container is a snapshot.

Example:

```text
Box B4
├─ Nikon F100
├─ Nikon FM2
└─ Pouch
   ├─ Batteries
   └─ Cable
```

The audit must capture the expected items at the moment it starts.

Moving items after the audit starts must not rewrite that active/historical run.

---

## Direct vs recursive contents

Support both scopes when nested contents exist.

Suggested dialog:

```text
Audit Box B4

Scope
(o) Direct contents
( ) All nested contents

Direct contents: 3
All nested contents: 5

[ Start audit ]
```

Default:

```text
Direct contents
```

Definitions:

### Direct contents

Include only items whose:

```text
parent_item_id = BoxB4.id
```

### All nested contents

Include every descendant recursively.

Do not include the audited container itself.

Use the existing hierarchy model / recursive query patterns.

Do not build recursion in the browser from partially loaded item data if the backend already has authoritative hierarchy access.

If there are no nested descendants beyond direct children, a scope selector is unnecessary.

---

## Generated audit naming

Use a clear default name such as:

```text
Audit: Box B4
```

or localized equivalent.

Keep a snapshot of the container name on the run/checklist data needed for history.

If the container is later renamed, old audit history must still be understandable.

---

## Reusable checklist vs ad-hoc audit

An Audit Contents action does not need to clutter the user's reusable Checklists list with a permanent template.

Preferred model:

```text
ad-hoc verification run
```

or an equivalent system-owned/generated checklist representation that is not shown as a normal reusable checklist unless intentionally saved.

The user should not end up with dozens of permanent entries such as:

```text
Audit Box B4
Audit Box B4
Audit Box B4
...
```

after repeated audits.

However, completed audit history must remain accessible.

Acceptable implementations:

### Preferred

Allow `checklist_runs` to represent a generated/ad-hoc source with enough snapshot metadata.

### Alternative

Create a hidden/system-generated checklist source.

If the alternative is used:

- it must not pollute the normal reusable checklist list;
- lifecycle behavior must be documented;
- deleting inventory containers must not destroy historical audits.

Do not duplicate the run engine.

---

## Audit history

Container Item Details should provide a lightweight way to see recent audits for that container.

Example:

```text
Recent audits

Sep 28, 2026  16/17 present  1 missing
Aug 12, 2026  17/17 present
```

A full audit opens the normal Phase 1 historical run view.

Keep this UI compact.

Do not add a completely separate audit-history application.

---

## Container association

Historical audits should retain enough information to answer:

```text
Which container was this audit for?
```

Do not rely solely on the container's current name.

Preferred fields/metadata:

```text
source_container_item_id
source_container_name_snapshot
audit_scope
```

The live container reference may become `NULL` on item deletion, but history must remain readable.

Do not block container deletion just because old audits exist.

---

## Transaction safety

Completing a verification audit must be atomic.

Within one SQLite transaction:

1. validate the run is still `in_progress`;
2. finalize run status and `completed_at`;
3. determine final Present/confirmed run items;
4. update `items.last_verified_at` for linked existing items;
5. commit all changes together.

If any part fails, do not leave:

```text
completed run
+
partially updated last_verified_at
```

or the reverse.

---

## Concurrency and stale hierarchy

Audit creation uses current database state at creation time.

After creation, the run is a snapshot.

Example:

```text
Start audit for Box B4
→ expected Camera A, Lens B, Flash C
→ someone moves Flash C elsewhere
→ active audit still expects Flash C
```

This is correct.

The run records what was expected when the audit began.

Do not live-reconcile run membership while the user is checking items.

---

## Location and hierarchy behavior

Verification must not mutate inventory organization.

Completing an audit must NOT automatically:

- move a Present item into the audited container;
- remove a Missing item from its container;
- rewrite `location`;
- rewrite `parent_item_id`;
- rewrite effective Location;
- delete missing items.

A physical audit records evidence.

It does not silently change inventory structure.

Future dedicated reconciliation workflows may handle discrepancies separately.

---

## Missing items

A Missing result is historical information only in this phase.

Do not automatically change:

```text
condition
location
transferred_to
parent_item_id
```

Optionally provide an item link so the user can manually decide what to do afterward.

---

## Manual verification outside a checklist

Do not add a generic one-click:

```text
Mark verified now
```

to every item in this phase unless required by implementation architecture.

The core verification source is a completed Verification checklist/audit.

This keeps `last_verified_at` meaningful and traceable to an actual check workflow.

---

## API / domain design for future QR support

QR scanning is out of scope, but do not make the run API depend on UI row positions.

A future scanner should be able to resolve:

```text
item UUID / item ID
→ active run item
→ mark Present
```

Therefore provide or structure domain methods so run item state can be updated by stable inventory identity.

Do not implement camera access or QR scanning here.

Do not couple QR code secrets/URLs into checklist tables.

---

## Checklists list integration

Reusable Verification checklists continue to behave as in Phase 1.

When a reusable Verification run completes:

- confirmed/Present items update `last_verified_at`;
- Missing/Pending do not.

Packing mode remains unchanged.

Generated container audits may appear in a separate history filter/category such as:

```text
Audit history
```

or alongside run history with a clear source label.

Avoid clutter.

---

## Dashboard integration

Do not add a full audit dashboard in this task.

However, if the current Dashboard can accept one lightweight metric with little complexity, an optional metric is acceptable:

```text
Items never verified
```

This is not required for acceptance.

Do not expand scope into recurring compliance/reporting analytics.

---

## Localization

Add all new strings through the existing i18n system.

Examples:

```text
Last verified
Never
Audit contents
Direct contents
All nested contents
Present
Missing
Audit history
```

Update every locale present at implementation time and keep translation completeness checks passing.

User-created names and historical snapshots remain unchanged.

---

## Tests

Add automated coverage for at least:

1. existing database migrates with `last_verified_at = NULL`;
2. new item starts with `last_verified_at = NULL`;
3. packing run completion does not update Last verified;
4. in-progress verification run does not update Last verified;
5. completed verification run updates Present items;
6. Missing item is not updated;
7. Pending item is not updated;
8. multiple verification runs keep the newest verification timestamp;
9. completing the same run twice is rejected/idempotently safe;
10. run completion + Last verified updates are atomic;
11. Item Details shows Never before first verification;
12. Item Details shows localized timestamp afterward;
13. Audit contents generates expected direct children;
14. recursive audit includes all descendants exactly once;
15. recursive audit does not include the audited container itself;
16. generated audit is a snapshot and does not change when hierarchy changes afterward;
17. generated audits do not pollute normal reusable checklist list;
18. container rename does not rewrite old audit snapshot name;
19. container deletion does not destroy audit history;
20. audit completion does not change `parent_item_id`;
21. audit completion does not rewrite saved Location;
22. effective Location behavior remains unchanged;
23. backup/restore preserves Last verified and audit history;
24. existing hierarchy cycle protection and nested-item behavior remain unchanged;
25. Phase 1 checklist E2E flows still pass.

Add E2E coverage for:

```text
open container
→ Audit contents
→ choose scope
→ mark Present / Missing
→ complete
→ inspect Last verified on a Present item
→ inspect recent audit history
```

---

## Documentation

Update:

```text
docs/features/checklists.md
docs/features/nested-items.md
docs/HOW-TO.md
docs/features/README.md
docs/ROADMAP.md
```

Add:

```text
docs/changes/<date>-checklists-phase-2-inventory-verification.md
```

Document:

- meaning of Last verified;
- when it changes;
- packing vs verification behavior;
- direct vs recursive container audit;
- snapshot semantics;
- Missing behavior;
- no automatic hierarchy/location mutation;
- QR integration explicitly remains future work.

---

## Acceptance Criteria

1. Phase 1 Checklists is complete first.
2. Items have a nullable workflow-generated `last_verified_at`.
3. Item Details displays Last verified / Never.
4. Packing checklists never update Last verified.
5. In-progress verification runs do not update Last verified.
6. Completing a verification run atomically updates Last verified for Present items only.
7. Containers with contents expose Audit contents.
8. Audit creation can use direct contents and all nested contents.
9. Audit membership is snapshotted at start.
10. Repeated container audits do not pollute the reusable Checklists list.
11. Container rename/delete does not destroy historical audit meaning.
12. Missing results do not automatically mutate inventory hierarchy or Location.
13. Existing nesting and effective Location behavior remain unchanged.
14. Data survives restart and normal SQLite backup/restore.
15. API/domain design is compatible with future QR-driven verification without implementing QR now.
16. Lint, tests, build, and E2E pass.

---

## Out of Scope

Do not add in Phase 2:

- QR camera/scanner workflow;
- barcode scanner workflow;
- AI verification;
- image-recognition verification;
- automatic moving of Present items;
- automatic removal/movement of Missing items;
- automatic Location correction;
- recurring/scheduled audits;
- notifications;
- user accounts/assignment;
- audit compliance reports;
- geolocation;
- Bluetooth/NFC verification.
