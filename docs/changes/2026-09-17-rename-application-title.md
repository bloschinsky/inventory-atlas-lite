# Rename the visible application title to Inventory Atlas Lite

- **Completed:** 2026-09-17
- **Version:** 0.5.6

## Summary

The interface called the application *Personal Inventory* while all documentation called it
*Inventory Atlas Lite*. The visible name now matches the documentation.

- `client/src/App.vue` — the navigation bar brand reads **Inventory Atlas Lite**.
- `index.html` — the browser tab title reads **Inventory Atlas Lite**.
- `test/e2e/navigation.spec.js` — asserts the page title and the visible brand link, so the name
  cannot silently drift again.

Nothing else changed: no route, label, API response, or stored data is affected. The npm package name
in `package.json` is still `simple-personal-inventory`; it is an internal identifier that is never
shown to a user and renaming it would rewrite the lockfile for no benefit.

The discrepancy was reported in
[`2026-09-17-user-how-to-guide.md`](2026-09-17-user-how-to-guide.md) and is now resolved.
[`../HOW-TO.md`](../HOW-TO.md) needed no edit, because it describes the navigation entries and never
depended on the brand text.

## Verification

```bash
npm run lint     # pass
npm test         # 17 tests, 16 pass, 1 skip (shellcheck not installed)
npm run build    # pass
npm run test:e2e # 8 passed, including the new title and brand assertions
```
