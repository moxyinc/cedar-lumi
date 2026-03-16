import { IIntegration } from '@lumieducation/h5p-server';

/**
 * Capture object used by createCedarScormTemplate.
 * exportScorm() reads scripts/styles from here after the template runs,
 * then writes them as external asset files in the SCORM zip.
 */
export interface BundleCapture {
  scripts: string;
  styles: string;
}

/**
 * Cedar SCORM template factory.
 *
 * Returns an IExporterTemplate that:
 *  - Stores scriptsBundle/stylesBundle into `capture` (so the caller can
 *    write them as external files in the SCORM zip).
 *  - Generates lean HTML that references the external files via <link> and
 *    <script src=""> rather than embedding bundles inline.
 *
 * Why external files matter:
 *  H5P library JS contains raw `</script>` strings. When the bundle is
 *  embedded inline in an HTML <script> block the browser's HTML parser sees
 *  those strings and closes the block early, preventing any injected fix
 *  script from running. Writing the JS as a separate .js file avoids the
 *  HTML parser entirely.
 */
export function createCedarScormTemplate(
  capture: BundleCapture,
  marginX?: number,
  marginY?: number,
  maxWidth?: number
) {
  return (
    integration: IIntegration,
    scriptsBundle: string,
    stylesBundle: string,
    contentId: string
  ): string => {
    // Store bundles so the caller can write them as separate files
    capture.scripts = scriptsBundle;
    capture.styles = stylesBundle;

    let marginStyle = '';
    if (marginX !== undefined && marginY !== undefined) {
      marginStyle = `margin: ${marginY}px ${marginX}px;`;
    }
    let flexStyle = '';
    let widthStyle = '';
    if (maxWidth !== undefined) {
      flexStyle = `display: flex; justify-content: center;`;
      widthStyle = `max-width:${maxWidth}px;`;
    }

    return `<!doctype html>
<html class="h5p-iframe">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <script>H5PIntegration = ${JSON.stringify(integration)};</script>
  <script type="text/javascript" src="SCORM_API_wrapper.js"></script>
  <script type="text/javascript" src="h5p-adaptor.js"></script>
  <link rel="stylesheet" href="assets/h5p-bundle.css">
  <link rel="stylesheet" href="assets/cedar-custom.css">
</head>
<body>
  <div style="${marginStyle}${flexStyle}">
    <div style="${widthStyle}" class="h5p-content h5p-theme h5p-large lag" data-content-id="${contentId}"></div>
  </div>
  <script type="text/javascript" src="assets/h5p-bundle.js"></script>
  <script type="text/javascript" src="assets/cedar-custom.js"></script>
</body>
</html>`;
  };
}

/**
 * Legacy scorm template (inline bundles).
 * Kept for reference; no longer used for SCORM exports in cedar-lumi.
 * Note: scriptsBundle often contains raw `</script>` strings from H5P libs,
 * so the HTML parser closes this block early — any script injected after the
 * inline block may not execute reliably.
 */
export default (
    marginX?: number,
    marginY?: number,
    maxWidth?: number,
    customCss?: string
  ) =>
  (
    integration: IIntegration,
    scriptsBundle: string,
    stylesBundle: string,
    contentId: string
  ): string => {
    let marginStyle = '';
    if (marginX !== undefined && marginY !== undefined) {
      marginStyle = `margin: ${marginY}px ${marginX}px;`;
    }
    let flexStyle = '';
    let widthStyle = '';
    if (maxWidth !== undefined) {
      flexStyle = `display: flex; justify-content: center;`;
      widthStyle = `max-width:${maxWidth}px;`;
    }
    return `<!doctype html>
<html class="h5p-iframe">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <script>H5PIntegration = ${JSON.stringify(integration)};
  ${scriptsBundle}</script>
  <script type="text/javascript" src="SCORM_API_wrapper.js"></script>
  <script type="text/javascript" src="h5p-adaptor.js"></script>
  <style>${stylesBundle}</style>
  ${customCss ? `<style>${customCss}</style>` : ''}
</head>
<body>
    <div style="${marginStyle}${flexStyle}">
        <div style="${widthStyle}" class="h5p-content lag" data-content-id="${contentId}"></div>
    </div>
</body>
</html>`;
  };
