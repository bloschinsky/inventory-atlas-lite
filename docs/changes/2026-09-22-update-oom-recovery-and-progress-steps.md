# Update OOM recovery and detailed update progress

- **Completed:** 2026-09-22
- **Version:** 0.25.1

## Why

An update from 0.24.1 to 0.25.0 started from About on a default Proxmox installation (1024 MiB RAM,
512 MiB swap) never finished. The Proxmox host log showed the container's memory cgroup running out
while `npm ci` of the updater ran beside an application that still held the background-removal model
session (about 480 MB resident plus 475 MB in swap). The OOM killer stopped `node`, then `npm ci`,
then the container's systemd, so the whole container went down. About kept showing *Waiting for the
application to come back*, and after the container was started again the status file still said
`preparing`, which made every later update fail with `409 An update is already running`.

## What was implemented

- **Interrupted updates stop blocking.** `UpdateService` reports a running state that the updater has
  not rewritten for longer than the unit's one-hour `TimeoutStartSec` as `failed` with *The update
  was interrupted before it finished.*, so a new update can be started.
- **The model session is released when idle.** `server/src/integrations/backgroundRemoval.js`
  releases the ONNX Runtime session after five minutes without a cutout, queued behind any cutout
  still running. Measured locally on the regression photo: 613 MB resident after a run, 144 MB after
  the release, repeatably.
- **More memory by default.** `scripts/proxmox-install.sh` creates containers with 2048 MiB.
  `docs/proxmox.md` tells existing installations to run `pct set <CTID> -memory 2048`.
- **Detailed update progress.** `shared/updateSteps.js` lists five phases and fifteen steps. The
  updater reports the step through the new `ial_update_step` in `scripts/lib.sh` and a third argument
  of `ial_update_status`; the status file and `GET /api/update/status` gained a `step` field that the
  server accepts only from that list. The About panel shows the phases as a Tabler step indicator,
  the current step, rotating hints for the dependency install and the client build, the elapsed time,
  and a warning when the server has not answered for three minutes. An updater that reports no step,
  such as the release being replaced, falls back to its state's line.
- `docs/features/self-update.md`, `docs/features/ai-add-item.md`, `docs/features/proxmox-one-line-installer.md`,
  `docs/proxmox.md`, `docs/HOW-TO.md`, and `README.md` describe the new behaviour and defaults.

## Verification

- `npm run lint` passes.
- `npm test` passes, including the new unit tests for the step allowlist, the interrupted-updater
  timeout, the step in the status file, shared helpers staying silent before the updater reports a
  state, and every scripted step being listed in `shared/updateSteps.js` and vice versa. The
  shellcheck test was skipped because shellcheck is not installed on the development machine.
- `npm run build` passes.
- `npm run test:e2e` passes, including the new About test for the phases, the current step, its hint,
  and the elapsed time.
- The failed container was started again on the Proxmox host and serves 0.24.1 with its data intact.
