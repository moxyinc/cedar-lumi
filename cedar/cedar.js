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

/**
 * IV FIT-TO-FRAME:
 *   Interactive Video sizes itself from the frame WIDTH only (video height =
 *   width / aspect ratio, plus the control bar underneath). In a wide, short
 *   Tin Canny lightbox (e.g. "Use Global Settings") the player ends up taller
 *   than the frame and the control bar falls below the bottom edge.
 *
 *   This caps the width of .h5p-content so the whole player (video + controls)
 *   fits the frame height, centres it, and asks H5P to re-layout. It uses the
 *   real video aspect ratio. When the frame is tall enough, the cap is removed
 *   and IV behaves exactly as before. Skipped while in fullscreen.
 */
(function () {
  'use strict';

  var content = null;
  var originalMaxWidth = '';
  var scheduled = null;

  // H5P adds these classes to <body> in fullscreen. (Don't query
  // '.h5p-fullscreen' globally: IV's fullscreen *button* has that class too.)
  function isFullscreen() {
    var body = document.body.classList;
    return !!(
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      body.contains('h5p-fullscreen') ||
      body.contains('h5p-semi-fullscreen')
    );
  }

  function aspectRatio(wrapper) {
    var video = wrapper.querySelector('video');
    if (video && video.videoWidth && video.videoHeight) {
      return video.videoWidth / video.videoHeight;
    }
    if (wrapper.offsetWidth && wrapper.offsetHeight) {
      return wrapper.offsetWidth / wrapper.offsetHeight;
    }
    return 16 / 9;
  }

  function relayout() {
    if (window.H5P && H5P.instances) {
      H5P.instances.forEach(function (inst) {
        inst.trigger('resize');
      });
    }
  }

  function fit(pass) {
    pass = pass || 0;
    var wrapper = content && content.querySelector('.h5p-interactive-video .h5p-video-wrapper');
    if (!wrapper || !wrapper.offsetHeight) return;

    if (isFullscreen()) {
      content.style.maxWidth = originalMaxWidth;
      return;
    }

    // Everything on the page that isn't the video: space above .h5p-content,
    // the control bar (and anything else inside), and the outer bottom margin.
    var outer = content.parentElement;
    var above = content.getBoundingClientRect().top + window.pageYOffset;
    var inside = content.offsetHeight - wrapper.offsetHeight;
    var below = parseFloat(getComputedStyle(outer).marginBottom) || 0;
    var availableVideoHeight = window.innerHeight - above - inside - below;

    var fitWidth = Math.floor(availableVideoHeight * aspectRatio(wrapper));
    var natural = outer.clientWidth;
    var configured = parseFloat(originalMaxWidth) || Infinity;

    var target = fitWidth < Math.min(natural, configured) ? fitWidth + 'px' : originalMaxWidth;
    if (content.style.maxWidth === target) return;

    content.style.maxWidth = target;
    content.style.marginLeft = 'auto';
    content.style.marginRight = 'auto';
    relayout();

    // The control bar can change height with width; re-check once or twice.
    if (pass < 2) {
      requestAnimationFrame(function () {
        fit(pass + 1);
      });
    }
  }

  function scheduleFit(delay) {
    clearTimeout(scheduled);
    scheduled = setTimeout(fit, delay || 100);
  }

  function init() {
    content = document.querySelector('.h5p-content');
    if (!content) return;
    originalMaxWidth = content.style.maxWidth;

    window.addEventListener('resize', function () {
      scheduleFit(100);
    });
    document.addEventListener('fullscreenchange', function () {
      scheduleFit(300);
    });
    document.addEventListener('webkitfullscreenchange', function () {
      scheduleFit(300);
    });

    // IV builds its player asynchronously; poll briefly until it's laid out,
    // then re-fit when the video's real dimensions become known.
    var tries = 0;
    var poll = setInterval(function () {
      tries++;
      var wrapper = content.querySelector('.h5p-interactive-video .h5p-video-wrapper');
      if (wrapper && wrapper.offsetHeight) {
        clearInterval(poll);
        fit();
        var video = wrapper.querySelector('video');
        if (video) video.addEventListener('loadedmetadata', function () {
          scheduleFit(50);
        });
      } else if (tries > 80) {
        clearInterval(poll); // ~20 s: not an IV, or it never loaded
      }
    }, 250);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
