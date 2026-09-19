# AI Add Item

- **Completed:** 2026-09-20
- **Version:** 0.12.0

Implemented an OpenAI-powered item draft flow with server-only credential storage, configurable
model settings, strict structured output, uploaded-image validation, schema-aware normalization,
low-cost image analysis, and review in the existing Add Item form. The original photo and editable
values follow the draft into the normal save workflow, while provider failures preserve the analysis
inputs.

Updated the user guide, feature documentation, roadmap, API acceptance coverage, and Playwright
coverage. Verification completed with `npm run lint`, `npm test`, `npm run build`, and
`npm run test:e2e`; the full Playwright suite passed in Chromium.
