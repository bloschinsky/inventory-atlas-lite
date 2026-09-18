# Fix the theme toggle in the desktop sidebar

- **Completed:** 2026-09-18
- **Version:** 0.7.0 (unchanged; this finishes the same unreleased version line as the Tabler
  migration in [`2026-09-18-tabler-ui-migration.md`](2026-09-18-tabler-ui-migration.md))

## What was implemented

Two follow-up fixes to the light/dark toggle introduced by the Tabler migration, found by manual
review before the first release of that UI:

1. The toggle stacked its two buttons vertically (`btn-group-vertical`) in the desktop sidebar footer
   while the mobile header kept them horizontal (`btn-group`). `ThemeToggle.vue` now always renders
   the horizontal `btn-group`; the `vertical` prop was removed.
2. At their normal horizontal size the two buttons do not fit the folded `4rem` icon rail and
   overflowed it. The sidebar footer now hides the toggle in that resting state and only shows it
   once the rail expands on hover or keyboard focus — the same moment Tabler reveals the navigation
   labels. `.d-flex` carries `!important` in Tabler, so the wrapper's centering moved into a small
   `.app-sidebar-theme` rule in `client/src/style.css` instead of the Bootstrap utility class, which
   is what let the `display: none` override take effect. The mobile header keeps its own always-
   visible toggle; that behaviour was not touched.

## Verification

```bash
npm run lint     # pass
npm test         # 16 pass, 1 skip
npm run build    # pass
npm run test:e2e # 16 passed
```

`test/e2e/theme.spec.js` now hovers the sidebar before clicking its toggle buttons, matching the new
resting-state visibility. Confirmed visually in Chromium at `1440x900`: the toggle is absent from the
folded rail, appears on hover, and disappears again once the pointer leaves.
