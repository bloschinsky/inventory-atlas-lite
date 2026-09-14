# Playwright end-to-end tests

- Completed: 2026-09-15
- Version: 0.3.0

## Summary

Added a Playwright browser test suite that covers the main Inventory Atlas Lite workflows through the Vue client, the Vite `/api` proxy, Express, and SQLite, and made browser coverage a required part of feature delivery.

## Implemented changes

- Added `@playwright/test` as a development dependency and a root `playwright.config.js` with a single Chromium project, one worker, no retries, and traces and screenshots kept on failure.
- Added the `test:e2e` npm script and the `test/e2e/run.js` launcher. It creates a temporary data directory, publishes it through `E2E_DATA_DIR`, runs Playwright, and removes the directory after the application processes have stopped, including after a failure or interruption.
- Configured Playwright to start Express on port `3456` with `DATA_DIR` pointing at that temporary directory and Vite on port `5456` proxying `/api` to it. Existing servers are never reused, so the working database in `data/` is never involved.
- Added browser tests in `test/e2e/` for navigation, category and custom field creation, item creation with custom values, list search and category filtering, details verification, editing, photo upload, item nesting with parent and contents links, item deletion, and SQLite backup download, plus a 79-byte PNG fixture and small helpers in `helpers.js`.
- Scoped `npm test` to `test/*.test.js` so the Node.js test runner no longer picks up the Playwright specs under `test/e2e/`.
- Associated the item form labels with their inputs and added accessible names to the list filters and the field type select, so the tests locate elements by role and label instead of by test IDs.
- Fixed `ItemDetails.vue`, which kept showing the previous item when navigating between `/items/:id` pages. Following a parent or contents link now reloads the item. The new nesting test caught this bug.
- Ignored `test-results/`, `playwright-report/`, and `blob-report/` in Git.
- Documented the one-time `npx playwright install chromium` step, the `npm run test:e2e` command, and the temporary-database guarantee in `README.md`.
- Added a "Browser test coverage" section to `AGENTS.md` requiring Playwright coverage for every new user-facing feature, listing the test design rules, and extending the final verification sequence with `npm run test:e2e`.
- Raised the version to `0.3.0` because the change adds a new test layer, changes the development workflow contract, and fixes user-facing navigation behavior.

## Verification

- `npm run lint` — passed.
- `npm test` — passed, 2 API acceptance tests.
- `npm run build` — passed.
- `npm run test:e2e` — passed, 7 Playwright tests in Chromium.
- Confirmed that a failing browser test makes `npm run test:e2e` exit with status 1 and that the temporary data directory is still removed afterwards.
