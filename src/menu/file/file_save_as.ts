import { Context } from '../../boot';
import MenuItem from '../../types/MenuItem';
import show_dialog_save_as from '../../ops/dialog_save_as';
import window_get_active from '../../ops/window_get_active';
import window_backdrop_show from '../../ops/window_backdrop_show';
import window_get_content_id from '../../ops/window_get_content_id';
import User from '../../models/User';
import { cedarVersion } from '../../../package.json';

export default function file_save_as(ctx: Context): MenuItem {
  return {
    label: ctx.translate('Save As'),
    enabled: ctx.menu === 'content',
    accelerator: 'CmdOrCtrl+Shift+S',
    click: async () => {
      const active_window = await window_get_active();
      const content_id = await window_get_content_id(active_window);

      let defaultFilename = `content_cedar-v${cedarVersion}_${new Date().toISOString().slice(0, 10)}.h5p`;
      try {
        const metadata = await ctx.h5pEditor.contentManager.getContentMetadata(
          content_id,
          new User()
        );
        if (metadata.title) {
          const clean = metadata.title.replace(/[^a-zA-Z\d\s]/g, '').replace(/\s/g, '');
          defaultFilename = `${clean}_cedar-v${cedarVersion}_${new Date().toISOString().slice(0, 10)}.h5p`;
        }
      } catch {}

      const { file_path, canceled } = await show_dialog_save_as(defaultFilename);

      if (canceled) {
        return;
      }
      await window_backdrop_show(ctx, content_id);
      ctx.ws.emit(content_id, { type: 'save_as', payload: { file_path } });
    }
  };
}
