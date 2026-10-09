# OpenAI model groups follow the version order

- Completed: 2026-10-09
- Version: 0.62.1
- Follows: #29 (0.62.0)

## Summary

In 0.62.0 the *Recommended / Latest* group of the OpenAI model selector held the newest generation
**and** every verified model. With GPT-6.1, GPT-6, GPT-5.6, and GPT-5.5 available, the verified
GPT-5.6 models were shown under *Recommended / Latest* above GPT-6, which was labelled *Previous
generations*: the list was no longer ordered by version and the group names were wrong.

- `server/src/integrations/openAiModelCatalog.js` now groups by version alone: *Recommended /
  Latest* is the newest generation, and *Previous generations* lists the older ones newest first. A
  verified model keeps its place by version, keeps its *(verified)* mark and known capabilities, and
  is always part of the compact view (room is reserved for it); it is recommended only when it
  belongs to the newest generation.
- The unit and Playwright tests that had encoded the old grouping now expect the version order, and a
  regression test uses the reported listing and checks that no compact entry ranks above a newer
  one.
- `docs/features/ai-providers.md` and both user guides describe the corrected groups.

## Verification

- `npm run lint` — passed.
- `npm test` — 348 of 351 passed, 2 failed, 1 did not run. The two failures are the known Windows-only guide
  tests in `test/landing.test.js`, which fail the same way on the unchanged files.
- `npm run build` — passed.
- `APP_VERSION=0.62.1 npm run test:e2e` — 235 passed, 1 failed: `condition-grading.spec.js` "the info
  button beside Condition opens the grading help…", where the folded-hover sidebar intercepts the
  click. It fails the same way with this change stashed and passed in the 0.62.0 run, so it is an
  unstable test unrelated to this fix. All `openai-model-selector.spec.js` tests passed.
