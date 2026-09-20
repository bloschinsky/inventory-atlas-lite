# Stabilize AI settings browser test

- **Completed:** 2026-09-20
- **Version:** 0.12.1

Stabilized the AI settings Playwright workflow on Linux CI by moving Chromium's synthetic pointer
away from the folded-hover desktop sidebar before interacting with the settings form. This prevents
the expanded sidebar from intercepting the checkbox click while retaining Playwright's normal
actionability checks and real click behavior.

Updated the Playwright feature documentation and verified the change with `npm run lint`,
`npm test`, `npm run build`, and `npm run test:e2e`; the full browser suite passed in Chromium.
