# About dialog and build metadata

## Summary

Every page of Inventory Atlas Lite offers an **About** entry in the navigation. It opens a compact
Tabler modal that identifies the application, the exact revision it was built from, its developer,
and the public repository. The version, build revision, and source date are resolved once at build
time — from the release environment or from Git — so no component holds a release constant and no
file is edited by hand for a release.

## User-visible behaviour

- **About** is the last entry of the navigation list, with an information icon. It sits in the
  folded desktop sidebar next to the three destinations and in the mobile offcanvas drawer. Choosing
  it in the drawer closes the drawer and opens the dialog in its place.
- The dialog shows the product mark and name, a **Version** / **Build** / **Build date** list, the
  line *Developed by Artem Bloschinsky*, and a **GitHub repository** link to
  `https://github.com/bloschinsky/inventory-atlas-lite`. The link opens in a new browsing context
  with `rel="noopener noreferrer"`; the short commit SHA is shown in a monospace face.
- It is a `role="dialog"` with `aria-modal="true"`, labelled by its **About** heading. Opening it
  moves the focus to the header close button and keeps the focus inside; `Escape`, the header close
  button, the footer **Close** button, and a click on the backdrop all close it and return the focus
  to the entry that opened it. The page behind it does not scroll.
- The dialog is an overlay only: it changes no route, loads no data, and calls no API. It always
  opens, whatever the build metadata turned out to be.
- Both colour modes are covered, because the dialog is Tabler's own modal and the few extra rules
  use Tabler custom properties.

## Where the values come from

`vite.config.js` resolves the metadata once and injects it through Vite's `define` as
`__APP_BUILD_INFO__`. Nothing in the client reads Git, and the server is not involved.

| Field | Resolution order |
| --- | --- |
| Version | `APP_VERSION` (or `VITE_APP_VERSION`) → the Git tag on `HEAD` → `<package.json version>-dev` in a working copy → the `package.json` version without a repository |
| Build | `APP_BUILD` (or `VITE_APP_BUILD`) → `git rev-parse --short HEAD` → `unavailable` |
| Build date | `APP_BUILD_DATE` (or `VITE_APP_BUILD_DATE`) → the `HEAD` commit timestamp as `YYYY-MM-DD` in UTC → `unavailable` |

A leading `v` is stripped, so the tag `v0.9.0` is displayed as version `0.9.0`. The date is the
commit timestamp rather than the clock of the build machine, so rebuilding the same revision always
shows the same source date. Every Git call is guarded: a missing `git` binary, a source archive
without a repository, or a repository without commits falls back instead of failing the build.

`client/src/build-info.js` is the single module the interface reads. It exports one `appInfo` object
that adds the constant product name, developer, and repository URL to the injected values.

## Behaviour per distribution

- **Development** (`npm run dev`): the working copy is untagged, so the version carries the `-dev`
  marker, for example `0.9.0-dev`, with the current short SHA and commit date.
- **Tagged build**: a build made at a `vMAJOR.MINOR.PATCH` tag shows that version, the tag's commit,
  and the commit date. The release pipeline also validates that the tag equals the committed
  `package.json` version.
- **Release archive and Docker**: the source archive published by the release pipeline contains no
  `.git`, so the version falls back to the committed `package.json` version — the same number the
  tag was validated against — and the build and date read `unavailable` unless the build is given
  `APP_BUILD` and `APP_BUILD_DATE`.

Any pipeline can feed the three `APP_*` variables. The mechanism is independent of Docker, Proxmox,
Electron, and GitHub Actions: it is plain environment variables plus optional Git, and nothing in
the About component knows which distribution it is running in.

## Implementation overview

- `vite.config.js` resolves the metadata and defines `__APP_BUILD_INFO__`. The resolution lives in
  the Vite config rather than a separate script so that the Docker build, which copies only
  `index.html`, `vite.config.js`, `client/`, and the manifests, keeps working unchanged.
- `client/src/build-info.js` exports `appInfo`, the single source the interface reads.
- `client/src/about.js` holds the shared `aboutOpen` state with `openAbout`/`closeAbout`, in the same
  style as `client/src/theme.js`.
- `client/src/components/AboutDialog.vue` renders Bootstrap's modal markup from Vue state and owns
  the scroll lock, the `Escape` handler, the focus containment, and the focus restore. As with the
  mobile drawer, no Bootstrap or Tabler JavaScript bundle is loaded.
- `client/src/App.vue` renders one instance for the whole shell, so both navigations open the same
  dialog.
- `client/src/components/AppNavigation.vue` appends the **About** entry as a `button` styled as a
  navigation link, and emits `navigate` before opening so the mobile drawer closes first.
- `client/src/style.css` adds the button reset for that entry and the stacked brand and metadata
  grid, all from Tabler custom properties.
- `eslint.config.js` declares `__APP_BUILD_INFO__` as a read-only browser global.

## Verification

- `npm run lint`, `npm test`, `npm run build`, and `npm run test:e2e` pass.
- `test/e2e/about.spec.js` covers opening the dialog, the focus landing inside it, the product name,
  the developer line, the repository link target, the three metadata values being present, closing
  with `Escape` with the focus restored, closing with the **Close** button without leaving the page,
  and the drawer entry on a `390 × 844` screen.
- All four metadata paths were resolved directly from `vite.config.js`: the `APP_*` environment
  variables (`v0.9.0` → `0.9.0`), a Git tag on `HEAD`, an untagged working copy (`0.9.0-dev` with the
  current SHA and commit date), and a directory without a repository (`unavailable` for build and
  date).
- The dialog was inspected in Chromium in both colour modes at `1440` and at `390` pixels.

## Notes and limitations

- The dialog shows identity and build metadata only. Changelog, diagnostics, system or database
  information, licence text, and update controls are deliberately out of scope.
- The repository has no logo image, so the dialog reuses the inline brand mark of the shell.
- `Version` may legitimately read `0.9.0-dev` locally; that marker means the working copy is not at
  a tag, not that anything is wrong.
- The existing release workflow does not yet pass `APP_BUILD` and `APP_BUILD_DATE` into the Docker
  image build, so an image built from the release archive shows `unavailable` for those two fields.
  Adding the two build arguments is all that is required.
- There is no copy-to-clipboard action for the build information.
