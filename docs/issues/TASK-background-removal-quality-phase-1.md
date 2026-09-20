# Task: Improve AI background removal quality — Phase 1

**Status:** Planned\
**Priority:** High\
**Type:** Quality improvement / feature refinement\
**Blocked by:** None\
**Related to:** `docs/changes/2026-09-20-ai-add-item-background-removal.md`

---

## Summary

The current background-removal implementation added in `0.13.x` works technically, but the visual quality is not good enough for real inventory use.

Real test images show common failures:

- residual background fragments remain around the subject;
- semi-transparent “dirty halos” appear around the object;
- hands, bubble wrap, table fragments, or surrounding clutter are often treated as part of the foreground;
- the final result looks visually unclean and not suitable as a polished inventory photo.

The current implementation uses local CPU segmentation with **U2NetP** and a simple mask-to-white-canvas pipeline. This is too weak for the required quality level.

This task improves the current implementation **without changing the user workflow** and **without yet introducing target-aware object extraction**.

---

## Goal

Improve the quality of the existing local background-removal pipeline so the produced image is visibly cleaner and more reliable for typical inventory photos.

Phase 1 should focus on:

1. replacing the weak segmentation model with a stronger still-practical local model;
2. improving mask post-processing and cleanup;
3. producing a cleaner white-background result with a controlled soft shadow;
4. adding regression coverage based on real-world failure cases.

---

## Problem statement

The current system behaves like generic foreground/background segmentation, not like polished inventory cutout generation.

Observed technical reasons:

- **U2NetP is too lightweight** and often misclassifies clutter as foreground.
- The current alpha handling preserves too much uncertain mask area, creating gray semi-transparent artifacts.
- The pipeline does not sufficiently clean the mask after model inference.
- There is no proper synthetic shadow layer; some residual artifacts visually resemble a shadow even though they are just leftover background.

---

## Scope

### In scope

- Replace the current segmentation model with a stronger local model appropriate for CPU/server-side use.
- Improve mask thresholding and cleanup.
- Reduce halos, noise, and small leftover islands.
- Add proper white-background composition with a subtle artificial shadow.
- Keep the existing API and UI workflow intact.
- Add real regression test fixtures and automated checks.
- Update documentation.

### Out of scope

- Using OpenAI or any external AI provider for actual background removal.
- Per-item or prompt-guided object selection.
- Multiple-object semantic selection.
- Major UI redesign.
- Batch processing.
- Background replacement with anything other than white.

---

## Functional requirements

### 1. Stronger segmentation model

Replace **U2NetP** with a stronger local segmentation model that materially improves cutout quality while remaining practical for local deployment.

Implementation notes:

- Prefer a modern general-purpose background-removal model such as **BiRefNet General Lite** or another clearly stronger alternative.
- The chosen model must be documented in the code and in docs.
- The chosen model must be compatible with the project’s deployment model and licensing constraints.
- The model must still run locally and offline at runtime after installation/build.
- If the new model requires a different input size than `320x320`, update the pipeline accordingly.

### 2. Better mask post-processing

Improve the raw segmentation output before compositing.

At minimum, evaluate and implement as needed:

- stronger foreground/background thresholding;
- conversion of uncertain soft-mask edges into cleaner usable alpha;
- removal of tiny disconnected regions / specks;
- optional morphological cleanup (open/close, erode/dilate, feathering where appropriate);
- edge smoothing that reduces jaggedness without creating visible glow/halo.

The output should prefer a **clean object silhouette** over retaining every uncertain edge fragment.

### 3. Cleaner subject extraction

The produced result must:

- preserve the main subject at the original aspect ratio;
- place it centered on a white background;
- keep pleasant padding;
- avoid obvious background leftovers;
- avoid dark or gray contour contamination around the subject.

### 4. Controlled soft shadow

Add a subtle synthetic shadow under/behind the isolated subject.

Requirements:

- the shadow must be generated intentionally, not inherited from leftover mask noise;
- it must be light and visually clean;
- it must improve realism without becoming distracting;
- it must not make the item look blurry or dirty.

### 5. Fallback behavior

If local processing fails:

- keep the current fallback behavior;
- do not lose the AI draft;
- continue to use the original photo;
- show the existing warning or an equivalent user-friendly warning.

---

## Non-functional requirements

- The feature must remain local/offline at runtime.
- No new Internet dependency at inference time.
- Memory and CPU usage may increase moderately, but must remain reasonable for self-hosted homelab usage.
- Keep the current single-image serialized processing approach unless a change is clearly justified.
- Do not degrade the normal non-background-removal workflow.

---

## Test data and regression coverage

Add a regression set based on real-world failure patterns similar to:

1. camera held in hand;
2. small boxed consumer item held in hand;
3. PCB / expansion card photographed on bubble wrap or textured surface.

### Provided regression asset

[`phase-1-sound-blaster-audigy-ls-on-bubble-wrap.jpg`](assets/phase-1-sound-blaster-audigy-ls-on-bubble-wrap.jpg)
shows a Sound Blaster Audigy LS sound card on textured bubble wrap. Use it to evaluate surface
cleanup, preservation of the card silhouette, and the removal of background fragments without
target-aware object selection.

These regression cases should be used to validate that Phase 1 improves:

- background cleanliness;
- reduction of halos;
- reduction of random leftover fragments;
- overall subject isolation quality.

### Important note

The current deterministic unit test with a perfect synthetic mask is not enough.

Add tests that validate the actual end-to-end behavior more realistically, even if some checks remain heuristic rather than pixel-perfect.

---

## Acceptance criteria

Phase 1 is complete when all of the following are true:

1. The project no longer uses U2NetP for the main background-removal path.
2. Real example outputs are visibly cleaner than the current `0.13.x` results.
3. Leftover background fragments are significantly reduced.
4. Dirty translucent halos are significantly reduced.
5. A proper subtle synthetic shadow is present in the final output.
6. The existing API contract and user workflow remain intact.
7. Failure fallback still works correctly.
8. Tests and docs are updated.

---

## Deliverables

- updated local background-removal implementation;
- updated model acquisition/preparation flow;
- updated tests;
- updated documentation;
- a short change note describing the improvement and tradeoffs.

---

## Suggested implementation plan

1. Evaluate replacement model candidates.
2. Integrate the selected model.
3. Adjust input preprocessing and inference pipeline.
4. Improve alpha thresholding and mask cleanup.
5. Add synthetic shadow step.
6. Build a small regression set and automated checks.
7. Update docs and release note.

---

## Documentation to update

At minimum update:

- feature docs for AI Add Item / background removal;
- implementation or architecture note for local background removal;
- change log / completed change note.

---

## Notes for the implementer

Do **not** attempt target-aware “keep only the inventory item” logic in this phase.\
This phase is about making the current generic local cutout pipeline meaningfully better first.

That more advanced object-specific extraction is intentionally deferred to Phase 2.
