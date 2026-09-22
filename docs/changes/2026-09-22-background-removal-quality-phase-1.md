# Improve local background-removal quality (Phase 1)

**Completion date:** 2026-09-22

**Version:** 0.24.0

## Summary

Rebuilt the local cutout pipeline behind `POST /api/images/remove-background`. The API contract, the
Remove background control, and the fallback to the original photo are unchanged; only the produced
image is different.

- **Model.** Replaced U2NetP with IS-Net (`isnet-general-use`, the general checkpoint of Highly
  Accurate Dichotomous Image Segmentation). It runs at 1024x1024 instead of 320x320 and uses
  zero-centred input instead of the ImageNet statistics. BiRefNet General Lite was evaluated on the
  same regression photo: its silhouette was comparable but coarser at thin structures - it cut the
  PCI contact fingers off - while taking 20 s per image against 5 s, so IS-Net was selected.
- **Mask cleanup.** The raw mask is no longer composited. It is reduced to a silhouette by
  hysteresis thresholding (cores at 0.6 grown over 0.2), removal of detached regions under five per
  cent of the largest region, and filling of enclosed gaps up to two per cent of the subject area.
  The silhouette is then scaled, blurred by a fraction of a pixel, and mapped through an off-centre
  0.45-0.8 smoothstep, which pulls the edge slightly inward off the colour-contaminated pixels.
- **Composition.** The subject keeps its aspect ratio and is centered with seven per cent padding on
  white, as before.
- **Shadow.** A deliberate soft shadow is generated from the placed silhouette: blurred by two per
  cent of the subject height, offset down by 2.5 per cent, composited at 22 per cent opacity in a
  dark neutral tint beneath the subject.
- **Model delivery.** `scripts/prepare-background-model.mjs` downloads and SHA-256-verifies
  `isnet-general-use.onnx` and deletes any superseded model file, so an upgraded installation does
  not keep `u2netp.onnx`. Attribution moved to `LICENSES/DIS-Apache-2.0.txt`; the upstream project is
  Apache-2.0, as U2NetP was.

## Tradeoffs

The model file grows from 4.6 MB to 170 MB, inference takes about five seconds instead of under one,
and resident memory peaks near 1 GB. That is acceptable for the single-image, serialized, on-request
path this feature uses, and it is the cost of the quality difference. Deployments remain fully local
and offline at runtime.

Phase 1 is deliberately target-unaware: on the Phase 2 regression photo the film boxes come back
clean, but the hand holding them is retained. Selecting the intended item remains Phase 2 work.

## Files

- `server/src/integrations/backgroundRemoval.js` - new model, thresholds, cleanup, and shadow.
- `scripts/prepare-background-model.mjs` - new model, checksum, and removal of superseded files.
- `server/models/README.md`, `LICENSES/DIS-Apache-2.0.txt`, `README.md` - model documentation and
  licensing.
- `test/background-removal.test.js`, `test/fixtures/sound-blaster-audigy-ls-on-bubble-wrap.jpg` -
  regression coverage; the fixture moved out of `docs/issues/assets/` with the completed task file.
- `docs/features/ai-add-item.md`, `docs/HOW-TO.md`, `docs/ROADMAP.md`, `AGENTS.md`,
  `docs/issues/TASK-background-removal-quality-phase-2.md` - documentation.

## Verification

- `npm run lint` - clean.
- `npm test` - passed, including the new stubbed-mask checks (speck and haze removal, hole filling,
  shadow presence, absent subject) and the real-model run over the bubble-wrap regression photo,
  which asserts background cleanliness, a clean padded border, subject coverage, and the shadow.
- `npm run build` - client compiled.
- `npm run test:e2e` - passed; the browser suite mocks the endpoint, so its expectations were
  unchanged.
- Inspected the rendered output for both regression photos. The expansion card comes back on clean
  white with no bubble-wrap fragments, no translucent halo, and a visible soft shadow, which is a
  clear improvement over the 0.13.x result.
