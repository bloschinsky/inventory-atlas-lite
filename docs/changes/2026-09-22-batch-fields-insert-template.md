# Insert Template in Batch Add Fields

- **Completed:** 2026-09-22
- **Version:** 0.20.1

## Summary

**Batch Add Fields** now offers an **Insert Template** action under the JSON editor. It writes the
example field-definition document that the editor already shows as its placeholder into the editor
itself and focuses it, so the example can be edited instead of retyped.

- The template is the existing `example` constant built from `fieldDefinitionDocument(...)`, so the
  placeholder and the inserted content remain one source and cannot drift apart.
- An empty editor is filled immediately. An editor holding different, non-empty text asks for
  confirmation with the same plain `confirm` used elsewhere in the client; cancelling leaves the
  current JSON untouched.
- The action is rendered only in JSON mode. **AI Add Fields** takes a natural-language description,
  so it does not show it.
- No clipboard API is involved, which keeps the workflow usable over plain HTTP on a local network.
- The preview, review, and create flow is unchanged.

## Changed files

- `client/src/components/BatchAddFieldsDialog.vue` — `insertTemplate()` and the secondary action.
- `test/e2e/categories.spec.js` — new Playwright coverage for the action.
- `docs/features/batch-add-fields.md`, `docs/HOW-TO.md`, `docs/ROADMAP.md` — documentation.
- `docs/issues/TASK-batch-fields-insert-template.md` — deleted; the task is implemented.
- `package.json`, `package-lock.json` — version `0.20.1`.

## Verification

- `npm run lint` — passed.
- `npm test` — 64 passed, 1 skipped, 0 failed.
- `npm run build` — client built successfully.
- `npm run test:e2e` — 43 Playwright tests passed in Chromium, including the new
  `insert template fills the batch editor with the canonical example and protects existing JSON`.
