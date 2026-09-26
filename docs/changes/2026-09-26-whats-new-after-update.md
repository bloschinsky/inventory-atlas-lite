# What's New after update

- **Completed:** 2026-09-26
- **Version:** 0.38.0

## Summary

- New `client/src/components/WhatsNewDialog.vue`: a one-time Tabler modal on the first launch after
  the running version changes, listing every release with `lastSeen < version <= current`, newest
  first, from the same `shared/release-history.json` that Version History reads. **Got it**, the **×**,
  `Escape`, and a backdrop click all acknowledge; **View full changelog** acknowledges and opens About
  with Version History over it.
- New `client/src/whatsNew.js`: the `inventory-atlas.lastSeenVersion` browser-storage key, the
  decision rules (fresh install, same version, downgrade, invalid value, missing history entry,
  blocked storage), and the acknowledgement. Detection compares versions, so it works for every update
  method.
- `server/src/update/semver.js` moved to `shared/semver.js` so the updater and the client share one
  semantic version comparison; `shared/releaseHistory.js` gained `releasesSince()`.
- New `whatsNew.*` strings in English and Ukrainian, and a release-history entry for 0.38.0.
- Documentation: new `docs/features/whats-new-after-update.md` and its index entry; updates to
  `docs/HOW-TO.md`, `docs/features/version-history.md`, `docs/features/self-update.md`,
  `docs/ROADMAP.md`, and `AGENTS.md`. The completed task file
  `docs/issues/TASK-WHATS-NEW-AFTER-UPDATE.md` was removed.

## Verification

- `npm run lint` — passed.
- `npm test` — 155 tests: 154 passed, 1 skipped (shellcheck is not installed locally), including the
  new `test/whatsNew.test.js`.
- `npm run build` — passed.
- `npm run test:e2e` — 102 passed, including the new `test/e2e/whats-new.spec.js` (fresh profile,
  single and multi-version updates, phone layout and scrolling, every dismissal path, View full
  changelog, downgrade, invalid value, blocked storage, Ukrainian) and the unchanged About and Version
  History specs.
