# Remote MCP smoke test: readable CA file on Linux (#66)

- **Completed:** 2026-11-07
- **Version:** 0.73.1
- **Branch:** `bugfix/66-remote-smoke-ca-permissions`

## Summary

The release workflow of v0.73.0 failed in **Verify remote MCP access**
(`mcp/test/docker-remote-smoke.mjs`), before the image was pushed or the GitHub Release created, so
0.73.0 was never published. The script copies Caddy's internal root CA out of the Caddy container with
`docker compose cp`, which keeps its `0600` mode for the runner's user, and bind-mounts it into the
client container, which reads it as the image's `node` user (another uid). Node.js could not load it
(`Ignoring extra certs from /ca.crt … Permission denied`), so the HTTPS request failed with
`unable to get local issuer certificate`. Docker Desktop on Windows ignores file modes on bind mounts,
which is why the local run passed.

The script now makes the copied certificate readable (`0644`) before mounting it. No application or
adapter code changed; 0.73.1 ships the 0.73.0 features.

## Verification

- Reproduced in Docker Desktop's Linux VM: a `0600` file owned by uid 1001 bind-mounted into
  `inventory-atlas-mcp:local` is unreadable for its `node` user (uid 1000) and readable after
  `chmod 644`.
- `node mcp/test/docker-remote-smoke.mjs inventory-atlas-lite:smoke` — passed locally.
- `npx eslint` on the script — passed. The rest of the code is unchanged since 0.73.0, whose
  validation and end-to-end jobs passed in the release workflow.
- The full Linux run is the release workflow of v0.73.1.
