# Fix the Docker smoke test against the current health response

Completed on 2026-09-21 for version `0.17.1`.

The **Publish Docker image** job failed on every tagged release since `v0.16.0` — `v0.16.0`,
`v0.16.1`, and `v0.17.0` — in its *Verify startup and persistent data* step:

```text
AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
+   critical: false,
    database: 'ok',
+   ready: true,
+   restoring: false,
    status: 'ok',
    version: '0.17.0'
```

`test/docker-smoke.mjs` compared the whole `/api/health` body with `deepEqual`, while the database
restore feature had added the readiness flags `ready`, `restoring`, and `critical` to that response
through `restoreStatus()`. The image itself was healthy; only the assertion was stale. Because the
step runs before the GHCR login, no image and no GitHub Release were published for those tags.

The smoke test now asserts the fields it is actually about — `status`, `database`, the expected
`version`, and `ready: true`, so a container still stuck in restore maintenance is caught — instead
of the exact shape of the response, which the shell health helper in `scripts/lib.sh` never depended
on either. A wrong version still fails the test.

Nothing in the application changed, so the previously released `0.17.0` behavior is unaffected; the
patch release exists to give the pipeline a tag it can publish.

Verification performed:

- `npm run lint`
- `npm test`
- `npm run build`
- `npm run test:e2e`
- the release step reproduced locally: the smoke image built from this revision, then
  `node test/docker-smoke.mjs create` and, after recreating the container on the same mounted data
  directory, `node test/docker-smoke.mjs verify`
