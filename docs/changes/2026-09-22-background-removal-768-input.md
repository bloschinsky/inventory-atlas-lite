# Run background removal at a 768x768 input

**Completion date:** 2026-09-22

**Version:** 0.24.1

## Summary

Follow-up to the Phase 1 rework in 0.24.0, which ran IS-Net at 1024x1024 and peaked near 1 GB of
resident memory - uncomfortably close to the 1 GiB container limit this application is deployed into.
The model now runs at 768x768.

Lowering the constant was not possible with the model 0.24.0 pinned. The rembg release mirror's
`isnet-general-use.onnx` bakes `1024x1024` into the declared shape of every node, not just the graph
input, so `onnxruntime` rejects any other size (`/stage1/Concat_2 [ShapeInferenceError] Inferred=24
Declared=32`). The model file itself had to change.

- **Model.** Pinned `isnet-general-use-dynamic.onnx`, an ONNX re-export of the same checkpoint with
  dynamic spatial axes, taken from
  <https://huggingface.co/SacredNoir/isnet-general-use-onnx> at revision
  `ff56cb825ee2637d4726f8a739fb7bf1bf4bea04` and accepted only on its SHA-256. It is Apache-2.0, as
  the upstream DIS project is.
- **Equivalence check.** Both exports were run against the regression photo at 1024x1024. The masks
  differ by at most 3e-6 (mean 3e-8), so this is the same checkpoint re-exported, not a different
  model. The foreground share at 768 is 0.3475 against 0.3466 at 1024.
- **Pipeline.** `MODEL_SIZE` is 768. Nothing else in the cleanup, framing, or shadow changed; the
  thresholds are ratios and absolute mask values, so they carry over unchanged.
- **Cleanup.** `prepare-background-model.mjs` deletes superseded models, so upgrading from 0.24.0
  removes the 170 MB fixed-size file rather than keeping both.

## Measurements

Same machine, the Sound Blaster regression photo, wall clock for one full request:

| Export | Input | Inference | Peak RSS |
| --- | --- | --- | --- |
| rembg mirror (0.24.0) | 1024 | 4.5 s | ~1000 MB |
| dynamic re-export | 1024 | 3.8 s | 914 MB |
| dynamic re-export (0.24.1) | 768 | 2.3 s | 648 MB |

## Tradeoffs

The build artifact now comes from a HuggingFace account rather than the rembg GitHub release mirror
the project already trusted. That is a weaker provenance signal, mitigated by pinning the repository
revision, verifying the SHA-256, and proving numeric equivalence against the trusted export. The
reasoning is recorded in `server/models/README.md` so a future reader does not have to rediscover
why the obvious source was not used.

768 is below the resolution IS-Net was trained at. The measured mask difference is under a tenth of
a per cent on the regression photo, but very thin structures could in principle resolve slightly
less well than at 1024.

## Files

- `server/src/integrations/backgroundRemoval.js` - `MODEL_SIZE`, model path, and the reasoning
  comment.
- `scripts/prepare-background-model.mjs` - new artifact, URL, and checksum.
- `test/background-removal.test.js` - mask grid and the synthetic mask coordinates rescaled to 768.
- `server/models/README.md`, `docs/features/ai-add-item.md`, `docs/HOW-TO.md`, `README.md` -
  documentation.

## Verification

- `npm run lint` - clean.
- `npm test` - passed, including the real-model run over the regression photo.
- `npm run build` - client compiled.
- `npm run test:e2e` - passed.
- Rendered both regression photos at 768 and inspected them: the expansion card and the film boxes
  both come back on clean white with the soft shadow and no visible difference from the 0.24.0
  output.
