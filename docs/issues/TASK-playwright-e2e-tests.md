# CODEX TASK — Add Playwright End-to-End Tests

## Goal

Add a small, reliable Playwright test suite that verifies the main **Inventory Atlas Lite** workflows through the browser.

Make browser end-to-end coverage part of the development contract: every new user-facing feature must add or update a relevant Playwright test, and the Playwright suite must be run as one of the final checks while developing the feature.

Keep the existing Node.js API acceptance tests. Playwright should complement them by testing that the Vue client, Vite development server, Express API, and SQLite persistence work together from a user's perspective.

---

## Test setup

- Add `@playwright/test` as a development dependency.
- Add a root `playwright.config.js` using the project's existing ES module style.
- Test Chromium initially. Do not add a cross-browser matrix until the project has a concrete need for it.
- Add an npm script named `test:e2e` that runs the Playwright suite.
- Configure Playwright to start and stop the application automatically for local test runs.
- Use the Vite client and its `/api` proxy so tests exercise the same development path used by contributors.
- Allocate test ports explicitly and keep them separate from the normal development ports where practical.
- Run Express with `DATA_DIR` pointing to a temporary test directory. Never read from or write to the working database under `data/`.
- Start each test run with a clean database and remove its temporary data after the run.
- Keep test configuration portable across Windows, macOS, and Linux. Do not rely on shell-specific environment variable syntax in npm scripts.
- Store Playwright tests and their small fixtures in a clearly named project directory such as `test/e2e/`.
- Ignore generated Playwright reports, traces, screenshots, videos, and temporary test data in Git.

If a small Node.js launcher is needed to allocate ports, create the temporary data directory, and pass environment variables to the development processes, keep it focused on the end-to-end test lifecycle.

---

## Initial browser coverage

Cover the application's main successful workflows through visible UI interactions:

1. open the application and navigate through the primary pages;
2. create a category and its custom fields;
3. create an item and enter its standard and custom-field values;
4. find the item through the items list search and filters;
5. open the item details page and verify its saved values;
6. edit the item and verify the updated values;
7. upload a small supported image and verify that it is shown;
8. place an item inside another item and verify the parent and direct contents links;
9. delete an item through the UI and verify that it disappears;
10. download a SQLite backup and verify that the browser receives a non-empty file.

The suite may split these checks into a few independent tests. Prefer clear user workflows over one large test that makes failures difficult to diagnose.

Retain detailed API validation and persistence edge cases in the existing `node:test` suite. Do not duplicate every API assertion in Playwright.

---

## Test design rules

- Locate elements by accessible role, label, and visible name where possible.
- Add stable test IDs only when the UI has no suitable user-facing locator.
- Do not use fixed sleeps. Wait for observable UI state, navigation, or network completion.
- Keep tests independent and deterministic.
- Create test data through the UI when that interaction is the behavior under test.
- A small API or database setup helper may be used when it keeps unrelated setup short, but it must use only the isolated test database.
- Use unique names when a test can create multiple records.
- Keep fixtures small and committed to the repository.
- Enable useful failure artifacts such as a trace or screenshot on the first retry or on failure without committing generated output.
- Do not require an external runtime service, account, or internet connection after Playwright and its browser have been installed.

---

## Development workflow rule

Update `AGENTS.md` so future feature work follows these rules:

1. Every new user-facing feature must include a new Playwright test or update an existing Playwright test that covers its primary browser workflow.
2. A feature is not complete when its browser behavior has changed but the relevant Playwright coverage has not been updated.
3. Run the Playwright suite during feature development after the implementation is integrated and again as one of the final verification checks.
4. The standard final verification sequence must include:

   ```bash
   npm run lint
   npm test
   npm run build
   npm run test:e2e
   ```

5. Record the Playwright result in the task's document under `docs/changes/` together with the other verification results.

Also update the contributor-facing setup documentation with the command needed to install the configured Playwright browser and with instructions for running `npm run test:e2e`.

---

## Failure handling

- A failing Playwright test must make `npm run test:e2e` exit with a non-zero status.
- Always stop application processes started for the suite, including after a test failure or interruption.
- Print enough information to identify whether startup, the client, the API, or a browser assertion failed.
- Do not silently reuse an unrelated development server unless its configuration and isolated data directory are known to match the test run.
- Keep retries disabled locally by default so unstable tests are visible during development. A future CI task may choose a limited retry policy.

---

## Documentation

Update `README.md` with:

- the one-time Playwright browser installation command;
- the command for running browser tests;
- a short note that end-to-end tests use temporary SQLite data and do not touch `data/inventory.sqlite`.

Update `AGENTS.md` with the feature coverage and final verification rules defined above.

---

## Non-goals

Do not add as part of this task:

- visual regression snapshots;
- tests for every browser engine;
- a hosted browser-testing service;
- CI configuration when no CI workflow is otherwise being introduced;
- exhaustive duplication of the existing API acceptance suite;
- page-object abstractions before repeated test code demonstrates a concrete need;
- authentication or multi-user scenarios.

---

## Acceptance criteria

The task is complete when:

1. `npm run test:e2e` starts the isolated application, runs the Playwright tests in Chromium, and cleans up its processes and temporary data;
2. the tests exercise the main category, item, photo, hierarchy, search, edit, delete, and backup workflows through the browser;
3. the suite never uses the working SQLite database under `data/`;
4. tests use stable locators and contain no fixed sleeps;
5. generated Playwright artifacts are ignored by Git;
6. `README.md` documents browser installation and local execution;
7. `AGENTS.md` requires Playwright coverage for each new user-facing feature and includes `npm run test:e2e` in the final feature checks;
8. the existing API tests remain in place and continue to pass;
9. `npm run lint`, `npm test`, `npm run build`, and `npm run test:e2e` all pass.

## Main priority

Establish a dependable browser-level safety net and make it a normal part of feature delivery without turning the MVP test setup into a large testing framework.
