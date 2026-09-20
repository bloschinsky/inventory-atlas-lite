# Task: Improve AI background removal quality — Phase 2 (target-aware object extraction)

**Status:** Planned\
**Priority:** High\
**Type:** Feature enhancement / quality improvement\
**Blocked by:** [`TASK-background-removal-quality-phase-1.md`](TASK-background-removal-quality-phase-1.md)\
**Related to:** [`TASK-background-removal-quality-phase-1.md`](TASK-background-removal-quality-phase-1.md)

---

## Summary

Phase 1 improves generic local cutout quality, but that alone does not solve the most important inventory-specific problem:

> the system often keeps the whole foreground composition instead of only the inventory item.

Examples:

- camera + hand;
- film boxes + fingers;
- sound card + bubble wrap region;
- item + stand/support/accessories that are not meant to stay in the final catalog photo.

For inventory use, the real goal is not generic background removal.\
The goal is:

> keep only the intended inventory object and remove unrelated surrounding foreground elements.

This task introduces a **target-aware object extraction** pipeline.

---

## Goal

Extend the background-removal workflow so the system can isolate the **intended inventory item itself**, not merely the broad foreground.

Phase 2 should use information already available during AI item analysis (or a directly related follow-up step) to guide local segmentation toward the correct object.

---

## Problem statement

Even a better general-purpose background-removal model can still fail on cases where:

- a hand overlaps the item;
- the item is photographed while being held;
- nearby clutter is visually merged with the item;
- the biggest salient foreground object is actually “item + hand” rather than the item alone.

That means generic segmentation quality improvements are helpful but not sufficient.

The system needs an inventory-specific second layer:

1. identify which object in the image is the intended item;
2. use that signal to drive local segmentation;
3. keep the intended item while excluding non-item foreground elements when possible.

---

## Dependency

This task is **blocked by Phase 1**.

Do not start Phase 2 until Phase 1 is complete, because:

- Phase 1 provides the improved baseline local segmentation stack;
- Phase 2 should build on that stronger foundation rather than on the current weak pipeline;
- otherwise implementation complexity increases while base quality remains poor.

---

## Scope

### In scope

- introduce target-aware object extraction;
- use AI analysis output and/or a related local selection signal to identify the intended item;
- guide segmentation toward the intended object;
- improve held-item and cluttered-scene behavior;
- add regression coverage for item-vs-hand and item-vs-clutter separation.

### Out of scope

- full manual mask editor;
- arbitrary Photoshop-like user editing tools;
- bulk multi-item scene annotation UI;
- support for extracting multiple independent objects from one image in one pass.

---

## Functional requirements

### 1. Target-awareness

The pipeline must stop treating the entire foreground as the subject when enough evidence exists to identify the intended item.

At minimum, the design must support one of these approaches:

- AI analysis returns an approximate **bounding box / region of interest** for the intended item;
- AI analysis returns enough structured localization data to seed local segmentation;
- a local segmentation model such as SAM-like tooling is guided by positive/negative prompts or box prompts;
- another robust target-aware strategy that is clearly documented and justified.

### 2. Separation of analysis and cutout responsibilities

Keep the conceptual separation:

- **item analysis** identifies what the item is and optionally where it is;
- **local processing** performs the actual extraction/cutout.

Do not replace the local cutout step with a remote/provider-side image-editing dependency.

### 3. Preserve current user workflow

The user-facing workflow should remain simple:

- choose photo;
- optionally enable Remove background;
- analyze;
- review the proposed result.

If extra processing happens, it should be internal and should not complicate the common path.

### 4. Better handling of held items

The improved system should materially reduce cases where:

- fingers stay around a small box;
- an entire hand remains attached to a camera;
- supporting surface fragments remain attached to the item.

Perfect removal is not required in every case, but the result must be meaningfully better than generic segmentation alone.

### 5. Fallback and resilience

If target-aware extraction cannot confidently improve the result:

- gracefully fall back to the Phase 1 generic improved cutout pipeline;
- or fall back to the original image if processing fails;
- do not break the AI Add Item flow.

---

## Possible implementation directions

The exact implementation is up to the agent, but acceptable directions include:

### Option A — AI-guided bounding box + local segmentation
- During item analysis, also return approximate item coordinates / box.
- Feed that region into a local segmentation tool.
- Use the segmentation result as the final mask.

### Option B — SAM-style local guided segmentation
- Use a local model that accepts box prompts or point prompts.
- Generate those prompts from analysis output.
- Select the main region corresponding to the intended inventory item.

### Option C — Hybrid selection logic
- Run segmentation proposals locally.
- Use AI metadata or heuristic scoring to select the best proposal representing the intended item.

The chosen approach must be documented clearly with tradeoffs.

---

## Non-functional requirements

- Runtime inference should remain local for the cutout step.
- Internet/provider usage should not increase substantially beyond the existing AI analysis step unless clearly justified and explicitly documented.
- The implementation must remain practical for self-hosted homelab deployment.
- Licensing of any added model(s) must be checked and documented.

---

## Test data and regression coverage

Add or reuse real regression examples similar to:

1. camera held in hand;
2. small retail box or film box held in fingers;
3. PCB / item on textured packing material;
4. item with nearby clutter or support object.

### Provided regression asset

[`phase-2-svema-ds-4-film-boxes-in-hand.jpg`](assets/phase-2-svema-ds-4-film-boxes-in-hand.jpg)
shows a pair of Svema DS-4 film boxes held in a hand against bubble wrap. Use it to evaluate
target-aware selection: preserve the intended film-box group while excluding the hand and
surrounding background.

The regression focus for Phase 2 is not just “clean mask”, but specifically:

- **correct item selection**;
- **removal of hands / fingers when they are not the target item**;
- **reduction of attached non-item foreground clutter**.

---

## Acceptance criteria

Phase 2 is complete when all of the following are true:

1. The implementation is explicitly target-aware, not just generic background removal.
2. The system can use a localization signal or equivalent object-selection signal for the intended item.
3. Held-item scenarios are materially improved compared with Phase 1 alone.
4. The workflow remains simple for the user.
5. There is a clear fallback path to the Phase 1 behavior or original image.
6. Tests and docs are updated.
7. Tradeoffs and limitations are documented.

---

## Deliverables

- target-aware extraction implementation;
- updated AI analysis contract if needed;
- updated local segmentation integration;
- updated tests and regression coverage;
- updated documentation and completed change note.

---

## Documentation to update

At minimum update:

- AI Add Item feature documentation;
- local background-removal implementation documentation;
- any API contract docs impacted by localization / target-aware selection;
- change log / completed change note.

---

## Notes for the implementer

Do not over-engineer the UI.\
This task is primarily about **better automatic object isolation** for inventory photos.

A good result is one where the user still does the same simple flow, but the produced white-background photo much more often contains **only the actual inventory item**.
