# Skip the unused ONNX Runtime GPU providers when installing dependencies

Completed on 2026-09-21 for version `0.14.2`.

Updating a Proxmox container to `v0.14.1` failed in `npm ci` with `code 137`: the OOM killer stopped
the `onnxruntime-node` install script while it was unpacking
`libonnxruntime_providers_cuda.so` from NuGet. On `linux/x64` that script downloads the CUDA and
TensorRT execution providers by default, which unpack to more than a gigabyte, and a default
container has 1 GiB of memory, 512 MiB of swap, and an 8 GB disk. The failure was unrelated to the
release contents; any installation or update on that host would have hit it.

Inventory Atlas Lite creates its inference sessions with `executionProviders: ['cpu']`, so those
libraries are never loaded. `scripts/lib.sh` and the `Dockerfile` now run `npm ci` with
`ONNXRUNTIME_NODE_INSTALL=skip`, which makes the install script exit before any download while the
bundled CPU binaries stay in place. The Docker image no longer carries the unused GPU libraries
either.

Verification performed:

- `npm run lint`
- `npm test` — 28 passed and 1 environment-dependent check skipped
- `npm run build`
- `npm run test:e2e` — 29 Playwright scenarios passed in Chromium
- `docker build` of the release image succeeded on linux/amd64, and the resulting 1.01 GB image
  contains only `libonnxruntime.so.1` and `onnxruntime_binding.node` in
  `node_modules/onnxruntime-node/bin/napi-v6/linux/x64/` — no CUDA or TensorRT providers.
- The container was started from that image: `/api/health` reported the running version, the batch
  field endpoint created two fields, and `POST /api/images/remove-background` returned a valid JPEG
  cutout, proving CPU inference works without the skipped providers.
