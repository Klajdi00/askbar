import { clipboard, ipcMain, shell } from 'electron';
import { LIMITS } from '../config/defaults.js';

/**
 * IPC handlers for the launcher page. Every handler checks that the message
 * comes from our own window and validates what it receives.
 */
export function registerIpc({ overlay, app }) {
  const fromOverlay = (event) => event.sender.id === overlay.webContents.id;
  const active = new Map(); // requestId -> AbortController

  ipcMain.handle('ai:ask', async (event, payload) => {
    if (!fromOverlay(event)) return { ok: false, error: 'Forbidden.' };
    const requestId = String(payload?.requestId || '');
    const messages = validateMessages(payload?.messages);
    if (!requestId || !messages) return { ok: false, error: 'Invalid request.' };

    const settings = app.getSettings();
    const apiKey = app.getApiKey(settings.provider);
    if (!apiKey) return { ok: false, code: 'NO_KEY', error: 'Add an API key in Settings first.' };

    // One answer at a time: a new question replaces the one still streaming.
    for (const controller of active.values()) controller.abort();
    active.clear();
    const controller = new AbortController();
    active.set(requestId, controller);
    app.onActivity('thinking');

    let endState = 'idle';
    try {
      const result = await app.runChat({
        settings,
        apiKey,
        messages,
        signal: controller.signal,
        onMeta: (meta) => event.sender.send('ai:meta', { requestId, ...meta }),
        onDelta: (text) => event.sender.send('ai:chunk', { requestId, text }),
      });
      endState = 'done';
      return { ok: true, ...result };
    } catch (err) {
      return { ok: false, code: err.code || 'ERROR', status: err.status, error: err.message };
    } finally {
      active.delete(requestId);
      // A replaced request finishing late must not override the new one's state.
      if (active.size === 0) app.onActivity(endState);
    }
  });

  ipcMain.on('ai:cancel', (event, requestId) => {
    if (fromOverlay(event)) active.get(String(requestId))?.abort();
  });

  ipcMain.handle('settings:get', (event) => (fromOverlay(event) ? app.publicState() : null));

  ipcMain.handle('settings:save', (event, patch) => {
    if (!fromOverlay(event) || typeof patch !== 'object' || !patch) return { ok: false, errors: ['Invalid settings.'] };
    return app.saveSettings(patch);
  });

  // The bar's look-at-screen button: exactly the same path as the hotkey.
  ipcMain.on('screen:look', (event) => {
    if (fromOverlay(event)) app.lookAtScreen();
  });

  ipcMain.on('overlay:resize', (event, height) => {
    if (fromOverlay(event) && Number.isFinite(height)) overlay.setContentHeight(height);
  });

  ipcMain.on('overlay:hide', (event) => {
    if (fromOverlay(event)) overlay.hide();
  });

  // Moving the bar: hold the left button on its badge/edges/footer and drag.
  ipcMain.on('overlay:drag-start', (event, p) => {
    if (!fromOverlay(event) || !Number.isFinite(p?.offsetX) || !Number.isFinite(p?.offsetY)) return;
    overlay.startDrag(Math.min(Math.max(p.offsetX, 0), 1000), Math.min(Math.max(p.offsetY, 0), 3000));
  });

  ipcMain.on('overlay:drag-end', (event) => {
    if (fromOverlay(event)) overlay.endDrag();
  });

  ipcMain.on('clipboard:write', (event, text) => {
    if (fromOverlay(event) && typeof text === 'string') clipboard.writeText(text);
  });

  ipcMain.on('open-external', (event, url) => {
    if (!fromOverlay(event) || typeof url !== 'string') return;
    try {
      const { protocol } = new URL(url);
      if (protocol === 'https:' || protocol === 'http:') shell.openExternal(url);
    } catch {
      // not a URL
    }
  });
}

function validateMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 200) return null;
  const clean = [];
  for (const m of messages) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant')) return null;
    if (typeof m.text !== 'string' || m.text.length > LIMITS.maxMessageChars) return null;
    const item = { role: m.role, text: m.text };
    if (m.image) {
      const { mime, base64 } = m.image;
      if (mime !== 'image/jpeg' || typeof base64 !== 'string' || base64.length > 15_000_000) return null;
      if (!/^[A-Za-z0-9+/]+=*$/.test(base64)) return null;
      item.image = { mime, base64 };
    }
    clean.push(item);
  }
  return clean;
}
