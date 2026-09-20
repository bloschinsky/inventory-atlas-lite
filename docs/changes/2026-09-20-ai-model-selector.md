# OpenAI model selector

Completed on 2026-09-20 for version `0.13.2`.

The AI Settings model text field is now a selector backed by `GET /api/ai/models`. The server uses
the saved OpenAI API key to list account-accessible models, filters that response through the
curated GPT-5.6 Luna, Terra, and Sol allowlist, and returns only normalized IDs and labels. Provider
failures are reduced to safe user-facing errors; the API key and raw OpenAI errors remain server-side.

Settings loads the list when opened, offers **Refresh models**, reloads after a changed key is saved,
and retains an existing or newly entered model through **Custom model...** when it is not a listed
curated choice. AI Add Item analysis continues to use the saved model ID without other changes.

Verification performed:

- `npm run lint`
- `npm test` — 18 passed and 10 environment-dependent shell checks skipped
- `npm run build`
- `npm run test:e2e` — 28 Playwright scenarios passed in Chromium
