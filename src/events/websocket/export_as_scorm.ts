import * as SocketIO from 'socket.io';

import { Context } from '../../boot';
import window_backdrop_hide from '../../ops/window_backdrop_hide';
import window_snackbar_show from '../../ops/window_snackbar_show';
import window_backdrop_show from '../../ops/window_backdrop_show';
import content_export_as_scorm from '../../ops/content_export_as_scorm';
import dialog_export_save_as_show from '../../ops/dialog_export_save_as_show';
import User from '../../models/User';
import { cedarVersion } from '../../../package.json';

export default function event_websocket_export_as_scorm(
  context: Context,
  socket: SocketIO.Socket
): void {
  socket.on('export_as_scorm', async (payload) => {
    context.log.info('events:websocket:export_as_scorm', payload);
    const { contentId, options } = payload;

    let defaultFilename = `scorm_cedar-v${cedarVersion}_${new Date().toISOString().slice(0, 10)}.zip`;
    try {
      const metadata = await context.h5pEditor.contentManager.getContentMetadata(
        contentId,
        new User()
      );
      if (metadata.title) {
        const clean = metadata.title.replace(/[^a-zA-Z\d\s]/g, '').replace(/\s/g, '');
        defaultFilename = `${clean}_cedar-v${cedarVersion}_${new Date().toISOString().slice(0, 10)}.zip`;
      }
    } catch {}

    const { file_path } = await dialog_export_save_as_show(
      context.translate('Export as SCORM'),
      '.zip',
      ['.zip'],
      defaultFilename
    );

    if (!file_path) {
      return;
    }

    await window_backdrop_show(context, contentId);

    await content_export_as_scorm(context, contentId, file_path, options);

    await window_backdrop_hide(context, contentId);
    await window_snackbar_show(
      context,
      contentId,
      context.translate(`Content exported to {{file_path}}`, { file_path }),
      'success'
    );
  });
}
