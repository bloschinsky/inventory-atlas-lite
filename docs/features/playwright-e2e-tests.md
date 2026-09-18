# Playwright browser tests

## Summary

A small Chromium test suite drives the real application through the browser, so the Vue client, the
Vite `/api` proxy, Express, and SQLite are verified together. It complements the API acceptance tests
in `test/e2e.test.js` rather than duplicating their validation detail, and it is part of the
development contract: a user-facing change is not finished until its browser coverage is updated.

## User-visible behaviour

This is a developer-facing capability. Contributors run:

```bash
npx playwright install chromium   # once per environment
npm run test:e2e
```

The suite starts its own API and Vite processes, runs the tests, and stops everything afterwards. A
failing test makes the command exit non-zero.

## Implementation overview

- `playwright.config.js` defines the Chromium project, the isolated test ports, and the API and Vite
  processes started for the run. Retries are disabled locally so unstable tests stay visible.
- `test/e2e/run.js` is the launcher behind `npm run test:e2e`: it allocates the ports, creates the
  temporary data directory, passes the environment to the processes, and cleans up on success and on
  failure. `test/e2e/environment.js` and `test/e2e/helpers.js` hold the shared setup.
- Express runs with `DATA_DIR` pointing at a temporary directory, so the suite never reads or writes
  `data/inventory.sqlite`.
- Specs cover the main workflows: `navigation.spec.js` (reaching every page and the folded desktop
  sidebar expanding on hover and on keyboard focus), `categories.spec.js`, `items.spec.js`
  (create, search, edit, delete), `photos.spec.js`, `nesting.spec.js`, `suggestions.spec.js`,
  `backup.spec.js`, `theme.spec.js` (the system colour scheme, an explicit light/dark choice, and its
  persistence), and `responsive.spec.js`, which runs at a `390 x 844` phone viewport and covers the
  offcanvas navigation, the mobile item cards, and the item detail order.
- Tests locate elements by accessible role, label, and visible name, use unique record names, and
  wait for observable UI state instead of fixed sleeps. Generated reports, traces, screenshots, and
  videos are ignored by Git.

## Verification

`npm run test:e2e` runs the suite in Chromium against an isolated application. It is the last step of
the project's standard check sequence:

```bash
npm run lint
npm test
npm run build
npm run test:e2e
```

## Notes and limitations

- Chromium only; there is no cross-browser matrix, no visual regression snapshots, and no CI
  workflow.
- The browser must be installed once with `npx playwright install chromium` before the first run in a
  new environment.
- Detailed API validation and persistence edge cases stay in the `node:test` suite.
