# Security Foundation: authentication, Admin/Viewer RBAC, and scoped API access

- **Completed:** 2026-11-06
- **Version:** 0.71.0
- **Issue:** #62 (TASK: Security Foundation — Authentication, Admin/Viewer RBAC & Scoped API Access, Phase 1)

## Summary

- **Boundary.** `server/src/http/authGate.js` runs before every route table and checks each `/api`
  request against `server/src/auth/routePolicy.js`, one explicit route-to-permission matrix of all
  110 registered routes. An unmatched path needs `security:manage` (default deny). Missing or invalid
  credentials get `401`, a missing permission `403`, both in the existing error envelope and in both
  locales. Only health, the session state, sign-in, setup, and recovery are public.
- **Roles and permissions.** `shared/permissions.js`: `inventory:read`, `items:write`,
  `inventory:manage`, `tools:use`, `settings:manage`, `maintenance:manage`, `security:manage`.
  Administrator has all of them, Viewer only `inventory:read`. AI, URL import, and background removal
  are never viewer-safe. Bulk previews are writes, label data is a read, and the backup download is
  maintenance.
- **Sessions.** Opaque random sessions are stored hashed in `auth.sqlite` and carried in an
  `HttpOnly`, `SameSite=Lax` cookie (`__Host-` and `Secure` over HTTPS). They expire after three days
  idle or 30 days in total. Every sign-in rotates the session (no fixation). Password and role changes,
  resets, and disabling end sessions. State-changing requests need the session's HMAC anti-CSRF header
  and a same-origin `Sec-Fetch-Site`/`Origin`. Sign-in is throttled per address and name. Restore,
  reset, update, account changes, and new tokens need a password confirmed within ten minutes.
- **HTTPS.** Credentials over plain HTTP are refused unless the client is on loopback or
  `ATLAS_ALLOW_HTTP=true`. `ATLAS_TRUST_PROXY` (presets, IPs, or CIDRs only) is the only way forwarded
  headers are believed.
- **API tokens.** `ial_<id>_<secret>` tokens are sent as Bearer headers and stored hashed. They are
  shown once and have the scopes `inventory:read` (default) or `items:write`, never more than their
  creating administrator currently has. They can expire, revoke at once, and stop working when the
  owner is disabled. A request with both a cookie and a token is refused.
- **Bootstrap and recovery.** The app stays locked until `npm run auth -- init` prints a one-time setup
  code. The code, the account count check, and the insert are one transaction, and there is no
  anonymous claim. `recover <username>` prints a recovery code, and `users` lists accounts.
  `deploy/inventory-atlas-auth` (installed as `/usr/local/sbin/inventory-atlas-auth`) wraps these
  commands for Proxmox, and `docker exec … node server/src/cli/auth.js` runs them for Docker. Existing
  installations keep all data and are locked until set up.
- **Security store.** `DATA_DIR/auth.sqlite` holds its own migrations, `0600` permissions, and Argon2id
  hashes (`argon2` 0.45, m=19 MiB, t=2, p=1). It also keeps a bounded audit trail. It is never part of
  inventory backup, restore, or reset. A damaged store stops the server instead of starting it without
  accounts.
- **Cloud OAuth.** Connect and the callback need `settings:manage`. The callback completes only for the
  session that started the flow, and every refusal redirects to Settings.
- **Interface.** The new sign-in, setup, and recovery pages (`SignIn.vue`) return the person to the
  deep link they first opened. Pages use route guards with `meta.permission`. `AccountMenu.vue` adds the
  account menu on the desktop line and in the phone drawer, and `ReauthDialog.vue` asks for the
  password again. Viewers get read-only pages: no write actions, admin pages, admin Settings sections,
  database link, or update panel. **Settings → Security & Access** has three sections: **Users**,
  **API Access**, and **Sessions**. All new text is in English and Ukrainian.
- **Demo.** The public demo acts as one in-browser administrator with no requests. Its Security &
  Access sections show *Not available in the public demo*. The server has no switch that disables
  authentication.
- Dependency added: `argon2` (MIT, bundled prebuilds). The Vite development proxy now keeps the
  browser's `Host` (`changeOrigin: false`).
- Documentation: `docs/features/authentication-and-access.md` has the threat model, the generated
  authorization matrix, decisions, and limits. Also updated: README (accounts, HTTPS and proxies,
  Docker and Proxmox bootstrap, upgrade, recovery, rollback), `docs/proxmox.md`, the user guide in
  EN and UK (four new sections and the limitations), the backup, restore, reset, cloud backup,
  self-update, installer, settings center, AI, release pipeline, and Playwright feature documents, the
  feature index, and `AGENTS.md`.

## Verification

- `npm run lint`: passed.
- `npm test`: 433 of 435 passed and 1 was skipped. The one failure, `the guide renders Markdown safely`
  in `test/landing.test.js`, is a known Windows-only failure that also fails on a clean `master`.
- `npm run build`: passed.
- `APP_VERSION=0.71.0 E2E_LANDING_PORT=4700 npm run test:e2e`: 311 passed (22.3 min, both projects).
  The landing port is moved off a range Windows reserves on this machine.
- New tests: `test/auth-policy.test.js` (every route has exactly one policy entry, the public
  allowlist, matching, roles, and scopes), `test/auth.test.js` (7 API security scenarios over real
  servers), and `test/e2e/auth.spec.js` (5 browser workflows).
