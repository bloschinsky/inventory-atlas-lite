# Make the GPU-provider skip reach an already installed updater

Completed on 2026-09-21 for version `0.14.3`.

Updating a Proxmox container to `v0.14.2` failed exactly like `v0.14.1` did, with `npm ci` killed at
`code 137` while `onnxruntime-node` unpacked `libonnxruntime_providers_cuda.so`. The previous fix
could not apply: `/usr/local/sbin/inventory-atlas-lite-update` sources the *installed*
`/opt/inventory-atlas-lite/lib.sh`, and the new one is installed only after the build succeeds. The
container was therefore still running the `0.13.2` copy of the build step, which has no skip. That
was confirmed on the affected host: the installed `lib.sh` contained no `ONNXRUNTIME_NODE_INSTALL`,
and its `node_modules` still carried the CUDA and TensorRT libraries from an earlier install.

Two changes fix it:

- A repository `.npmrc` sets `onnxruntime-node-install=skip`. `npm ci` runs with the unpacked
  release as its working directory, so npm reads it no matter which copy of `lib.sh` started the
  update. The deployment scripts and the image build keep passing `ONNXRUNTIME_NODE_INSTALL=skip`,
  which stays the supported mechanism: npm warns that the project config key is unknown and may stop
  honouring it in a future major version.
- `scripts/update.sh` re-sources `lib.sh` from the downloaded release before building. Until now a
  release could not fix the update steps that install it, only the update after that.

Verification performed:

- `npm run lint`
- `npm test` — 30 passed and 1 environment-dependent check skipped, including two new regression
  tests covering the skip settings and the updater's load order
- `npm run build`
- `npm run test:e2e` — 29 Playwright scenarios passed in Chromium
- `docker build` succeeded and the image contains only `libonnxruntime.so.1` and
  `onnxruntime_binding.node` for linux/x64.
- On the affected container, a probe install of `onnxruntime-node` with this `.npmrc` finished in
  7 seconds and fetched no GPU providers.
- The real failure was reproduced end to end on that container: the working tree was unpacked as a
  release and built by the *old installed* `lib.sh`. `npm ci` completed in 24 seconds with no OOM,
  the production client built, and the result contains only the CPU binaries. The probe directories
  were removed afterwards; the installation and its data were not touched.
