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

### cedar-custom.css — fonts only (one layout exception)
- Declares `@font-face` for Libre Franklin 400/700 (woff2 + woff)
- Declares `@font-face` for H5PFontIcons (woff + ttf)
- Applies Libre Franklin to `.h5p-content` without affecting icon-font spans
- Sets `--h5p-theme-font-name` CSS variable
- NO button class overrides — those are handled entirely by cedar-custom.js
- Exception: the T/F video popup height cap (see "Cedar Fix: T/F Video Popup
  Height" below). It targets a `<video>` element, not buttons.

### Implementation notes
A `BundleCapture` object is passed from `exportH5P()` into
`createCedarScormTemplate()`. When `HtmlExporter.createBundleWithExternalContentResources()`
calls the template, the template stores `scriptsBundle` and `stylesBundle` in
the capture object and returns lean HTML. `exportScorm()` then reads the capture
and writes the bundle files to tmpDir before `simple-scorm-packager` zips
everything up.

---

## Cedar Fix: IV Completion Without Summary Dialog

**Status:** Active — confirmed working on cedarhq.ca (production)
**Files changed:**
- `assets/scorm-client/h5p-adaptor.js` — added `startIVCompletionMonitor()`

### Problem
H5P Interactive Video only fires the `completed` xAPI verb when the learner
clicks Submit in the Summary Dialog endscreen. When the Summary Dialog is
removed (empty `summaries` array → `hasMainSummary()` returns false), the
endscreen is never shown and `completed` is never fired. For video-only IVs
(no quiz interactions), the `answered` fallback in `h5p-adaptor.js` also
never fires. Result: SCORM `lesson_status` stays `incomplete` for the entire
session regardless of how much of the video the learner watched.

### Why CSS/xAPI-only fixes don't work
The `completed` verb is only emitted from `handleSubmit` inside the endscreen
component — there is no other code path in IV 1.27 or 1.28 that fires it.
The three verbs IV can emit are `answered`, `completed`, and `interacted`.
When the video reaches `H5P.Video.ENDED`, IV only updates the play button
state — no xAPI event is triggered.

### Solution
`startIVCompletionMonitor()` polls every second from `window.onload`. For
each H5P instance that has a `video` property and `hasMainSummary() === false`,
it compares `getCurrentTime()` against `getDuration() - 5`. When current time
reaches within 5 seconds of the end, it fires `inst.triggerXAPI('completed',
{result:{completion:true}})` once and stops polling. The xAPI event goes
through H5P's own event system so the statement object.id is correctly
built from `H5PIntegration.contents`.

The 5-second threshold means learners who close the video slightly before the
very end still receive credit. With Prevent Skipping enabled (production
setting), learners must genuinely watch to near the end to trigger it.

Instances where `hasMainSummary()` returns true are skipped — those will fire
`completed` via the Submit button as normal.

### How TC updates LearnDash (confirmed from call stack)

TC's SCORM driver (`scormdriver.js`) has a `saveDataValue` hook that watches
every `LMSSetValue` call in real time. When `cmi.core.lesson_status` is set
to `'passed'` or `'failed'`, `saveDataValue` immediately fires an AJAX request
(`modules.js → markComplete`) that updates the LearnDash lesson status and
activates the Mark Complete button — **without waiting for LMSFinish**.

Confirmed call stack on cedarhq.ca:
```
setCompletion (h5p-adaptor.js)
→ pipwerks.SCORM.data.set('cmi.core.lesson_status', 'passed')
→ LMSSetValue (scormdriver.js)
→ saveDataValue (scormdriver.js:269)
→ tincannyModuleController.markComplete (modules.js:418)
→ XMLHttpRequest → WordPress → LearnDash updated ✓
```

`LMSFinish` / `terminateAttempt` / `xapi.terminateAttempt` are **not** involved
in the LearnDash update. `window.onunload` calling `end()` is cleanup-only and
is intentionally blocked by `Permissions-Policy: unload=()` on cedarhq.ca.

### Critical: score.raw must be set before lesson_status

TC's `saveDataValue` only calls `markComplete` when `cmi.core.lesson_status`
is set to a terminal value AND `cmi.core.score.raw` has already been set.
For video-only content (no quiz score), `setCompletion` explicitly sets
`score.raw = 100` before setting `lesson_status = 'passed'`. Without this,
the monitor triggered `completed` with no score and `markComplete` never fired.

### lesson_status must be 'passed' or 'failed', not 'completed'

TC's `saveDataValue` only calls `markComplete` for 'passed' or 'failed', not
for the SCORM 'completed' status. Video-only content uses 'passed'.

---

## Cedar Fix: xAPI Reporting to Tin Canny

**Status:** Active — core forwarding works; Target-column field mapping pending
confirmation from Uncanny Owl
**Files changed:**
- `assets/scorm-client/h5p-adaptor.js` — H5P → SCORM/xAPI bridge

### Goal
Cedar's SCORM packages need to report per-question results (not just overall
completion/score) to Tin Canny (TC), so TC's gradebook/reporting shows which
question ("Target") a learner answered and whether they got it right.

### Background: SCORM vs xAPI in this package
The SCORM zip uses SCORM 1.2/2004 (`SCORM_API_wrapper.js` / `pipwerks.SCORM`)
for completion/score reporting to LearnDash. Separately, H5P content types
emit xAPI statements (`answered`, `completed`, etc.) via
`H5P.externalDispatcher`. `h5p-adaptor.js` listens for these and:
1. Writes SCORM `cmi.interactions.*` / `cmi.core.score.*` / completion status
   — the existing LearnDash path, unchanged
2. **New:** forwards the raw xAPI statement to TC's
   `/wp-admin/admin-ajax.php?action=process-xapi-statement` endpoint so TC's
   own reporting tables get populated (Target column etc.)

### Why `H5P.externalDispatcher`, not `H5P.instances`
`H5P.instances` is empty when `h5p-adaptor.js` first runs — H5P initializes
content asynchronously. xAPI events are dispatched with `external: true`, so
they always reach `H5P.externalDispatcher` regardless of init timing. Hooking
`instances` directly (tried first) missed every event.

### SCORM `cmi.interactions` mapping (LearnDash path, via SCORM)
- On `answered`: increments `interactionCount`, sets
  `cmi.interactions.<n>.id` (question name, from
  `object.definition.name['en-US']`, falling back to the last path segment of
  `object.id`), `.type` (from `object.definition.interactionType`, default
  `choice`), and `.result` (`correct` / `wrong` / `unanticipated`, derived from
  `result.success` or `result.score.scaled === 1`)
- On `answered` with a `result`: also calls `setCompletion(result)` as a
  fallback, in case the content type never fires `completed`
- On `completed`: always calls `setCompletion(result || null)` — sets
  `cmi.core.score.*` if a score is present, and sets lesson status to
  `completed` / `passed` / `failed` based on `cmi.student_data.mastery_score`
  (1.2) or `cmi.scaled_passing_score` (2004)

### Forwarding raw xAPI to TC (`forwardToTC`)
- `tcActor` is built once on SCORM `init()` from `cmi.core.student_name` /
  `cmi.core.student_id` (email → `mbox`, otherwise `account.homePage` +
  `name`, falling back to a synthesized mbox)
- Each xAPI statement is repackaged with a fresh UUID `id`, current
  `timestamp`, the `tcActor`, and the original `verb` / `object` / `result` /
  `context`
- **`object.id` fix:** H5P objects use bare numeric local IDs (not valid
  IRIs). TC requires a valid IRI, so non-`http` ids are rewritten to
  `<site origin>/h5p/activity/<id>`
- **Encoding fix (2026-03-27):** TC's `process-xapi-statement` endpoint reads
  `$_POST['statement']`, not a raw JSON body. The request is sent as
  `Content-Type: application/x-www-form-urlencoded` with body
  `statement=<url-encoded JSON>` — sending `application/json` caused TC to
  silently fail to parse the statement (Target column stayed empty)

### Open / pending
- Confirm with Uncanny Owl the exact field TC reads for the "Target" column
  (currently assumed to be `object.definition.name`) — flagged as unconfirmed
  in the 2026-03-25 forwarding commit
- No automated test for the TC forwarding path yet — verify manually (see
  Testing Checklist)

---

## Cedar Fix: T/F Video Popup Height

**Status:** Active. Tested against a real SCORM export in headless Chromium at
7 player sizes (760x600 to 1920x1080).
**Files changed:**
- `cedar/cedar.css` (ships as `assets/cedar-custom.css` in the SCORM zip): rule appended at end, header comment updated
- `assets/h5p/core/styles/h5p-theme.css`: same rule appended so Lumi's View tab matches the SCORM output

### Root cause
In Interactive Video, a True/False question is used as a popup to show a
video. The video renders at its natural aspect-ratio height, which is taller
than the IV dialog, so the Check button falls below the fold and learners
have to scroll inside the dialog to find it.

### Solution
```css
.h5p-interactive-video .h5p-dialog .h5p-true-false .h5p-question-video video.h5p-video {
  max-height: 10em;
  width: auto;
  max-width: 100%;
  display: block;
  margin: 0 auto;
}
```
IV sizes its dialog in em, so the cap is in em and scales with the dialog at
any player size. 11em is about the ceiling before Check falls below the fold
again; 10em leaves headroom. `width: auto` keeps the aspect ratio when the
height is capped, and `margin: 0 auto` centres the narrower video.

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
6. Network tab shows a POST to `/wp-admin/admin-ajax.php?action=process-xapi-statement`
   for each `answered`/`completed` event, and TC's reporting shows a Target
   value for each question (pending Uncanny Owl confirmation of field mapping)

---

## Operational Notes: Updating SCORM Content in Tin Canny

### TC does not re-extract zip files on replacement

When you upload a new zip to an existing TC content entry, TC saves the new zip
in its database but does **not** automatically re-extract and overwrite the files
it previously extracted to disk. Learners continue to see the old extracted files
regardless of browser cache clearing or server object/static cache purges.

**Symptom:** Uploading a new zip to an existing TC entry, logging out and back in,
and clearing all caches — the old content is still served.

### Safe update procedure when students have existing completion records

Learner completion data (lesson_status, score, attempt history) is stored in TC's
MySQL tables, keyed to the TC content entry ID and the learner's user ID. It is
completely separate from the extracted files on disk. You can delete the disk files
without touching the DB records.

To push a SCORM code update without losing existing completions:

1. **Upload the new zip** to the existing TC content entry via WP admin first
2. **Via FTP/SSH**, navigate to `wp-content/uploads/uncanny-snc/<entry-id>/`
   (e.g. `uncanny-snc/46/` for entry ID 46 — confirmed path on cedarhq.ca)
3. **Delete everything inside that folder** — all files and subfolders (`assets/`,
   `fonts/`, `index.html`, `h5p-adaptor.js`, etc.) — the folder itself can stay
4. TC re-extracts the newly uploaded zip on the next page load
5. Learner completion records in MySQL are untouched — completed lessons stay green

### Required: set Completion Condition on each lesson's Tin Canny tab

Every LearnDash Section (Topic) that uses a TC SCORM entry must have its
Completion Condition configured. Without it, TC receives the SCORM data
correctly but never calls `markComplete` — the button stays grey permanently
regardless of how the learner performs.

In the LearnDash lesson editor → **Tin Canny tab** → **Completion Condition**:
set to **"Scored, result > 50"** (or your preferred threshold). This is a
per-lesson setting and must be done each time a new lesson is created, even
if the TC content entry itself is correctly configured.

Symptom when missing: console shows `cmi.core.lesson_status = passed` and
`cmi.core.score.raw = 100` set correctly, but no TC AJAX fires and Mark
Complete stays inactive.

---

### NEVER create a new TC content entry to replace an existing one

If you create a new TC content entry and point the lesson at the new entry,
all existing completion records (linked to the old entry ID) become orphaned.
Learners who already completed the lesson will appear incomplete. Always update
the zip on the existing entry and clear the disk files via SSH if needed.
