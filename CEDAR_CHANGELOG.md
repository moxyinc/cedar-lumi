# Cedar-Lumi Changelog

All notable changes to the Cedar fork of Lumi are recorded here.
See [CEDAR_PATCHES.md](CEDAR_PATCHES.md) for full technical documentation.

Format: `## [version] — YYYY-MM-DD`

---

## [1.0.0] — 2026-08-10

Initial stable Cedar release. All fixes confirmed working on cedarhq.ca
(WordPress + LearnDash + Tin Canny, production).

### Fixed
- **SCORM export: `</script>` injection failure** — H5P library JS contains
  raw `</script>` strings that break inline script blocks. Moved all JS/CSS
  to external files (`assets/h5p-bundle.js`, `assets/h5p-bundle.css`) so the
  HTML parser never truncates them.
- **Icon-only buttons in Tin Canny iframe** — `@container (max-width: 250px)`
  query fires in TC's narrow iframe and strips button text labels. Added
  `cedar-custom.js` MutationObserver that removes the `icon-only` class and
  forces `--is-icon-only: 0` / `--label-display: inline-block` on all five
  quiz action buttons.
- **Fonts not loading in SCORM** — Added Libre Franklin and H5PFontIcons
  `@font-face` declarations to `cedar-custom.css` with bundled font files.
- **Video-only IV never completing** — H5P Interactive Video only fires
  `completed` via the Summary Dialog Submit button. Added
  `startIVCompletionMonitor()` in `h5p-adaptor.js` that polls every second
  and fires `completed` when the video reaches 5 seconds before its end.
- **LearnDash Mark Complete not activating** — TC's `saveDataValue` hook
  requires `cmi.core.score.raw` to be set before `cmi.core.lesson_status`,
  and lesson_status must be `'passed'` or `'failed'` (not `'completed'`).
  Video-only completion now sets `score.raw = 100` then `lesson_status = passed`.

### Added
- `cedar/cedar.js` — MutationObserver fix for icon-only buttons
- `cedar/cedar.css` — font declarations
- `cedar/fonts/` — Libre Franklin 400/700 and H5PFontIcons
- `assets/scorm-client/h5p-adaptor.js` — H5P → SCORM/xAPI bridge with
  IV completion monitor and Tin Canny xAPI forwarding
- `CEDAR_PATCHES.md` — full technical documentation and operational notes
- `CEDAR_CHANGELOG.md` — this file
