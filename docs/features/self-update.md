# Self-update from the About dialog

## Summary

The About dialog can ask the backend whether a newer stable release exists on GitHub and, on a
Proxmox/LXC installation, start the existing `inventory-atlas-lite-update` updater from the
interface. The feature is a safe interface to the update infrastructure that already existed: no
update logic was reimplemented in JavaScript, the browser never talks to GitHub, and the web
application still runs unprivileged, without sudo and without any way to gain privileges.

## User-visible behaviour

The update panel sits under the identity block of the About dialog and has one state at a time.

| Situation | What the panel shows |
| --- | --- |
| Default | A **Check for updates** button |
| While checking | *Checking for updates...* |
| Already current | *Inventory Atlas Lite is up to date.* |
| Newer release, self-update supported | *New version available: `<version>`* and an **Update to `<version>`** button |
| Newer release, self-update unsupported | *New version available: `<version>`*, the reason it cannot install it, and a **View release** link to the GitHub release page |
| Check failed | A short readable message and the **Check for updates** button again |

Pressing **Update to `<version>`** does not start anything. It replaces the panel with a
confirmation step showing `current → new`, the note that a database backup will be created
automatically and that the application may be temporarily unavailable, and **Cancel** / **Update**.

After **Update**, the panel shows one readable progress line per updater state (*Preparing the
update*, *Downloading the new version*, *Creating a database backup*, *Installing the update*,
*Restarting the application*, *Verifying the new version*) with an indeterminate progress bar. The
backend is stopped and started again during the update, so failing requests are an expected part of
it: the panel then shows *Waiting for the application to come back* and keeps polling. Once the
updater reports success and `/api/health` answers with the installed version, the panel shows
*Update completed successfully.* with the new version and reloads the page.

If the updater rolls back, the panel shows *Update failed.* and *Inventory Atlas Lite was restored
to version `<version>`. Your database was preserved.* Raw updater output is never shown; the details
stay in the system journal.

The update state lives outside the dialog component, so closing About and opening it again during an
update shows the same progress, and the polling continues either way.

## Deployment capability

What the panel may offer is decided by one explicitly configured value, never guessed from `/proc`,
cgroups, or the filesystem layout:

```env
DEPLOYMENT_TYPE=proxmox-lxc
```

| `DEPLOYMENT_TYPE` | Check for updates | Self-update | Configured by |
| --- | --- | --- | --- |
| `proxmox-lxc` | Yes | Yes | `scripts/install.sh` writes it into `/etc/inventory-atlas-lite.env` |
| `docker` | Yes | No | `ENV DEPLOYMENT_TYPE=docker` in the `Dockerfile` |
| `manual` | Yes | No | The fallback when `NODE_ENV=production` and nothing is configured |
| `development` | Yes | No | The fallback otherwise |

An unknown value is treated as the fallback and logged. `canSelfUpdate` is additionally false when
the privileged updater unit is not installed on the machine, so a Proxmox installation that predates
this feature reports the truth instead of offering a button that cannot work.

## API

| Endpoint | Behaviour |
| --- | --- |
| `GET /api/update/check` | Returns `currentVersion`, `latestVersion`, `updateAvailable`, `releaseUrl`, `publishedAt`, `deploymentType`, and `canSelfUpdate` |
| `POST /api/update/apply` | `202` with the initial status, `400` when there is nothing newer, `409` when an update is already running, `501` when the deployment cannot self-update, `500` when the updater could not be started, `403` when the request is not same-origin |
| `GET /api/update/status` | Returns `state`, `fromVersion`, `toVersion`, `startedAt`, `message`, and `reportedAt` |

The states are `idle`, `preparing`, `downloading`, `backing_up`, `installing`, `restarting`,
`verifying`, `success`, `failed`, and `rolled_back`.

`GET /api/update/check` reads the releases of the one repository configured in the backend, ignores
drafts, prereleases, and tags that are not comparable versions, and compares the newest remaining
release with the running version using semantic versioning. The answer is cached for ten minutes, so
opening About repeatedly costs one GitHub call. No authentication is used or required.

GitHub being unreachable, rate limiting the check, answering with something unexpected, or
publishing a version that cannot be compared are all reported as short messages with a `502` or
`503`; the technical detail goes to the server log.

## Security model

The privileged part of an update is a dedicated systemd unit, and the application's only influence
over it is the existence of one marker file:

```text
Vue About dialog
  -> POST /api/update/apply            (same-origin only, no body)
  -> Express, running as inventory-atlas
  -> creates /var/lib/inventory-atlas-lite/update-requested
  -> inventory-atlas-lite-update.path  (systemd watcher)
  -> inventory-atlas-lite-update.service (oneshot, root)
  -> /usr/local/sbin/inventory-atlas-lite-update
```

- The application is never root, is never given sudo, and keeps `NoNewPrivileges=true`. A marker
  file in its own data directory is all it can create; it cannot start, stop, or configure a unit.
- The marker carries a timestamp and nothing else. No command, version, URL, repository, branch, or
  shell argument can be passed from the frontend into the privileged side, because nothing from the
  request is read at all.
- The repository the updater installs from is a constant in the backend and in `scripts/lib.sh`.
- The updater service removes the marker before it starts, so the watcher is armed again for the
  next request and a finished update cannot trigger itself a second time.
- The updater runs in its own unit, outside the application's cgroup and process tree, because it
  stops and starts the application service it is updating.
- `POST /api/update/apply` refuses requests whose `Sec-Fetch-Site` is cross-site or whose `Origin`
  is a different host, so no other site can start an update.
- Concurrent updates are refused with `409`, both while this process is waiting for the updater to
  pick the request up and while the status file reports a running update.
- Docker gets no access to `/var/run/docker.sock` and cannot update itself; the panel offers the
  release page instead.

## Updater behaviour and rollback

`scripts/update.sh` is unchanged in what it does - resolve the latest stable release, verify its
checksum, back up SQLite, stop the service, swap the code, reinstall the units, restart, check
`/api/health`, and roll back on failure - and gained two things:

- it writes its progress to `/var/lib/inventory-atlas-lite/update-status.json` (world-readable,
  written atomically), which is how the About dialog follows an update that outlives the request;
- a rollback now restores the pre-update database as well as the previous code. Restoring only the
  code is not enough once the failed release has migrated the schema, so the backup taken before the
  update is put back, the stale WAL and shared-memory files are removed, and the restored version is
  health-checked before `rolled_back` is reported.

## Implementation overview

- `server/src/update/deployment.js` resolves `DEPLOYMENT_TYPE` and the self-update capability.
- `server/src/update/semver.js` parses and compares versions; the project needs no dependency for it.
- `server/src/update/updateStatusStore.js` reads the updater's status file and trusts nothing in it
  that is not a known state.
- `server/src/update/updateTrigger.js` is the whole privilege boundary: it checks that the path unit
  is installed and writes the marker file.
- `server/src/update/updateConfig.js` holds the repository, the cache lifetime, and the file paths.
- `server/src/integrations/githubReleaseClient.js` is the only code that talks to GitHub, with the
  cache and the error mapping.
- `server/src/services/updateService.js` decides what may be offered and what may be started.
- `server/src/routes/updateRoutes.js` is the thin route table with the same-origin guard.
- `client/src/update.js` holds the panel state and the polling that survives the restart.
- `client/src/components/AboutUpdate.vue` renders the panel inside `AboutDialog.vue`.
- `deploy/inventory-atlas-lite-update.service` and `deploy/inventory-atlas-lite-update.path` are the
  privileged unit and its watcher; `scripts/lib.sh` installs and enables them.

## Verification

- `npm run lint`, `npm test`, `npm run build`, and `npm run test:e2e` pass.
- `test/update.test.js` covers version comparison, deployment resolution, the release client's
  caching, draft/prerelease filtering and failure mapping, the status store, the check, the refusal
  on unsupported deployments, the single trigger, concurrent-update prevention, the updater that
  never starts, and every documented HTTP status including the same-origin refusal.
- `test/e2e.test.js` covers the endpoints of a running server on a deployment without a privileged
  updater: the idle status, `501`, the cross-site refusal, and that nothing is written.
- `test/scripts.test.js` covers the status file being valid JSON, the database rollback and its
  journal cleanup, `DEPLOYMENT_TYPE` being added without overwriting existing settings, and the unit
  files being a separate oneshot unit triggered only by the marker.
- `test/e2e/about.spec.js` covers the up-to-date state, the unsupported deployment with its release
  link, the confirmation step and its cancellation, the progress through a restart to the reload,
  and the rollback message.

## Notes and limitations

- An existing Proxmox installation that updates to this release from the command line installs the
  new updater during that run, but the run itself is still driven by the previous release's script,
  which knows nothing about the units. Run `inventory-atlas-lite-update` once more afterwards, or
  re-run the installer, to register them. The About dialog reports `canSelfUpdate: false` until then.
- Only the stable channel is offered. Prereleases, drafts, downgrades, choosing a release, and
  scheduled or forced background updates are deliberately out of scope.
- Docker, manual, and development installations can check for updates but never self-update. An
  external updater or agent for them is separate work.
- The update page-reload happens once `/api/health` reports the installed version. If it never does,
  the panel says so instead of reloading.
- The progress the panel shows is the updater's own state, not a percentage; the updater reports
  steps, not progress within a step.
