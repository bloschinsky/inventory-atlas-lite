# Task: Self-Update from the About Dialog

## Goal

Add an update mechanism to **Inventory Atlas Lite** so a user can check for a newer GitHub release from the **About** dialog and, where the deployment supports it, install the update directly from the application UI.

The feature must reuse the existing release/update infrastructure instead of implementing a second independent updater.

---

## Current Context

The project already has:

- version/build information shown in the **About** dialog;
- CI that creates a GitHub Release when a new version tag is pushed;
- a Proxmox/LXC installation flow;
- an existing `inventory-atlas-lite-update` updater;
- health-check logic;
- SQLite backup before update;
- rollback of application code if an update fails.

The new feature should expose this existing functionality through the application UI in a safe way.

---

# 1. Update Check

Add a **Check for updates** button to the About dialog.

The frontend must not call GitHub directly.

Add a backend endpoint:

```http
GET /api/update/check
```

The backend should:

1. Read the currently running application version.
2. Request the latest stable GitHub Release for this repository.
3. Ignore draft and prerelease releases.
4. Compare the current version with the latest version using semantic versioning.
5. Return update information to the frontend.

Example response:

```json
{
  "currentVersion": "0.9.0",
  "latestVersion": "0.10.0",
  "updateAvailable": true,
  "releaseUrl": "https://github.com/.../releases/tag/v0.10.0",
  "publishedAt": "2026-09-19T12:00:00Z",
  "deploymentType": "proxmox-lxc",
  "canSelfUpdate": true
}
```

Cache the GitHub response for a short period, e.g. 5–15 minutes, to avoid unnecessary API calls.

GitHub authentication must not be required for the public repository.

---

# 2. Deployment Capability Detection

The backend must expose whether the current installation supports self-update.

Do not detect this heuristically from `/proc`, cgroups, filesystem layout, etc.

Use an explicit deployment type configured during installation, for example:

```env
DEPLOYMENT_TYPE=proxmox-lxc
```

Possible values:

```text
proxmox-lxc
docker
manual
development
```

Expose update capabilities to the frontend.

Recommended behavior:

| Deployment | Check updates | Self-update |
|---|---:|---:|
| Proxmox/LXC installer | Yes | Yes |
| Docker / Compose | Yes | No |
| Manual Node install | Yes | No |
| Development | Optional | No |

The frontend must render the appropriate UI based on these capabilities.

---

# 3. About Dialog UX

Default state:

```text
Inventory Atlas Lite
Version 0.9.0

[ Check for updates ]
```

While checking:

```text
Checking for updates...
```

If the application is current:

```text
Inventory Atlas Lite is up to date.
Version 0.9.0
```

If an update exists and self-update is supported:

```text
New version available: 0.10.0

[ Update to 0.10.0 ]
```

If an update exists but self-update is not supported:

```text
New version available: 0.10.0

This installation cannot update itself automatically.

[ View release ]
```

The release button should open the corresponding GitHub Release page.

---

# 4. Proxmox/LXC Self-Update

Self-update must be supported for the existing Proxmox/LXC installation.

Add:

```http
POST /api/update/apply
```

The endpoint must **not** execute arbitrary commands and must not accept arbitrary URLs or shell arguments.

The application backend must only be able to trigger one predefined updater action.

Example architecture:

```text
Vue UI
  │
  ▼
POST /api/update/apply
  │
  ▼
Node / Express
  │
  ▼
restricted privileged helper
  │
  ▼
systemd oneshot update service
  │
  ▼
inventory-atlas-lite-update
```

Do not run the main Node.js application as root.

Do not give the application general-purpose sudo access.

---

# 5. Dedicated systemd Update Service

The updater must run independently of the main application process.

Create a dedicated systemd unit, for example:

```text
inventory-atlas-lite-update.service
```

It should run the existing updater with the required privileges.

The normal application service must not own or directly execute the full update lifecycle.

Reason:

During an update the main application service may be stopped/restarted. The updater must therefore live outside the application's own systemd cgroup/process tree.

The application may trigger only this specific service.

Example restricted command concept:

```bash
sudo systemctl start inventory-atlas-lite-update.service
```

Configure sudo/polkit/system permissions so the application user can trigger this service only, without obtaining general root access.

---

# 6. Reuse Existing Updater

Do not rewrite the update logic in JavaScript.

Continue to use the existing:

```text
inventory-atlas-lite-update
```

The existing updater remains responsible for:

- detecting/downloading the latest stable release;
- validating the release/checksum;
- creating the SQLite backup;
- stopping the application;
- replacing application code;
- installing required dependencies if applicable;
- starting the application again;
- checking `/api/health`;
- rollback when startup/health validation fails.

The UI/API layer is only a safe interface to the existing updater.

---

# 7. Update Status

Add a status mechanism so the UI can display update progress.

Recommended endpoint:

```http
GET /api/update/status
```

Example response:

```json
{
  "state": "installing",
  "fromVersion": "0.9.0",
  "toVersion": "0.10.0",
  "startedAt": "2026-09-19T15:00:00Z",
  "message": "Installing application update"
}
```

Suggested states:

```text
idle
preparing
downloading
backing_up
installing
restarting
verifying
success
failed
rolled_back
```

Implementation suggestion:

The privileged updater writes update state to a small JSON status file, for example:

```text
/var/lib/inventory-atlas-lite/update-status.json
```

The application user should have read-only access to this file.

Do not rely exclusively on the original HTTP request remaining alive during the entire update.

---

# 8. Frontend Behavior During Update

After the user presses **Update**, show a confirmation dialog.

Example:

```text
Update Inventory Atlas Lite

0.9.0 → 0.10.0

A database backup will be created automatically.
The application may be temporarily unavailable.

[ Cancel ] [ Update ]
```

After confirmation:

1. Trigger `POST /api/update/apply`.
2. Show update progress/status.
3. Expect the backend to temporarily become unavailable.
4. Poll `/api/health` periodically.
5. When the backend returns again, verify the reported version.
6. When the expected new version is running, reload the page.

Example final state:

```text
Update completed successfully.
Inventory Atlas Lite 0.10.0
```

Then perform:

```js
window.location.reload()
```

The UI should handle temporary connection failures during application restart as an expected part of the update process.

---

# 9. Failed Update / Rollback UX

If the updater restores the previous release, the UI should clearly report that the update failed and rollback completed.

Example:

```text
Update failed.

Inventory Atlas Lite was restored to version 0.9.0.
Your database was preserved.
```

Do not display raw shell output to the user by default.

Relevant detailed errors may be written to system logs for diagnostics.

---

# 10. Database Migration Safety

Review the existing rollback behavior before enabling automatic UI updates.

Application-code rollback alone is not sufficient if an update has already modified the SQLite schema.

Implement one of the following policies.

Preferred approach:

- create a pre-update SQLite backup;
- if the new release fails after migrations were executed:
  - restore the previous application code;
  - restore the pre-update SQLite database backup;
  - restart the previous version;
  - verify health.

Alternative only if deliberately adopted project-wide:

- guarantee that database migrations are backward-compatible with at least the immediately previous release.

The update mechanism must never silently leave an older application version running against an incompatible newer database schema.

---

# 11. Docker Behavior

Do **not** give the Inventory Atlas Lite container access to:

```text
/var/run/docker.sock
```

Do not let the application container control its own Docker host.

For Docker deployments:

- `GET /api/update/check` must work;
- the UI may report that a newer version exists;
- automatic self-update must be disabled;
- show a **View release** action and/or manual Docker update instructions.

Example:

```text
New version available: 0.10.0

This Docker installation cannot update itself automatically.
Update the container from the Docker host.

[ View release ]
```

Future support for an external updater/agent may be added separately, but it is outside this task.

---

# 12. Manual and Development Installations

For manual Node installations:

- allow update checking;
- disable self-update unless an explicit supported update adapter exists.

For development mode:

- hide or disable self-update;
- no privileged update operations should be possible.

---

# 13. Security Requirements

The update implementation must follow these rules:

- never run the normal web application as root;
- never expose a generic command execution API;
- never accept an arbitrary update URL from the frontend;
- never accept arbitrary shell arguments;
- never allow the frontend to select an arbitrary repository;
- only update from the official configured Inventory Atlas Lite GitHub repository;
- only install published stable releases;
- reuse the existing release checksum verification;
- make `/api/update/apply` a `POST` endpoint;
- add same-origin / CSRF-safe handling appropriate to the current application architecture;
- prevent multiple updates from running concurrently;
- return `409 Conflict` if an update is already in progress;
- log update start/result to system logs.

---

# 14. API Proposal

## `GET /api/update/check`

Returns:

```json
{
  "currentVersion": "0.9.0",
  "latestVersion": "0.10.0",
  "updateAvailable": true,
  "releaseUrl": "...",
  "publishedAt": "...",
  "deploymentType": "proxmox-lxc",
  "canSelfUpdate": true
}
```

## `POST /api/update/apply`

Starts an update when supported.

Possible responses:

```text
202 Accepted
409 Update already running
400 No newer release available
501 Self-update unsupported for this deployment
500 Failed to start updater
```

## `GET /api/update/status`

Returns current/last updater state.

---

# 15. Error Handling

Handle at least:

- GitHub unavailable;
- rate limit reached;
- malformed GitHub response;
- version comparison failure;
- no newer release;
- updater already running;
- updater service failed to start;
- release download failure;
- checksum validation failure;
- backup failure;
- install failure;
- application failed to restart;
- health check failure;
- rollback success;
- rollback failure.

The user-facing UI should use short readable messages.

Detailed technical errors should remain available in logs.

---

# 16. Out of Scope

Do not implement in this task:

- automatic scheduled background updates;
- forced updates;
- update channels other than stable;
- Docker socket access;
- Kubernetes update support;
- arbitrary release selection;
- downgrade UI;
- GitHub access tokens/settings UI;
- generic remote command execution;
- external update server.

---

# Acceptance Criteria

The task is complete when all of the following are true:

- [ ] About contains **Check for updates**.
- [ ] Update check is performed by the backend.
- [ ] Latest stable GitHub Release is compared with the running version.
- [ ] Version comparison uses semantic versioning.
- [ ] GitHub responses are cached for a reasonable short period.
- [ ] Deployment type is explicitly configured and exposed as a capability.
- [ ] Proxmox/LXC reports `canSelfUpdate: true`.
- [ ] Docker/manual/dev do not expose unsafe self-update.
- [ ] Proxmox update can be triggered from the About dialog.
- [ ] The web application itself still runs as a non-root user.
- [ ] A dedicated privileged systemd updater service exists.
- [ ] The updater runs independently from the main application service.
- [ ] Existing `inventory-atlas-lite-update` logic is reused.
- [ ] Multiple simultaneous updates are prevented.
- [ ] Update progress/status can be queried.
- [ ] The frontend survives the backend restart and polls `/api/health`.
- [ ] The page reloads after the expected new version becomes healthy.
- [ ] Failed updates provide a clear rollback state.
- [ ] Database rollback/migration safety is handled.
- [ ] Docker does not receive access to `docker.sock`.
- [ ] No arbitrary command, URL, repository, or shell argument can be supplied through the API.
- [ ] Existing tests continue to pass.
- [ ] Add/update tests for update-check, capabilities, update trigger, concurrent update prevention, and unsupported deployment behavior.
- [ ] Update deployment documentation with the new self-update architecture and security model.

---

## Implementation Principle

**Do not build a second updater.**

The feature should be implemented as a safe UI/API layer over the updater and release infrastructure that already exists in Inventory Atlas Lite.
