# Tabler photo carousel on the item page

Completed on 2026-09-21 for version `0.17.0`.

`ItemPhotoViewer.vue` no longer navigates photos with the **Previous** and **Next** text buttons.
Two or more photos are now shown in the Tabler/Bootstrap carousel that `@tabler/core` already
styles: arrow controls over the left and right edge of the image, compact indicator bars at the
bottom of the image area that jump straight to a photo, and the unchanged `2 / 3` counter in the row
below. A single photo is still rendered as a plain `photo-frame` without any control, and an item
without photos keeps its empty state. The filename row and **Delete photo** stay below the image, so
the overlaid controls never cover them.

No carousel dependency was added, and no second Bootstrap. The component drives the active slide
itself and only borrows Tabler's markup and styles; importing the Tabler script bundle for one
component would have pulled Bootstrap's whole JavaScript and Popper into the client. As a result
nothing can auto-rotate the slides, and a slide change is immediate instead of animated.

Mouse drag and touch swipe share one pair of pointer handlers on `carousel-inner`: a horizontal
movement of at least 40 px moves one slide, shorter movements stay ordinary clicks, and the controls
sit outside `carousel-inner` so they keep working. Bootstrap's `pointer-event` class keeps
`touch-action: pan-y`, so vertical scrolling on a phone is unaffected.

Deleting a photo still goes through `ItemDetails.vue` and `DELETE /api/photos/:id`; the photo API and
storage are untouched. The viewer now keeps the photo it was showing when it survived the reload and
otherwise falls back to the nearest remaining position, so the carousel can never point at a removed
slide, and it drops to single-photo or empty mode as the list shrinks.

Accessibility: filenames remain the `alt` text, the arrows are buttons labelled *Previous photo* and
*Next photo*, each indicator is a button labelled *Show photo N of M* with `aria-current` on the
active one, and the heading and carousel ids come from `useId()` so several viewers could share a
page. `client/src/style.css` keeps the overlaid controls light in both color modes and puts a
translucent backdrop behind the indicators, which Tabler would otherwise paint black in dark mode.

`test/e2e/photos.spec.js` gained coverage for the single-photo state, arrow and indicator navigation
including the cyclic wrap, mouse drag in both directions and a movement too small to count, deleting
the first, a middle, and the last photo down to the empty state, and a touch swipe on a phone
viewport. The light and dark rendering was checked from browser screenshots of the carousel.

Documentation: the new [`docs/features/item-photo-carousel.md`](../features/item-photo-carousel.md)
with its index entry, the rewritten photo step in [`docs/HOW-TO.md`](../HOW-TO.md), and the removal
of the completed roadmap entry. The task file `docs/issues/TASK-tabler-photo-carousel.md` was
deleted.

Verification performed:

- `npm run lint`
- `npm test`
- `npm run build`
- `npm run test:e2e` — 36 passed
