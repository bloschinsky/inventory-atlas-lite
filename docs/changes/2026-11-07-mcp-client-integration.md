# MCP client integration, end-to-end QA, and guides (#67)

- **Completed:** 2026-11-07
- **Version:** 0.73.2
- **Branch:** `feature/67-mcp-client-integration-qa`

## Summary

Phase 2.3 of the MCP work: the read-only adapter checked against the clients people use and against
realistic conversations, with operator documentation. No tool and no write access were added. Details:
`docs/features/mcp-client-integration.md`.

- **Platform research (2026-11-07, sources cited):** Claude custom connectors by URL on Free (one),
  Pro, Max, Ultra, Team, and Enterprise, usable on web, Desktop, and mobile; voice mode not documented.
  ChatGPT custom MCP servers documented for Business and Enterprise/Edu on the web; Plus/Pro not
  confirmed, Free and mobile not documented. The adapter was compared with every documented Claude
  connector requirement (401 challenge, resource metadata, DCR as the fallback when CIMD is not
  advertised, callback URLs, PKCE, form-encoded token endpoint, refresh rotation, latency, result size).
- **Result size budget** (`mcp/src/mapping.js` `fitResult()`, used by `toolResult()`): Claude's hosted
  apps accept about 150,000 characters per tool result, and an item with 100 long custom text fields
  or a 50-event history page with long locations reached about 200,000 characters of JSON, sent twice.
  Every result now stays at or below 50,000 characters: text values are cut shorter until it fits,
  every record and field is kept, and the result carries `text_shortened: true`.
- **Consent page privacy line** (`mcp/src/consent.js`): the records a client reads are sent to its
  provider.
- **Acceptance suite** (`mcp/test/acceptance.test.js`, 20 tests): real Atlas, the adapter in OAuth
  mode, a TLS proxy with the Caddyfile's paths, and the official SDK client as the connector, on the
  synthetic inventory of `mcp/test/scenarioFixture.js`. Discovery and tool stability; the ten
  scenarios of the issue (search with pagination, retrieval with empty vs. absent fields, inherited
  location and unknown placement, categories, history with filters and cursor, summary, ambiguity,
  unknown item and empty inventory, prompt injection, refused write requests); Ukrainian/English data;
  311 items; refresh after a refused access token, an adapter restart, a wrong-resource token, owner
  revocation and re-approval, a disabled Atlas token owner; no secret in results or logs; latency and
  size measurements.
- **Shared harness** (`mcp/test/remoteHarness.js`): the TLS proxy, `cli.js` helpers, and SDK OAuth
  client moved out of `remote.test.js`, which now uses it. `mcp/test/scenario-transcripts.mjs` prints
  the sample interactions in the feature document.
- **Documentation:** `docs/features/mcp-client-integration.md` (support matrix, requirements table,
  scenarios, coverage map, measurements, manual QA matrix, sample interactions, privacy, readiness
  review, Phase 3 proposal); the operator playbook `docs/features/mcp-operator-playbook.md` and its
  Ukrainian translation `.uk.md` (added to the language exceptions in `AGENTS.md`); updates to
  `mcp-remote-oauth.md`, `mcp-read-only-adapter.md`, the features index, and the MCP paragraphs of
  `docs/HOW-TO.md` and `docs/HOW-TO.uk.md`.

## Not done here (pending the owner)

- A manual connection of a real Claude connector, and ChatGPT where a plan allows it, needs a deployed
  adapter on a public HTTPS name and the owner's own account; the QA matrix lists these rows as pending
  and the playbook gives the steps and prompts. No real-vendor screenshots or transcripts exist yet.
- GitHub issue #67 stays open until that external step is done or explicitly waived.

## Verification

- `npm run lint` — passed.
- `npm test` — 438 tests, 435 passed, 2 failed: the two guide tests of `test/landing.test.js` that also
  fail on a clean `master` checkout on this Windows machine (confirmed with `git stash`), not related.
- `npm run build` — passed.
- `npm run mcp:test` — 82 passed, including the 20 new acceptance tests.
- `npm run test:e2e` (with `APP_VERSION=0.73.2` and the port overrides `E2E_API_PORT=3800
  E2E_CLOUD_STUB_PORT=3801 E2E_LANDING_PORT=4200` for this machine's reserved port ranges) — 311 passed (22.7 min).
  No browser-facing behaviour of Atlas changed; the adapter's consent page is covered by the MCP suites.
