import { dialog } from 'electron';

export default async function show_dialog_save_as(defaultPath?: string): Promise<{
  file_path: string | undefined;
  canceled: boolean;
}> {
  const result = await dialog.showSaveDialog({
    title: 'Save As',
    defaultPath,
    filters: [{ name: '.h5p', extensions: ['h5p'] }],
    properties: ['showOverwriteConfirmation']
  });

  return {
    file_path: result.filePath,
    canceled: result.canceled
  };
}
