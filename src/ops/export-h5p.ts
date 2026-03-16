import _path from 'path';
import fsExtra from 'fs-extra';
import promisePipe from 'promisepipe';
import { withDir } from 'tmp-promise';
import scopackager from 'simple-scorm-packager';
import HtmlExporter from '@lumieducation/h5p-html-exporter';
import {
  IUser,
  H5PEditor,
  ITranslationFunction
} from '@lumieducation/h5p-server';

import { Context } from '../boot';
import scormTemplate, { createCedarScormTemplate, BundleCapture } from './templates/scorm';
import simpleTemplate from './templates/simple';
import reporterTemplate from './templates/reporter';

// const t = i18next.getFixedT(null, 'lumi');

const cleanAndTrim = (text: string): string => {
  const textClean = text.replace(/[^a-zA-Z\d\s]/g, '');
  return textClean.replace(/\s/g, '');
};

/**
 * Creates a Cedar SCORM package with external JS/CSS asset files.
 *
 * SCORM zip structure:
 *   index.html            — lean HTML shell, references external files
 *   SCORM_API_wrapper.js  — SCORM 1.2 API wrapper
 *   h5p-adaptor.js        — bridges H5P xAPI events to SCORM
 *   assets/
 *     h5p-bundle.js       — all H5P library JavaScript
 *     h5p-bundle.css      — all H5P library CSS
 *     cedar-custom.js     — Cedar icon-only fix + H5P hooks
 *     cedar-custom.css    — Cedar fonts + button overrides
 *   fonts/
 *     libre-franklin-400.woff2
 *     libre-franklin-400.woff
 *     libre-franklin-700.woff2
 *     libre-franklin-700.woff
 *     h5p-font-icons.woff
 *     h5p-font-icons.ttf
 *   content/              — H5P content resources (images, video, etc.)
 *
 * Why external files:
 *   H5P library JS contains raw `</script>` strings. Embedding the bundle
 *   inline in an HTML <script> block causes the HTML parser to close the
 *   block early, preventing injected fix scripts from running. Writing JS as
 *   separate .js files bypasses the HTML parser entirely.
 */
export async function exportScorm(
  context: Context,
  htmlExporter: HtmlExporter,
  h5pEditor: H5PEditor,
  path: string,
  contentId: string,
  user: IUser,
  options: { language: string; masteryScore: number; showRights: boolean },
  bundleCapture: BundleCapture
): Promise<void> {
  await withDir(
    async ({ path: tmpDir }) => {
      // Create subdirectories for external assets and fonts
      await fsExtra.mkdirp(_path.join(tmpDir, 'assets'));
      await fsExtra.mkdirp(_path.join(tmpDir, 'fonts'));

      // Copy SCORM API files to zip root
      await fsExtra.copyFile(
        `${_path.join(context.paths.app, 'assets/scorm-client/h5p-adaptor.js')}`,
        _path.join(tmpDir, 'h5p-adaptor.js')
      );
      await fsExtra.copyFile(
        `${_path.join(context.paths.app, 'assets/scorm-client/SCORM_API_wrapper.js')}`,
        _path.join(tmpDir, 'SCORM_API_wrapper.js')
      );

      // Run the exporter — this calls our cedar template, which populates bundleCapture
      const { html, contentFiles } =
        await htmlExporter.createBundleWithExternalContentResources(
          contentId,
          user,
          undefined,
          {
            language: options.language,
            showFrame: options.showRights,
            showLicenseButton: options.showRights
          }
        );

      // Write the lean HTML shell
      await fsExtra.writeFile(_path.join(tmpDir, 'index.html'), html);

      // Write the JS and CSS bundles as separate external files
      await fsExtra.writeFile(
        _path.join(tmpDir, 'assets', 'h5p-bundle.js'),
        bundleCapture.scripts
      );
      await fsExtra.writeFile(
        _path.join(tmpDir, 'assets', 'h5p-bundle.css'),
        bundleCapture.styles
      );

      // Copy Cedar custom JS and CSS from the cedar/ directory
      const cedarDir = _path.join(context.paths.app, 'cedar');
      await fsExtra.copyFile(
        _path.join(cedarDir, 'cedar.js'),
        _path.join(tmpDir, 'assets', 'cedar-custom.js')
      );
      await fsExtra.copyFile(
        _path.join(cedarDir, 'cedar.css'),
        _path.join(tmpDir, 'assets', 'cedar-custom.css')
      );

      // Copy Cedar font files (referenced by cedar-custom.css as ../fonts/)
      const cedarFonts = _path.join(cedarDir, 'fonts');
      const targetFonts = _path.join(tmpDir, 'fonts');
      const fontFiles = await fsExtra.readdir(cedarFonts);
      for (const fontFile of fontFiles) {
        // eslint-disable-next-line no-await-in-loop
        await fsExtra.copyFile(
          _path.join(cedarFonts, fontFile),
          _path.join(targetFonts, fontFile)
        );
      }

      // Write H5P content resource files (images, video, etc.)
      // eslint-disable-next-line no-restricted-syntax
      for (const filename of contentFiles) {
        const fn = _path.join(tmpDir, filename);
        // eslint-disable-next-line no-await-in-loop
        await fsExtra.mkdirp(_path.dirname(fn));
        const outputStream = fsExtra.createWriteStream(fn, {
          autoClose: true
        });
        // eslint-disable-next-line no-await-in-loop
        await promisePipe(
          // eslint-disable-next-line no-await-in-loop
          await h5pEditor.contentStorage.getFileStream(
            contentId,
            filename,
            user
          ),
          outputStream
        );
        outputStream.close();
      }

      const contentMetadata = await h5pEditor.contentManager.getContentMetadata(
        contentId,
        user
      );

      const temporaryFilename = await new Promise<string>((resolve, reject) => {
        const opt = {
          version: '1.2',
          organization:
            contentMetadata.authors && contentMetadata.authors[0]
              ? contentMetadata.authors[0].name
              : 'editor.exportDialog.defaults.authorName',
          title: contentMetadata.title || 'editor.exportDialog.defaults.title',
          language: contentMetadata.defaultLanguage || 'en',
          identifier: '00',
          masteryScore: options.masteryScore,
          startingPage: 'index.html',
          source: tmpDir,
          package: {
            version: '1.0.0',
            zip: true,
            outputFolder: _path.dirname(path),
            date: new Date().toISOString().slice(0, 10)
          }
        };
        scopackager(opt, () => {
          resolve(
            `${cleanAndTrim(opt.title)}_v${opt.package.version}_${
              opt.package.date
            }.zip`
          );
        });
      });
      try {
        await fsExtra.rename(
          _path.join(_path.dirname(path), temporaryFilename),
          path
        );
      } catch (error: any) {
        await fsExtra.remove(temporaryFilename);
      }
    },
    {
      keep: false,
      unsafeCleanup: true
    }
  );
}

/**
 * Exports the content to a HTML file and stores media resources in extra files.
 */
async function exportHtmlExternal(
  htmlExporter: HtmlExporter,
  h5pEditor: H5PEditor,
  path: string,
  contentId: string,
  user: IUser,
  options: { language: string; showEmbed: boolean; showRights: boolean }
): Promise<void> {
  const dir = _path.dirname(path);
  const basename = _path.basename(path, '.html');

  const { html, contentFiles } =
    await htmlExporter.createBundleWithExternalContentResources(
      contentId,
      user,
      basename,
      {
        language: options.language,
        showEmbedButton: options.showEmbed,
        showLicenseButton: options.showRights,
        showFrame: options.showEmbed || options.showRights
      }
    );
  await fsExtra.writeFile(path, html);
  // eslint-disable-next-line no-restricted-syntax
  for (const filename of contentFiles) {
    const fn = _path.join(dir, basename, filename);
    // eslint-disable-next-line no-await-in-loop
    await fsExtra.mkdirp(_path.dirname(fn));
    const outputStream = fsExtra.createWriteStream(fn, {
      autoClose: true
    });
    // eslint-disable-next-line no-await-in-loop
    await promisePipe(
      // eslint-disable-next-line no-await-in-loop
      await h5pEditor.contentStorage.getFileStream(contentId, filename, user),
      outputStream
    );
    outputStream.close();
  }
}

/**
 * Exports the content with the contentId to the requested export format.
 * @param filePath
 * @param h5pEditor
 * @param translationFunction
 * @param contentId
 * @param user
 * @param language
 * @param options
 */
export default async function exportH5P(
  context: Context,
  filePath: string,
  h5pEditor: H5PEditor,
  translationFunction: ITranslationFunction,
  contentId: string,
  user: IUser,
  language: string,
  options: {
    cssPath?: string;
    format: 'bundle' | 'external' | 'scorm';
    includeReporter: boolean;
    marginX: number;
    marginY: number;
    masteryScore: number;
    maxWidth: number;
    restrictWidthAndCenter: boolean;
    showEmbed: boolean;
    showRights: boolean;
  }
): Promise<void> {
  let customCss: string;
  try {
    customCss = options.cssPath
      ? await fsExtra.readFile(options.cssPath, 'utf-8')
      : undefined;
  } catch {
    // Read error from file; don't include CSS and silently ignore for the
    // moment
  }

  if (options.format === 'scorm') {
    // Cedar SCORM path: use external JS/CSS files to avoid the </script>
    // HTML-parser injection problem. A BundleCapture object is passed into the
    // template closure; after the template runs it contains the raw bundles
    // which exportScorm() writes as assets/h5p-bundle.js / h5p-bundle.css.
    const bundleCapture: BundleCapture = { scripts: '', styles: '' };
    const htmlExporter = new HtmlExporter(
      h5pEditor.libraryStorage,
      h5pEditor.contentStorage,
      h5pEditor.config,
      `${_path.join(context.paths.app, 'assets/h5p/core')}`,
      `${_path.join(context.paths.app, 'assets/h5p/editor')}`,
      createCedarScormTemplate(
        bundleCapture,
        options.marginX,
        options.marginY,
        options.restrictWidthAndCenter ? options.maxWidth : undefined
      ),
      translationFunction
    );
    await exportScorm(
      context,
      htmlExporter,
      h5pEditor,
      filePath,
      contentId,
      user,
      {
        language,
        showRights: options.showRights,
        masteryScore: options.masteryScore
      },
      bundleCapture
    );
    return;
  }

  // Non-SCORM paths: create HtmlExporter with format-specific template
  const htmlExporter = new HtmlExporter(
    h5pEditor.libraryStorage,
    h5pEditor.contentStorage,
    h5pEditor.config,
    `${_path.join(context.paths.app, 'assets/h5p/core')}`,
    `${_path.join(context.paths.app, 'assets/h5p/editor')}`,
    // eslint-disable-next-line no-nested-ternary
    options.includeReporter
      ? reporterTemplate
      : options.format === 'external'
        ? simpleTemplate(
            options.marginX,
            options.marginY,
            options.restrictWidthAndCenter ? options.maxWidth : undefined,
            customCss
          )
        : simpleTemplate(
            options.marginX,
            options.marginY,
            options.restrictWidthAndCenter ? options.maxWidth : undefined,
            customCss
          ),
    translationFunction
  );

  if (options.format === 'bundle') {
    const html = await htmlExporter.createSingleBundle(contentId, user, {
      language,
      showEmbedButton: options.showEmbed,
      showFrame: options.showEmbed || options.showRights,
      showLicenseButton: options.showRights
    });
    await fsExtra.writeFile(filePath, html);
  } else if (options.format === 'external') {
    await exportHtmlExternal(
      htmlExporter,
      h5pEditor,
      filePath,
      contentId,
      user,
      {
        language,
        showRights: options.showRights,
        showEmbed: options.showEmbed
      }
    );
  }
}
