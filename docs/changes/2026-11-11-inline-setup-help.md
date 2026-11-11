# Inline first-administrator setup help and actionable HTTPS guidance (#64)

- **Completed:** 2026-11-11
- **Version:** 0.74.5
- **Branch:** `feature/64-inline-setup-help`

## Summary

The sign-in pages now carry collapsed, in-context help, so an operator can create the first
administrator, issue a recovery code, or allow sign-in over the network without opening the README.
The single-page form, the server, and the security model are unchanged: no new endpoint, no
detection of the installation, and no change to transport enforcement, sessions, cookies, CSRF, or
code issuance.

- **`client/src/components/SignInHelp.vue`** (new): a disclosure button (`aria-expanded`,
  `aria-controls`, keyboard-operable) that opens an inline panel with a **Proxmox LXC** / **Docker** /
  **Manual / development** radio group and the matching commands, each with **Copy** (spoken feedback;
  where the browser offers no clipboard, as on a plain-HTTP page, the command is selected for copying
  by hand). Topics:
  - `init` (**Setup help**): `pct list`, `pct exec <CTID> -- /usr/local/sbin/inventory-atlas-auth init`,
    `inventory-atlas-auth init` inside the container, `docker exec <container> node
    server/src/cli/auth.js init`, and `npm run auth -- init` with the server's `DATA_DIR`;
  - `recover` (**Recovery help**): the same commands with `recover <username>` instead of `init`;
  - both explain that the code is one-time, made on the server, valid for 30 minutes, and not a
    password;
  - `https` (**How to fix this?**): an HTTPS reverse proxy with `ATLAS_TRUST_PROXY` first, a
    trusted-network-only warning that credentials travel unencrypted, and per installation where to
    set `ATLAS_ALLOW_HTTP=true` (Proxmox: `pct enter <CTID>`, `/etc/inventory-atlas-lite.env`,
    `systemctl restart inventory-atlas-lite`; Docker: check the `/data` mount with `docker inspect`,
    back up with `server/src/cli/backup.js` and `docker cp`, then recreate from the original
    `docker run` with the same `/data` volume or folder plus `-e ATLAS_ALLOW_HTTP=true`, or update the
    Compose environment; manual: the server process environment and a restart). After review the
    Docker steps no longer suggest `docker rm -f`: the image declares `VOLUME /data`, so a container
    started without `-v` keeps the inventory in an anonymous volume that a new container would not
    reuse, and the inventory would look empty.
- **`client/src/pages/SignIn.vue`**: the fixed `npm run auth -- …` command block was replaced by the
  setup or recovery help; the page keeps the `ApiError.code` of a failed request and shows the HTTPS
  help only for `AUTH_HTTPS_REQUIRED`. One installation choice is shared by both panels of a page, and
  opening help or switching never changes the typed form values or the focus flow.
- **Localization:** new `auth.helpToggle`, `auth.deployment`, `auth.commandHelp`, `auth.httpsHelp`,
  copy keys, and `common.copy` / `common.copied` in English and Ukrainian; the setup and recovery
  intros no longer point at a single command, and `errors.AUTH_HTTPS_REQUIRED` is shorter and no
  longer refers to the README. Placeholders (`<CTID>`, `<container>`, `<username>`) are passed as
  message parameters, because vue-i18n treats `<…>` inside a message as HTML.
- **Documentation:** `docs/HOW-TO.md` and `docs/HOW-TO.uk.md` (Sign in and out),
  `docs/features/authentication-and-access.md` (Interface and Tests), and `docs/features/README.md`.
  #64 had no roadmap entry.
- **Tests:** `test/e2e/auth.spec.js` covers setup help (collapsed by default, opened from the keyboard,
  installation switching, the setup commands, Copy and clipboard content, kept form values, closing),
  recovery help (recovery commands only), and the HTTPS guidance (shown for a mocked
  `AUTH_HTTPS_REQUIRED` with the per-installation steps and warning, the Docker mount check and
  backup with no `docker rm`, absent for a wrong password), and the Copy fallback when the browser
  refuses the clipboard (the command is selected instead).
  The Ukrainian phone test now opens Recovery help and still checks for no horizontal overflow. All
  examples use placeholders only.

## Verification

- `npm run lint` — clean.
- `npm test` — 442 of 445 passed (one skipped), including `test/i18n.test.js` and
  `test/errors.test.js`. The two failures are the known Windows-only guide tests in
  `test/landing.test.js` that fail on CRLF checkouts and pass on LF/CI.
- `npm run build` — succeeded.
- `APP_VERSION=0.74.5 npm run test:e2e` (with local `E2E_*_PORT` overrides for reserved Windows
  ports) — 323 of 324 passed in 22.1 minutes. The one failure, `settings-navigation.spec.js` "unsaved
  changes are kept unless discarding them is confirmed" (a browser Back prompt count), is unrelated to
  this change and passed on an immediate rerun together with `auth.spec.js` (15 of 15).
- After the review fixes (safe Docker steps, `errorCode` cleared on each attempt, the Docker and
  clipboard-refusal tests): `npm run lint` clean, `test/i18n.test.js` and `test/errors.test.js` 17 of
  17, `npm run build` succeeded, and `auth.spec.js` 9 of 9.
- Manual check with Playwright screenshots of the setup help on a desktop and of the HTTPS and
  Ukrainian recovery help on a 390 px phone: compact when collapsed, no horizontal overflow.
