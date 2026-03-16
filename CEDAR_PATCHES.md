# Cedar-Lumi Patch Reference

This document records every deliberate change made to cedar-lumi and why.
Update this file whenever a new fix is added or an existing fix changes.

---

## Cedar Fix: External SCORM Asset Files

**Status:** Active — primary fix for the icon-only button problem
**Files changed:**
- `src/ops/templates/scorm.ts` — new `createCedarScormTemplate` export
- `src/ops/export-h5p.ts` — SCORM path uses cedar template + writes external files
- `cedar/cedar.js` — Cedar icon-only fix + H5P event hooks
- `cedar/cedar.css` — Cedar font declarations + button overrides
- `cedar/fonts/` — Libre Franklin and H5PFontIcons font files

### Root cause
H5P library JavaScript contains raw `</script>` strings (as string literals in
JS code). When the scripts bundle is embedded inline inside an HTML `<script>`
block, the browser's HTML parser encounters these strings and closes the script
block prematurely. Any script injected *after* the bundle — e.g. a
MutationObserver fix — lives outside the prematurely-closed block and is never
executed reliably.

Additionally, `@container` queries in H5P.Components CSS set `--is-icon-only: 1`
when the container is narrower than 250px. JavaScript in h5p-components.js reads
this property and adds the `icon-only` class to quiz buttons. Inside Tin Canny's
nested iframe the container briefly measures as very narrow during initial load,
so the class gets added and sticks — even after the container expands.

### Solution
**External JS/CSS files instead of inline bundles.**

The SCORM zip now contains:
```
index.html                  lean HTML shell
SCORM_API_wrapper.js        SCORM 1.2 API
h5p-adaptor.js              H5P → SCORM bridge
assets/
  h5p-bundle.js             all H5P library JavaScript (was inline)
  h5p-bundle.css            all H5P library CSS (was inline)
  cedar-custom.js           Cedar icon-only fix
  cedar-custom.css          Cedar fonts + button overrides
fonts/
  libre-franklin-400.woff2
  libre-franklin-400.woff
  libre-franklin-700.woff2
  libre-franklin-700.woff
  h5p-font-icons.woff
  h5p-font-icons.ttf
content/                    H5P content resources (images, video, etc.)
```

Script load order in `index.html`:
1. `<script>H5PIntegration = ...;</script>` — inline integration JSON
2. `SCORM_API_wrapper.js` — SCORM API (must be before h5p-adaptor)
3. `h5p-adaptor.js` — registers H5P xAPI event listeners (before H5P loads)
4. `assets/h5p-bundle.css` — via `<link>` in `<head>`
5. `assets/cedar-custom.css` — via `<link>` in `<head>`, LAST for cascade
6. `assets/h5p-bundle.js` — at end of `<body>` (H5P initializes here)
7. `assets/cedar-custom.js` — at end of `<body>`, AFTER H5P

Benefits:
- `.js` files are parsed as JavaScript, so `</script>` inside them is safe
- `cedar-custom.js` is a guaranteed separate execution context
- `cedar-custom.css` is loaded last so it wins the CSS cascade naturally

### Why Lumi View shows "Check" text but Cedar SCORM didn't

The `framedTemplate.js` patch (node_modules) injects a MutationObserver inline
inside the `<script>` block immediately after the H5P scripts bundle. It removes
the `icon-only` class and forces `--is-icon-only: 0 !important` on the five quiz
action buttons.

In Lumi's Electron app the IV popup dialog is wide enough that `.h5p-navigation`
stays ≥ 250px and the container query rarely fires. The observer is a backup.

In Cedar SCORM running in Tin Canny's nested iframe, the iframe is narrower, the
IV popup is proportionally smaller, and `.h5p-navigation` consistently measures
< 250px. The container query fires, H5P JS reads `--is-icon-only:1` and adds
`icon-only` → buttons go icon-only, lose text, lose hover animation.

Without an equivalent observer in cedar-custom.js the two contexts diverge.

### cedar-custom.js — MutationObserver fix (restored)
Mirrors the fix already in framedTemplate.js. Runs on DOMContentLoaded, after
500 ms, and on every DOM mutation. For each of the five quiz action buttons:
  1. removes the `icon-only` class (added by H5P JS after reading the CSS var)
  2. sets `--is-icon-only: 0 !important` (overrides container query value)
  3. sets `--label-display: inline-block !important` (explicitly overrides the
     `--label-display:none` that the container query also sets — framedTemplate
     doesn't need this because the popup is wide enough in Electron, but the
     SCORM context requires it)

### cedar-custom.css — fonts only
- Declares `@font-face` for Libre Franklin 400/700 (woff2 + woff)
- Declares `@font-face` for H5PFontIcons (woff + ttf)
- Applies Libre Franklin to `.h5p-content` without affecting icon-font spans
- Sets `--h5p-theme-font-name` CSS variable
- NO button class overrides — those are handled entirely by cedar-custom.js

### Implementation notes
A `BundleCapture` object is passed from `exportH5P()` into
`createCedarScormTemplate()`. When `HtmlExporter.createBundleWithExternalContentResources()`
calls the template, the template stores `scriptsBundle` and `stylesBundle` in
the capture object and returns lean HTML. `exportScorm()` then reads the capture
and writes the bundle files to tmpDir before `simple-scorm-packager` zips
everything up.

---

## Previously Applied Fixes (carried forward from /Users/moxy/Lumi)

These fixes were applied to the original `/Users/moxy/Lumi` working copy.
They are carried forward in this fork as-is (committed to the branch).

| Fix | Location | Description |
|-----|----------|-------------|
| Fix 3 | `assets/h5p/core/styles/h5p.css` | H5P core CSS restored |
| Fix 4 | `assets/h5p/core/styles/` + fonts | Libre Franklin font declarations |
| Fix 6 | `framedTemplate.js` (node_modules) | `h5p-theme h5p-large` classes on content div (View tab only; SCORM now handled by cedar template) |
| Fix 7 | `assets/h5p/core/fonts/` | Inter font files |
| Fix 8 | `assets/h5p/core/styles/h5p-theme.css` | Cedar CSS overrides — Course Presentation nav button border-radius/label fixes only. Button label overrides (`--label-display: inline-block !important`) removed — H5P's container query handles icon-only correctly. |
| Fix 9 | `assets/h5p/core/fonts/` | H5PFontIcons font files |
| Fix 10 | `assets/h5p/core/styles/h5p.css` | Libre Franklin override not blocking icon fonts |

---

## Testing Checklist

After exporting a SCORM package and uploading to cedarhq.local via Tin Canny:

```javascript
// In browser DevTools, with the Tin Canny iframe open:
const outerFrame = document.querySelector('iframe[src*="uncanny-snc"]');
const innerFrame = outerFrame.contentDocument.querySelector('iframe');
const doc = innerFrame.contentDocument;

// 1. Check button class — must NOT contain 'icon-only'
doc.querySelector('.h5p-theme-check').className;
// Expected: "h5p-theme-button h5p-theme-primary-cta h5p-theme-check"

// 2. Check cedar-custom.js loaded
typeof doc.defaultView.__cedarFixApplied; // should be truthy if you add a sentinel

// 3. Check font
getComputedStyle(doc.querySelector('.h5p-content')).fontFamily;
// Expected: contains 'Libre Franklin'
```

Pass criteria:
1. Check/Continue buttons show text labels with icons (not icon-only squares)
2. Show Solution/Retry buttons on result screen show text labels
3. Font is Libre Franklin, not Arial or system sans-serif
4. H5PFontIcons render (tip/comment icons in IV)
5. SCORM completion/score reports correctly to LearnDash via Tin Canny
