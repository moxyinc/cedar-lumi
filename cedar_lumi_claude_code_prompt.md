# Cedar Lumi Fork — Claude Code Prompt

## Project Overview

You are working on a fork of **Lumi Desktop** (https://github.com/Lumieducation/Lumi), an Electron-based desktop application that allows educators to create H5P content and export it as SCORM packages.

This fork is called **cedar-lumi** and is maintained by Jesse (Moxy) for the **Cedar** e-learning platform (cedarhq.ca), which runs WordPress + LearnDash + Tin Canny Reporting + H5P.

The primary goal of this fork is to fix a fundamental problem with Lumi's SCORM export pipeline: **content that looks correct in Lumi's View tab renders differently when uploaded to Cedar via Tin Canny's SCORM Content Manager**. This is a rendering consistency problem that has been traced to how Lumi bundles CSS and JavaScript into the exported SCORM HTML file.

---

## Environment

- **Lumi source**: `/Users/moxy/Lumi` (Node 24 via nvm, built from source)
- **Local Cedar**: `cedarhq.local` (Local.app, nginx, PHP 8.4)
- **Production Cedar**: `cedarhq.ca` (WPMU DEV hosted)
- **Tin Canny**: SCORM packages are uploaded via Tin Canny's Content Manager and served from `wp-content/uploads/uncanny-snc/<entry>/`
- **H5P content types in use**: Interactive Video (IV 1.27), Course Presentation (CP 1.27), Multiple Choice, Single Choice Set
- **Key library**: H5P.Components 1.0.91 (shared component library used by all modern H5P content types)

---

## The Core Problem

### What works
Lumi's **View tab** renders H5P content correctly. Fonts load, buttons display with text labels, icons render, hover states animate. This is the ground truth — this is what the content should look like.

### What doesn't work
When Lumi exports a SCORM package and it is uploaded to Cedar via Tin Canny, the rendered output is different:

1. **Buttons render as icon-only squares** — quiz dialog buttons (Check, Continue, Show Solution, Retry) collapse to small squares showing only an icon, with no text label
2. **Fonts may not apply consistently** — Libre Franklin (Cedar's custom font) sometimes falls back to Arial or system fonts
3. **Icon fonts may not load** — H5PFontIcons (used for tip/comment icons) sometimes fail to render

### Root cause: the `icon-only` class problem (most critical)

H5P.Components 1.0.91 uses a **CSS container query** to determine when buttons should collapse to icon-only display:

```css
@container (max-width: 250px) {
  .h5p-theme-primary-cta {
    --is-icon-only: 1;
  }
}
```

JavaScript in `h5p-components.js` reads this CSS custom property and adds the `icon-only` class to buttons when `--is-icon-only` equals `1`. This fires during initial render when the SCORM content is loading inside Tin Canny's iframe and the container briefly measures as very narrow. Once the `icon-only` class is added, it persists even after the container expands to its correct width.

**In Lumi's View tab**: The container never measures as narrow during initial render, so `icon-only` is never added. Buttons display correctly.

**In Cedar/Tin Canny**: The SCORM is loaded inside a nested iframe structure (`tc_index.html` → `index.html`). During the initial load sequence, the container briefly measures as too narrow, triggering the container query, which triggers JavaScript to add `icon-only`. The button stays collapsed.

**Why CSS overrides don't fix it**: CSS custom properties set by container queries cannot be reliably overridden with `!important` — the container query re-fires on resize and wins again. JavaScript adds the class after CSS is parsed, so CSS-only solutions don't prevent the class from being added.

### Root cause: CSS injection is unreliable

Lumi's SCORM exporter in `@lumieducation/h5p-html-exporter` generates a single large HTML file (`index.html`) where all H5P library CSS and JavaScript is bundled as inline `<style>` and `<script>` blocks. Specifically:

- `scriptsBundle` — a concatenated string of all H5P library JavaScript files, wrapped in a single `<script>` tag
- `stylesBundle` — a concatenated string of all H5P library CSS files, wrapped in a single `<style>` tag

**The injection problem**: `scriptsBundle` contains raw `</script>` strings from the H5P libraries. When a browser parses the HTML, it sees the first `</script>` and closes the script block prematurely. Any JavaScript injected after `scriptsBundle` via a separate `<script>` tag is never properly executed because the surrounding HTML structure is already broken. Attempts to inject a MutationObserver or other fix script as a separate `<script>` block after `</body>` fail for this reason.

**The CSS injection workaround**: CSS does not have this problem — `</style>` inside a `<style>` block would break parsing, but H5P CSS does not contain raw `</style>` strings. However, appending CSS to `stylesBundle` still fails to fix the `icon-only` problem because it's a JavaScript class problem, not a CSS problem.

---

## Key Files

### In `@lumieducation/h5p-html-exporter` (npm package, lives in `node_modules`)

```
/Users/moxy/Lumi/node_modules/@lumieducation/h5p-html-exporter/build/
  HtmlExporter.js     — main exporter, assembles scriptsBundle + stylesBundle
  framedTemplate.js   — template function that generates the index.html string
```

**`framedTemplate.js` current state** (after Cedar patches):
```javascript
exports.default = (function (integration, scriptsBundle, stylesBundle, contentId) {
  return "\n<!doctype html>\n    <html class=\"h5p-iframe\">\n    <head>..." 
  + scriptsBundle 
  + "...</script>\n        <style>" 
  + stylesBundle 
  + "</style>\n</head>\n    <body>\n        <div class=\"h5p-content h5p-theme h5p-large lag\" data-content-id=\""
  + contentId 
  + "\"></div>\n    </body>\n</html>";
});
```

Note the `.h5p-content` div has been patched to include `h5p-theme h5p-large` classes (Cedar Fix 6).

### In Lumi assets (persistent, survives `npm install`)

```
/Users/moxy/Lumi/assets/h5p/core/styles/
  h5p.css                  — core H5P styles (patched: Libre Franklin font, H5PFontIcons)
  h5p-theme.css            — H5P theme styles (patched: Cedar button overrides)
  font-libre-franklin.css  — Libre Franklin @font-face declarations
  h5p-fonts.css            — other font declarations

/Users/moxy/Lumi/assets/h5p/core/fonts/
  libre-franklin/
    libre-franklin-400.woff2   — must be real woff2, not PHP error page
    libre-franklin-700.woff2   — must be real woff2, not PHP error page
  h5p-font-icons.woff          — copied from H5P.FontIcons-1.0 library
  h5p-font-icons.ttf           — copied from H5P.FontIcons-1.0 library
```

### In Lumi libraries (user data, not source)

```
~/Library/Application Support/Lumi/libraries/
  H5P.InteractiveVideo-1.27/   — must use 1.27, not 1.28
  H5P.InteractiveVideo-1.28/   — present but should not be used
  H5P.Components-1.0/          — contains h5p-components.js with icon-only logic
  H5P.FontIcons-1.0/           — source of h5p font icon files
```

### On Cedar WordPress

```
wp-content/mu-plugins/
  cedar-h5p-overrides.php   — enqueues the CSS file
  cedar-h5p-overrides.css   — CSS overrides for inline H5P content (NOT SCORM)
```

---

## What Has Already Been Tried (Do Not Repeat)

### Attempted: Injecting `<script>` after `</body>` in framedTemplate.js
**Result**: Lumi crashes with `SyntaxError: Invalid or unexpected token` because the injected HTML is inside a JavaScript string — unescaped `<` and `>` characters break the JS parser.

### Attempted: Escaping the injected script properly in framedTemplate.js
**Result**: Lumi loads, but the MutationObserver script does not appear in the exported SCORM bundle. `scriptsBundle` contains raw `</script>` strings that close the script block early in the HTML parser, preventing the injected `<script>` tag from being parsed.

### Attempted: Appending CSS to `stylesBundle` in HtmlExporter.js
**Result**: CSS appears in the SCORM bundle correctly, but CSS overrides cannot prevent JavaScript from adding the `icon-only` class after CSS is parsed. The container query and JS class mutation happen after CSS is applied.

### Attempted: CSS `!important` overrides targeting `.h5p-theme-button.icon-only`
**Result**: Does not work. CSS custom properties (`--label-display`) set by container queries cannot be reliably overridden with `!important` in all browsers.

### Attempted: Setting `--is-icon-only: 0 !important` on `.h5p-theme-primary-cta`
**Result**: Container query re-fires on any resize event and overrides the value again.

### Attempted: MutationObserver appended to scriptsBundle concat
**Result**: Valid JS, passes `node --check`, but still does not execute in the rendered SCORM because HTML parser closes `<script>` block at first `</script>` inside `scriptsBundle`.

---

## What Needs to Be Built

### Goal
**SCORM exports from cedar-lumi must render identically to Lumi's View tab when loaded inside Tin Canny's nested iframe structure on Cedar.**

### Deliverable 1: Restructured SCORM HTML output

The current single-file approach (everything inline in `index.html`) is the source of most problems. The SCORM zip should be restructured to use **separate files** referenced via `<link>` and `<script src="">` tags:

```
index.html          — lean HTML shell, references external files
assets/
  h5p-bundle.js     — all H5P library JavaScript (currently scriptsBundle)
  h5p-bundle.css    — all H5P library CSS (currently stylesBundle)  
  cedar-custom.css  — Cedar-specific CSS overrides, loaded LAST
  cedar-custom.js   — Cedar-specific JavaScript fixes, loaded LAST
```

By using external file references instead of inline content:
- `</script>` inside `h5p-bundle.js` is safe — it's a `.js` file, not embedded in HTML
- `cedar-custom.js` is a separate file loaded after H5P, so it executes reliably
- `cedar-custom.css` is loaded last with `<link>` so it has natural cascade precedence
- The HTML parser never sees raw `</script>` or `</style>` inside the HTML document

**Note**: SCORM 1.2 and 2004 support external file references inside the zip package. The `imsmanifest.xml` must list all files. The existing Lumi exporter already creates a zip — this approach adds more files to that zip.

### Deliverable 2: `cedar-custom.js` — reliable fix for `icon-only`

This JavaScript file runs after H5P.Components has initialized. It uses a MutationObserver to watch for `icon-only` being added to buttons and immediately removes it:

```javascript
(function() {
  'use strict';
  
  var TARGET_SELECTORS = [
    '.h5p-theme-check',
    '.h5p-theme-continue', 
    '.h5p-theme-show-solutions',
    '.h5p-theme-retry',
    '.h5p-theme-show-results'
  ].join(',');

  function fixIconOnlyButtons(root) {
    var scope = root || document;
    scope.querySelectorAll(TARGET_SELECTORS).forEach(function(btn) {
      if (btn.classList.contains('icon-only')) {
        btn.classList.remove('icon-only');
        btn.style.setProperty('--is-icon-only', '0', 'important');
      }
    });
  }

  // Run immediately
  fixIconOnlyButtons();

  // Watch for dynamically added/modified elements
  var observer = new MutationObserver(function(mutations) {
    var needsFix = false;
    mutations.forEach(function(mutation) {
      if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
        if (mutation.target.classList.contains('icon-only')) {
          needsFix = true;
        }
      }
      if (mutation.type === 'childList') {
        needsFix = true;
      }
    });
    if (needsFix) {
      fixIconOnlyButtons();
    }
  });

  document.addEventListener('DOMContentLoaded', function() {
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class']
    });
    // Run again after a short delay to catch late renders
    setTimeout(fixIconOnlyButtons, 100);
    setTimeout(fixIconOnlyButtons, 500);
    setTimeout(fixIconOnlyButtons, 1000);
  });
  
  // Also run on any H5P resize events
  if (window.H5P) {
    H5P.externalDispatcher.on('resize', fixIconOnlyButtons);
  }
  document.addEventListener('h5pInitialized', fixIconOnlyButtons);
})();
```

### Deliverable 3: `cedar-custom.css` — Cedar font and theme overrides

This CSS file is loaded LAST, after all H5P CSS, and applies Cedar's custom styling:

```css
/* Cedar: Libre Franklin as default H5P font */
@font-face {
  font-family: 'Libre Franklin';
  src: url('../fonts/libre-franklin-400.woff2') format('woff2');
  font-weight: 400;
  font-style: normal;
}
@font-face {
  font-family: 'Libre Franklin';
  src: url('../fonts/libre-franklin-700.woff2') format('woff2');
  font-weight: 700;
  font-style: normal;
}

/* Cedar: H5PFontIcons */
@font-face {
  font-family: 'H5PFontIcons';
  src: url('../fonts/h5p-font-icons.woff') format('woff'),
       url('../fonts/h5p-font-icons.ttf') format('truetype');
}

/* Cedar: apply Libre Franklin without overriding icon fonts */
.h5p-content {
  font-family: 'Libre Franklin', sans-serif;
}
.h5p-content *:not(span[class*="joubel-icon"]):not(span[class*="h5p-icon"]):not([class*="FontIcon"]):not(button) {
  font-family: 'Libre Franklin', sans-serif;
}

/* Cedar: H5P theme font variable */
:root {
  --h5p-theme-font-name: 'Libre Franklin', sans-serif;
}

/* Cedar: button border fix */
.h5p-theme-button {
  border-style: solid !important;
}

/* Cedar: force label display on IV quiz buttons */
.h5p-theme-check,
.h5p-theme-continue,
.h5p-theme-show-solutions,
.h5p-theme-retry,
.h5p-theme-show-results {
  --label-display: inline-block !important;
  padding: 0.5em 1em !important;
  border-radius: 6px !important;
  font-size: 0.85rem !important;
  gap: 0.4em !important;
  border-style: solid !important;
}
```

### Deliverable 4: `cedar.css` project config file

Add support for a `cedar.css` file in the Lumi project root (or a configurable path) that is automatically included in every SCORM export as `cedar-custom.css`. This makes the custom CSS a first-class part of the authoring workflow rather than a node_modules hack.

Similarly, support a `cedar.js` file that becomes `cedar-custom.js` in the export.

### Deliverable 5: Updated `framedTemplate.js`

The template should generate a lean HTML shell:

```html
<!doctype html>
<html class="h5p-iframe">
<head>
  <meta charset="utf-8">
  <script>H5PIntegration = [INTEGRATION_JSON];</script>
  <link rel="stylesheet" href="assets/h5p-bundle.css">
  <link rel="stylesheet" href="assets/cedar-custom.css">
</head>
<body>
  <div class="h5p-content h5p-theme h5p-large lag" data-content-id="[CONTENT_ID]"></div>
  <script src="assets/h5p-bundle.js"></script>
  <script src="assets/cedar-custom.js"></script>
</body>
</html>
```

Note: `H5PIntegration` JSON must remain inline because it contains dynamic content-specific data. The `cedar-custom.js` is loaded at the end of `<body>` so it runs after H5P initializes.

### Deliverable 6: Updated `imsmanifest.xml`

The SCORM manifest must list all files in the package. Update the manifest generation to include the new asset files.

---

## H5P Content Version Pinning

### Interactive Video must use 1.27, not 1.28

WordPress upgraded H5P.InteractiveVideo to 1.28, which broke result screen buttons. H5P.org itself uses IV 1.27. Cedar content must be pinned to 1.27.

Add a post-import script or Lumi setting that automatically patches `h5p.json` in the content folder:

```javascript
// In h5p.json preloadedDependencies, ensure IV is 1.27
// This runs automatically when content is opened in cedar-lumi
for (const dep of content.preloadedDependencies) {
  if (dep.machineName === 'H5P.InteractiveVideo' && dep.minorVersion === 28) {
    dep.minorVersion = 27;
  }
}
```

---

## Testing Requirements

### Local test environment
- Cedar local: `cedarhq.local` (Local.app)
- Tin Canny installed on local Cedar
- Upload SCORM via Tin Canny Content Manager
- Open in browser and verify buttons render with text labels, not icon-only

### Pass criteria
1. **Interactive Video quiz dialog**: Check and Continue buttons show text labels with icons on hover, matching Lumi View tab exactly
2. **Interactive Video result screen**: Show Solution and Retry buttons render with text labels
3. **Font**: All H5P content uses Libre Franklin, not Arial or system sans-serif
4. **Icons**: Joubel tip icons and comment icons render (H5PFontIcons)
5. **No regressions**: SCORM completion/scoring still reports correctly to LearnDash via Tin Canny

### Verification method
Open browser DevTools on the Cedar page with Tin Canny SCORM open. In the console:
```javascript
// Check button class — should NOT contain 'icon-only'
const f = document.querySelector('iframe[src*="uncanny-snc"]');
const inner = f.contentDocument.querySelector('iframe');
const doc = inner.contentDocument;
doc.querySelector('.h5p-theme-check').className;
// Expected: "h5p-theme-button h5p-theme-primary-cta h5p-theme-check"
// NOT: "h5p-theme-button h5p-theme-primary-cta h5p-theme-check icon-only"
```

---

## Repository Structure

The fork should be structured as:

```
cedar-lumi/
  src/                          — Lumi source (unchanged where possible)
  cedar/                        — Cedar-specific additions
    cedar.css                   — Cedar custom CSS (included in every SCORM export)
    cedar.js                    — Cedar custom JS (included in every SCORM export)
    fonts/                      — Cedar font files bundled into SCORM exports
      libre-franklin-400.woff2
      libre-franklin-700.woff2
      h5p-font-icons.woff
      h5p-font-icons.ttf
  CEDAR_PATCHES.md              — Documents every change and why
  patches/                      — Patch files for npm packages in node_modules
    h5p-html-exporter.patch     — Patches to HtmlExporter.js and framedTemplate.js
```

Use `patch-package` (https://www.npmjs.com/package/patch-package) to manage changes to `node_modules/@lumieducation/h5p-html-exporter` so they survive `npm install`. Add a `postinstall` script to `package.json`:

```json
"scripts": {
  "postinstall": "patch-package"
}
```

---

## What NOT to Change

- Do not modify the H5P authoring/editing workflow — this is purely a SCORM export concern
- Do not change how Lumi saves `.h5p` files
- Do not change how Lumi connects to the H5P Hub for library updates
- Do not modify the xAPI/SCORM communication layer — Tin Canny must still receive completion data correctly
- Do not introduce dependencies that break the existing `npm start` / `npm run build` workflow

---

## Reference Document

A detailed fix history document (`Lumi_Desktop_Fix_Reference.docx`) is available that covers all 14 fixes applied to date including exact commands, root cause analysis, and current status. This should be read before beginning work to avoid repeating failed approaches.

Key fixes already applied to the asset files (these should be preserved in the fork):
- Fix 3: H5P core CSS restored (h5p.css)
- Fix 4: Libre Franklin font (font-libre-franklin.css + woff2 files)
- Fix 6: SCORM template h5p-theme class and density
- Fix 7: Inter font files
- Fix 8: Cedar CSS overrides in h5p-theme.css
- Fix 9: H5PFontIcons font files
- Fix 10: Libre Franklin override not blocking icon fonts

---

## Getting Started

1. Fork https://github.com/Lumieducation/Lumi to your GitHub account as `cedar-lumi`
2. Clone locally: `git clone https://github.com/[your-account]/cedar-lumi /Users/moxy/cedar-lumi`
3. Run `nvm use 24 && npm install`
4. Install patch-package: `npm install patch-package --save-dev`
5. Read `CEDAR_PATCHES.md` and the fix reference document
6. Begin with the `framedTemplate.js` restructure — this is the foundation everything else depends on
7. Test each change by exporting a SCORM and uploading to `cedarhq.local` via Tin Canny
8. When a fix is confirmed working on local, document it in `CEDAR_PATCHES.md`

The single most important success criterion: **a Multiple Choice quiz inside an Interactive Video, when uploaded to Cedar via Tin Canny, must show the Check button with the text "Check" visible — not just a small blue icon square.**
