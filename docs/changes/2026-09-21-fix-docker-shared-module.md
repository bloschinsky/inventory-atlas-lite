# Fix the Docker image for the shared field-definition module

Completed on 2026-09-21 for version `0.14.1`.

The `v0.14.0` release pipeline failed in **Publish Docker image / Build smoke-test image**: Vite
could not resolve `../../../shared/fieldDefinitions.js` from `BatchAddFieldsDialog.vue`. The
`Dockerfile` copies source directories by name and was never told about the new top-level `shared/`
directory introduced with Batch Add Fields, so the build context simply had no such file. The same
gap would have broken the container at startup, because `server/src/index.js` imports that module
too.

Both stages now copy it: `COPY shared ./shared` next to `COPY server ./server` in the build stage,
and `COPY --from=build /app/shared ./shared` in the runtime stage.

Only the Docker job was affected. `Validate release` and `Package Proxmox source` passed, because
the Proxmox asset is produced with `git archive` over the whole repository.

Verification performed:

- `npm run lint`
- `npm test` — 28 passed and 1 environment-dependent check skipped
- `npm run build`
- `npm run test:e2e` — 29 Playwright scenarios passed in Chromium
- The Docker daemon was unavailable locally, so both image stages were reproduced from file copies
  matching the `Dockerfile` exactly: `vite build` succeeded in the build-stage copy, and a runtime
  copy (`package.json`, `node_modules`, `dist`, `server`, `shared`, `LICENSES`) started with
  `NODE_ENV=production`, served the built client, answered `/api/health` with `0.14.1`, rejected a
  duplicated batch, and created a two-field batch.
