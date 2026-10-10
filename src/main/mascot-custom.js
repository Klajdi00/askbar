import { app, dialog } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { CUSTOM_MASCOT } from '../config/mascots.js';
import { assignStates, isSafeStoredName, mimeFor } from './mascot-files.js';

// Your own mascot: the chosen images are copied into %APPDATA%\AskBar\mascot
// so they keep working if the originals move. They are only read locally and
// shown in the mascot window; they are never uploaded anywhere.

const folder = () => path.join(app.getPath('userData'), 'mascot');

/**
 * Opens a file picker (one image, or up to three named idle / thinking /
 * done) and copies the choice into the mascot folder.
 * Returns { ok, record } where record = { idle: { file, original }, thinking?, done? }.
 */
export async function chooseCustomMascot(parentWindow) {
  const res = await dialog.showOpenDialog(parentWindow, {
    title: 'Choose your mascot (one image, or idle / thinking / done)',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Images', extensions: CUSTOM_MASCOT.extensions }],
  });
  if (res.canceled || res.filePaths.length === 0) return { ok: false, canceled: true };

  const files = res.filePaths.slice(0, CUSTOM_MASCOT.maxFiles);
  for (const file of files) {
    if (!mimeFor(file)) {
      return { ok: false, error: `${path.basename(file)} isn't a supported image (PNG, GIF, WebP, JPG or SVG).` };
    }
    const { size } = await fs.stat(file);
    if (size > CUSTOM_MASCOT.maxBytes) return { ok: false, error: `${path.basename(file)} is larger than 5 MB.` };
  }

  await fs.mkdir(folder(), { recursive: true });
  const stamp = Date.now();
  const record = {};
  for (const [state, source] of Object.entries(assignStates(files))) {
    if (!source) continue;
    const file = `${state}-${stamp}${path.extname(source).toLowerCase()}`;
    await fs.copyFile(source, path.join(folder(), file));
    record[state] = { file, original: path.basename(source) };
  }
  return { ok: true, record };
}

/** Reads the stored images as data: URLs for the mascot window, e.g. { idle, thinking, done }. */
export async function loadCustomImages(record) {
  const images = {};
  for (const [state, entry] of Object.entries(record || {})) {
    if (!isSafeStoredName(entry?.file)) continue;
    try {
      const data = await fs.readFile(path.join(folder(), entry.file));
      images[state] = `data:${mimeFor(entry.file)};base64,${data.toString('base64')}`;
    } catch {
      // file gone: that state falls back to the idle picture
    }
  }
  return images;
}

/** Removes the app's own copies from an older choice (only files inside the mascot folder). */
export async function removeCustomFiles(oldRecord, keepRecord = {}) {
  const keep = new Set(Object.values(keepRecord).map((e) => e?.file));
  for (const entry of Object.values(oldRecord || {})) {
    if (!isSafeStoredName(entry?.file) || keep.has(entry.file)) continue;
    await fs.rm(path.join(folder(), entry.file), { force: true }).catch(() => {});
  }
}
