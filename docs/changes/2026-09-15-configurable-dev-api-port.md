# Configurable development API port

- Completed: 2026-09-15
- Version: 0.2.1

## Summary

Made the Vite development proxy follow the `PORT` environment variable so the API no longer has to run on the hardcoded port `3000`.

## Implemented changes

- Read `PORT` in `vite.config.js` and target the development `/api` proxy at that port, keeping `3000` as the default.
- Documented in `README.md` that `PORT` also applies during development and that the proxy follows it.
- Updated the stack description in `AGENTS.md` accordingly.
- Incremented the project version from `0.2.0` to `0.2.1` as a small maintenance change.

## Verification

- `npm run lint`, `npm test`, and `npm run build` pass.
- Started `PORT=4300 npm run dev` and confirmed that the Vite development client reaches the API on `:4300` through the proxy.
