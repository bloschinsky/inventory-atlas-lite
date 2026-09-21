# Item photo carousel

The photo card on the item details page (`client/src/components/ItemPhotoViewer.vue`) shows the
stored photos of one item. It renders three states and nothing else: an empty state, a plain single
photo, and a carousel for two or more photos.

## States

| Photos | What is rendered |
| --- | --- |
| 0 | The `photo-frame` empty state, *No photos for this item yet.* No filename row, no actions. |
| 1 | The photo inside `photo-frame`. No arrows, no indicators, no position counter. |
| 2+ | The carousel, with arrow controls over the image, indicators at the bottom of the image area, and a `2 / 3` position counter in the row below. |

The filename row and the **Delete photo** action are shown for every item that has at least one
photo, and always below the image area, so the overlaid controls never cover them.

## Carousel

The markup is the Tabler/Bootstrap carousel (`carousel`, `carousel-inner`, `carousel-item`,
`carousel-control-prev` / `-next`, `carousel-indicators`) that `@tabler/core` already styles. The
active slide is driven by the component itself, not by Bootstrap JavaScript: the project loads only
Tabler's stylesheet, and pulling in the Tabler script bundle for one component would add Bootstrap's
full JavaScript and Popper to the client. Consequences of that choice:

- there is no autoplay and no `data-bs-ride` behavior to disable — nothing rotates the slides;
- slides switch immediately, without the Bootstrap slide animation;
- everything else, including the styling of the controls and indicators, is Tabler's.

Navigation is cyclic: **Next photo** on the last photo shows the first one, and **Previous photo** on
the first shows the last. An indicator jumps straight to its own photo.

## Pointer drag and touch swipe

One pair of pointer handlers on `carousel-inner` covers mouse drag and touch swipe. A primary
pointer press records the horizontal start position, and the release moves one slide when the
distance is at least 40 px: dragging left shows the next photo, dragging right the previous one.
Shorter movements are ignored, so ordinary clicks still work, and the arrows and indicators are
outside `carousel-inner` and therefore never swallowed by a drag.

The carousel carries Bootstrap's `pointer-event` class, which sets `touch-action: pan-y`, so a
vertical swipe still scrolls the page on a phone. Native image dragging is disabled on the slides.

## Delete behavior

The component never deletes anything itself: **Delete photo** emits `delete` with the id of the
photo on screen, `ItemDetails.vue` confirms, calls `DELETE /api/photos/:id`, and reloads the item.
When the new photo list arrives, the viewer keeps showing the same photo if it survived; otherwise it
falls back to the nearest remaining position — the photo that moved into the freed slot, or the
previous one when the last photo was deleted. Two photos become the single-photo state and one photo
becomes the empty state, so no control ever points at a removed slide.

## Accessibility

The card is labelled by a visually hidden *Photos* heading, each slide image uses its filename as
`alt` text, the arrows are real buttons labelled *Previous photo* and *Next photo*, and each
indicator is a button labelled *Show photo N of M* that carries `aria-current="true"` while it is the
active slide. All of them are reachable and operable from the keyboard, so swiping is never the only
way to navigate. The heading and carousel ids are derived from Vue's `useId()`, so several viewers on
one page stay unique.

## Coverage

`test/e2e/photos.spec.js` covers the single-photo state, arrow and indicator navigation including
the cyclic wrap, mouse drag in both directions with a movement too small to count, deleting the
first, a middle, and the last photo down to the empty state, and a touch swipe on a phone viewport.
`test/e2e/responsive.spec.js` keeps the phone layout order of the photo card.
