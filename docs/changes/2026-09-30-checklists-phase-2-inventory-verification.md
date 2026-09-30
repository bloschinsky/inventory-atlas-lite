# Checklists, Phase 2: inventory verification and container audits

- **Completed:** 2026-09-30
- **Version:** 0.47.0

## Summary

- **Last verified:** schema version 5 adds the nullable `items.last_verified_at` (created for new
  databases, added in place to existing ones and to older backups on their staged restore copy, part of
  `CURRENT_SCHEMA`). It is written only when a Verification run is completed, for its Present
  (`confirmed`) run items that are still linked to an item, with the run item's `checked_at`; an item
  keeps a newer value it already has. `ChecklistRunRepository.recordVerifiedItems()` does it in one
  `UPDATE ... FROM` statement inside the completion transaction, so the run and the timestamps are
  written together or not at all. Packing runs, in-progress runs, Missing, Pending, and deleted items
  never change it, and no other item column (including `updated_at`) is touched. Item details show a
  read-only **Last verified** row with the localized time, or **Never**.
- **Container audits:** `checklist_runs` gains `source` (`checklist`/`container_audit`),
  `source_container_item_id` (`ON DELETE SET NULL`), `source_container_name_snapshot`, and
  `audit_scope` (`direct`/`nested`). An audit is an ad-hoc Verification run with no checklist, so the
  one run engine, run page, and history table serve it and the reusable Checklists list stays clean.
  `POST /api/items/:id/audits` copies the direct or all nested contents on the server in one recursive
  SQL statement (each descendant once, under its own container with siblings by name, never the
  container, a depth guard and de-duplication against damaged cycles); `GET /api/items/:id/audits`
  lists a container's audits. The run is a snapshot of what the container held at the start; completing
  it never changes `parent_item_id`, `location`, or the effective location.
- **Future QR support:** `PATCH /api/checklist-runs/:runId/inventory-items/:itemId` changes a run item
  addressed by the inventory item's id or UUID (`ChecklistRunService.updateInventoryItem`), sharing the
  validation of the run-item route. No scanning was added and no QR data is stored.
- API: run summaries and runs gain `source`, `container_id` (live link), `container_name` (snapshot),
  and `audit_scope`; `GET /api/items/:id` gains `descendant_count`. New errors
  `CHECKLIST_AUDIT_SCOPE_INVALID` and `CHECKLIST_AUDIT_NO_CONTENTS`.
- Frontend: **Audit contents** in the item's **Contents** section opens the new
  `AuditContentsDialog.vue` (item count, **Scope** with Direct/All nested contents and their counts
  when the contents are nested deeper, **Start audit**). Item details list **Recent audits** (five
  newest, through `ChecklistRunHistory.vue`). The run page titles an audit **Audit: <container>**,
  shows the scope, offers **Back to container** and **Run again** with the same scope, and says when
  the container was deleted. The Checklists page lists audits under **Audit history**, separate from
  **Runs of deleted checklists**. New `checklists.audit.*`, `itemDetails.lastVerified`,
  `itemDetails.neverVerified`, and error messages in English and Ukrainian.
- Documentation: `docs/features/checklists.md` (Last verified, container audits, storage and API,
  tests, limitations), `docs/features/nested-items.md`, `docs/features/database-backup-and-restore.md`
  (schema version 5), `docs/features/README.md`, `docs/HOW-TO.md` (concepts, Last verified, new
  *Audit the contents of a container* section, limitations), `docs/ROADMAP.md`, `AGENTS.md`, and the
  0.47.0 release-history entry. The completed task file
  `docs/issues/TASK-CHECKLISTS-PHASE-2-INVENTORY-VERIFICATION.md` was removed.
- Not added, as allowed by the task: the optional *Items never verified* Dashboard metric and a Last
  verified column in the Items list.

## Verification

- `npm run lint` — passed.
- `npm test` — 229 tests: 228 passed, 1 skipped (shellcheck is not installed locally).
  `test/checklists.test.js` adds 7 tests: the version 4 → 5 migration, Last verified only for Present
  items of a completed Verification run (never Packing, in-progress, Missing, Pending, taken-back, or
  deleted items; no other item column changed), the newest time kept whatever order runs complete in,
  a second completion refused, completion rolled back together with a failing Last verified update,
  direct and nested audits and their errors, audits absent from the Checklists list, snapshots over
  moves, renames, and container deletion with hierarchy, location, and cycle protection unchanged,
  changes by item UUID, and a nested audit over a damaged cycle. `test/e2e.test.js` covers the audit
  routes, the inventory-item route, `last_verified_at`, and persistence over a restart;
  `test/restore.test.js` seeds a completed audit and checks that restore brings back Last verified and
  the audit history; the schema-version expectations of the restore and reset tests are now 5.
- `npm run build` — passed.
- `npm run test:e2e` — 112 passed, 7 failed before committing: all 7 in `whats-new.spec.js`, because
  Vite takes the version from the `v0.46.1` tag on `HEAD` while the newest release-history entry is
  0.47.0. With `APP_VERSION=0.47.0`, `whats-new.spec.js`, `version-history.spec.js`, and
  `about.spec.js` passed (21 tests). The new test in `test/e2e/checklists.spec.js` covers Never on an
  item, Audit contents, the scope choice, Present/Missing, completion, the localized Last verified on a
  Present item and Never on a Missing one, Recent audits on the container, and Audit history on the
  Checklists page; the three Phase 1 checklist tests still pass.
- The UI was exercised through the Playwright workflow against an isolated test database; no separate
  manual `npm run dev` check was done.
