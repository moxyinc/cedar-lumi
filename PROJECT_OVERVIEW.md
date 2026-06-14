# Cedar Lumi — Project Overview

## What this is

cedar-lumi is a fork of [Lumi Desktop](https://github.com/Lumieducation/Lumi),
an Electron app for authoring H5P content and exporting it as SCORM packages.
The fork is maintained by Jesse (Moxy) for **Cedar** (cedarhq.ca), an
e-learning platform on WordPress + LearnDash + Tin Canny (TC) Reporting + H5P.

**Goal:** SCORM packages exported from cedar-lumi should render and report
identically to how the content looks/behaves in Lumi's own **View** tab when
embedded in Tin Canny's nested iframe on Cedar.

## Environment

- Lumi source (reference/upstream checkout): `/Users/moxy/Lumi` (Node 24 via nvm)
- Fork repo: `/Users/moxy/cedar-lumi`
- Active work happens in git worktrees under
  `/Users/moxy/cedar-lumi/.claude/worktrees/<name>` — always run npm commands
  from inside the worktree, not the bare repo checkout
- Local Cedar: `cedarhq.local` (Local.app, nginx, PHP 8.4)
- Production Cedar: `cedarhq.ca` (WPMU DEV hosted)
- Tin Canny: SCORM packages are uploaded via TC's Content Manager and served
  from `wp-content/uploads/uncanny-snc/<entry>/`
- H5P content types in use: Interactive Video (IV 1.27 — do **not** use 1.28),
  Course Presentation (CP 1.27), Multiple Choice, Single Choice Set
- Key shared library: H5P.Components 1.0.91 (drives the theme/button system)

## Current status

| Area | Status |
|---|---|
| Icon-only quiz buttons (Check/Continue/etc. lose their text label in TC) | **Fixed** |
| Fonts (Libre Franklin) / icon fonts (H5PFontIcons) in SCORM | **Fixed** |
| xAPI → Tin Canny reporting (Target column, per-question results) | **In progress** — forwarding implemented, TC field mapping unconfirmed |

See [CEDAR_PATCHES.md](CEDAR_PATCHES.md) for full root-cause analysis, the
solution for each item, what was tried and rejected, and a testing checklist.

## How the SCORM export works

- [src/ops/export-h5p.ts](src/ops/export-h5p.ts) — orchestrates the SCORM
  export. Builds a `BundleCapture`, runs `HtmlExporter`, then writes external
  asset files (`assets/h5p-bundle.js`, `assets/h5p-bundle.css`,
  `assets/cedar-custom.js`, `assets/cedar-custom.css`, fonts) into the package
  before `simple-scorm-packager` zips it up.
- [src/ops/templates/scorm.ts](src/ops/templates/scorm.ts) —
  `createCedarScormTemplate()`, the lean HTML shell used for SCORM (external
  `<script src>` / `<link>` refs instead of inline bundles — see
  CEDAR_PATCHES.md for why).
- [cedar/cedar.js](cedar/cedar.js) / [cedar/cedar.css](cedar/cedar.css) —
  Cedar-specific fixes copied into every SCORM export as
  `assets/cedar-custom.js` / `assets/cedar-custom.css`. `cedar.js` is the
  icon-only MutationObserver fix; `cedar.css` is font declarations only.
- [cedar/fonts/](cedar/fonts/) — Libre Franklin + H5PFontIcons files bundled
  into every export.
- [assets/scorm-client/h5p-adaptor.js](assets/scorm-client/h5p-adaptor.js) —
  the SCORM/xAPI bridge: maps H5P xAPI events to SCORM `cmi.*` calls
  (LearnDash) and forwards raw xAPI statements to TC's
  `process-xapi-statement` endpoint.
- [patches/@lumieducation+h5p-html-exporter+9.3.3.patch](patches/) —
  patch-package patch for the upstream exporter (applied via `postinstall`).

### SCORM zip layout
```
index.html, SCORM_API_wrapper.js, h5p-adaptor.js
assets/ → h5p-bundle.js, h5p-bundle.css, cedar-custom.js, cedar-custom.css
fonts/  → libre-franklin-*.woff2/.woff, h5p-font-icons.woff/.ttf
content/ → H5P content resources
```

## Build / run / test

From inside the active worktree:
```bash
nvm use 24
npm install            # runs patch-package via postinstall
npm run build          # tsc -> build/
npm start              # npx electron .  (launches the desktop app)
npm run lint
npm run format:check
```

There is no automated test suite for the SCORM export pipeline — verification
is manual: export a SCORM package from the app, upload it to `cedarhq.local`
via Tin Canny's Content Manager, and check it in the browser (see
CEDAR_PATCHES.md → Testing Checklist).

## What not to change

- The H5P authoring/editing workflow — this fork is purely about the SCORM
  export path
- How Lumi saves `.h5p` files or talks to the H5P Hub for library updates
- The existing LearnDash SCORM completion/score path in `h5p-adaptor.js`
  (`cmi.core.score.*`, lesson status) — TC xAPI forwarding is additive
- The `npm start` / `npm run build` workflows
