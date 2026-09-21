# Self-update from the About dialog

- **Completed:** 2026-09-22
- **Version:** 0.20.0

## What was implemented

The About dialog can now check GitHub for a newer stable release and, on a Proxmox/LXC installation,
start the existing `inventory-atlas-lite-update` updater from the interface. No update logic was
reimplemented: the feature is a safe interface over the release and update infrastructure that
already existed.

Backend:

- `GET /api/update/check` compares the running version with the latest stable GitHub release using
  semantic versioning, ignoring drafts and prereleases, and caches the GitHub answer for ten minutes.
  It needs no authentication and returns the deployment type and the self-update capability.
- `POST /api/update/apply` starts the updater and answers `202`, `400`, `409`, `501`, or `500`. It
  takes no body, refuses cross-origin requests, and prevents concurrent updates.
- `GET /api/update/status` returns the state the updater reports, so the interface can follow an
  update that outlives the request that started it.
- New `server/src/update/` modules for the deployment capability, version comparison, the status
  file, and the privileged trigger; `server/src/integrations/githubReleaseClient.js` is the only code
  that talks to GitHub; `server/src/services/updateService.js` and
  `server/src/routes/updateRoutes.js` complete the route/service split.
- `DEPLOYMENT_TYPE` (`proxmox-lxc`, `docker`, `manual`, `development`) is configured explicitly by the
  installer and the Dockerfile, never guessed. Only `proxmox-lxc` may self-update.

Privileged side:

- `deploy/inventory-atlas-lite-update.service` is a dedicated oneshot unit running the existing
  updater as root, outside the application's cgroup, and `deploy/inventory-atlas-lite-update.path`
  starts it when the application creates `/var/lib/inventory-atlas-lite/update-requested`.
- The application stays unprivileged with `NoNewPrivileges=true` and is given no sudo rights. Writing
  that one marker file, which carries no command, version, URL, or argument, is its only influence.
- `scripts/update.sh` writes its progress to `update-status.json`, installs the new units, adds
  `DEPLOYMENT_TYPE` to existing environment files, and now restores the pre-update database together
  with the previous code when a release fails after migrating the schema.

Frontend:

- `client/src/update.js` holds the panel state and the polling; `AboutUpdate.vue` renders it inside
  the About dialog: check, the up-to-date answer, the release link for deployments that cannot update
  themselves, the confirmation step, readable progress through the restart, the reload once the new
  version is healthy, and the rollback message.

Documentation: `docs/features/self-update.md` (new, indexed), `docs/features/about-dialog.md`,
`docs/HOW-TO.md`, `docs/proxmox.md`, `README.md`, `docs/ROADMAP.md`, and `AGENTS.md` were updated, and
`docs/issues/TASK-SELF-UPDATE-FROM-ABOUT.md` was removed.

## Verification

- `npm run lint`, `npm test`, `npm run build`, and `npm run test:e2e` all pass; Playwright ran 41
  tests in Chromium, including five new About tests.
- New `test/update.test.js` covers version comparison, deployment resolution, release caching and
  failure mapping, the status store, the check, unsupported deployments, the single trigger,
  concurrent-update prevention, an updater that never starts, and all API statuses.
- `test/e2e.test.js` covers the update endpoints of a running server on a deployment without a
  privileged updater; `test/scripts.test.js` covers the status file, the database rollback, the
  environment-file update, and the unit files.

## Notes

- A Proxmox installation updated to this release from the command line is still driven by the
  previous release's script during that run, so the updater units are registered but the run itself
  cannot use them. Run `inventory-atlas-lite-update` once more, or re-run the installer, before the
  About dialog offers to update the installation.
