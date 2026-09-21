# Task: Replace Photo Prev/Next Viewer with Tabler Carousel

## Goal

Replace the current custom photo navigation in `ItemPhotoViewer.vue` with a Tabler/Bootstrap carousel using indicators.

Remove the current visible `Previous` / `Next` text buttons.

## Requirements

Use the existing project dependency:

```text
@tabler/core
```

Use the Tabler / Bootstrap carousel markup and behavior already available in the project.

Do not add another carousel library unless absolutely necessary.

## Behavior

### Single photo

If the item has exactly one photo:

- show the photo normally
- do not show carousel arrows
- do not show indicators

### Multiple photos

If the item has 2+ photos:

- display them as a carousel
- show previous/next arrow controls over the photo
- show clickable indicators
- indicators should allow direct navigation to a specific photo
- support touch swipe on mobile/tablet
- disable automatic slide rotation/autoplay
- keep navigation cyclic unless Bootstrap behavior requires otherwise

Preferred indicator style:

- compact lines/bars or standard Tabler/Bootstrap indicators
- visually unobtrusive
- positioned at the bottom of the image area

## Desktop Drag

Add mouse/pointer drag navigation if it can be implemented cleanly without replacing the standard carousel.

Expected behavior:

- drag left -> next photo
- drag right -> previous photo
- ignore very small accidental pointer movements
- normal clicks on controls/indicators must still work

Use Pointer Events if custom handling is needed.

Do not introduce a heavy dependency only for desktop dragging.

## Existing Features to Preserve

Keep:

- current photo rendering via `/api/photos/:id`
- current image sizing / `photo-frame` behavior
- filename display
- `Delete photo` action
- delete confirmation flow handled by the parent
- no-photo empty state
- accessibility labels

## Delete Behavior

Deleting the active photo must not break carousel state.

After deletion:

- keep a valid active slide
- if possible select the nearest remaining photo
- if only one photo remains, switch to single-photo mode
- if no photos remain, show the existing empty state

Do not leave the carousel pointing to a removed slide.

## Vue Implementation

Keep the component self-contained.

Avoid manual photo index state where Bootstrap carousel state can be used directly.

If local state is still required for delete/current filename behavior, keep it minimal and synchronized with carousel events.

Ensure generated carousel IDs are safe if more than one viewer could ever exist on the same page.

## Accessibility

Include:

- meaningful `alt` text
- accessible previous/next labels
- indicators with slide labels
- keyboard-compatible native carousel controls where supported

Do not rely on swipe/drag as the only navigation method.

## Responsive Behavior

Verify on:

- desktop
- tablet
- phone

Touch swipe must work on supported mobile browsers.

Controls and indicators must not overlap the `Delete photo` action or filename row.

## Tests

Add/update tests for:

- zero photos
- one photo
- multiple photos
- next/previous navigation
- direct indicator navigation
- deleting first photo
- deleting middle photo
- deleting last photo
- transition from multiple photos to one photo
- transition from one photo to zero photos

If existing E2E coverage is available, add a mobile/touch-oriented carousel test where practical.

## Acceptance Criteria

- `Previous` / `Next` text buttons are removed.
- Multiple photos use a Tabler/Bootstrap carousel.
- Arrow controls are displayed over the image.
- Clickable indicators are displayed for multiple photos.
- Touch swipe works on mobile.
- Autoplay is disabled.
- Desktop pointer drag works if implemented without a new heavy dependency.
- Single-photo and no-photo states stay clean.
- Delete behavior remains correct.
- Existing photo API and storage behavior are unchanged.
- No unnecessary carousel dependency is added.
- Lint and tests pass.
