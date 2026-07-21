/**
 * Cedar SCORM — cedar-custom.js
 *
 * Loaded as the last <script> in SCORM index.html, after h5p-bundle.js.
 *
 * ROOT CAUSE OF ICON-ONLY PROBLEM:
 *   H5P.Components has a `@container (max-width: 250px)` query on `.h5p-navigation`
 *   (container-type: inline-size). When the IV popup renders in Tin Canny's nested
 *   iframe the navigation measures < 250 px → the query fires → CSS sets
 *   --is-icon-only:1 and --label-display:none → H5P JS reads --is-icon-only and
 *   adds the `icon-only` class → quiz buttons lose their text label and the hover
 *   slide-up animation.
 *
 *   In Lumi's View tab the framedTemplate.js patch already includes an identical
 *   MutationObserver that neutralises this (see patched node_modules). We replicate
 *   the same fix here for SCORM so the two contexts behave identically.
 *
 * WHAT THIS DOES:
 *   • Removes the `icon-only` class from quiz action buttons (check, continue,
 *     show-solutions, retry, show-results).
 *   • Overrides --is-icon-only → 0 and --label-display → inline-block via inline
 *     style (!important) so container-query CSS cannot re-hide them.
 *   • Runs once on DOMContentLoaded, once after 500 ms (H5P loads async), and on
 *     every DOM mutation so it catches buttons added after the initial render.
 */
(function () {
  'use strict';

  var QUIZ_BUTTONS =
    '.h5p-theme-check,' +
    '.h5p-theme-continue,' +
    '.h5p-theme-show-solutions,' +
    '.h5p-theme-retry,' +
    '.h5p-theme-show-results';

  function fixButtons() {
    document.querySelectorAll(QUIZ_BUTTONS).forEach(function (btn) {
      btn.classList.remove('icon-only');
      btn.style.setProperty('--is-icon-only', '0', 'important');
      btn.style.setProperty('--label-display', 'inline-block', 'important');
    });
  }

  var observer = new MutationObserver(fixButtons);

  document.addEventListener('DOMContentLoaded', function () {
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(fixButtons, 500);
    fixButtons();
  });

  // Guard: if DOMContentLoaded already fired (script loaded late)
  if (document.readyState === 'interactive' || document.readyState === 'complete') {
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(fixButtons, 500);
    fixButtons();
  }
})();
