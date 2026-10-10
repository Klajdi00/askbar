// Preload: the only bridge between the sandboxed page and the main process.
// The page gets a small, explicit API; it never sees Node, Electron or API keys.

const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, callback) {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('askbar', {
  // Chat
  ask: (requestId, messages) => ipcRenderer.invoke('ai:ask', { requestId, messages }),
  cancel: (requestId) => ipcRenderer.send('ai:cancel', requestId),
  onChunk: (callback) => subscribe('ai:chunk', callback),
  onMeta: (callback) => subscribe('ai:meta', callback),

  // Screen
  captureScreen: () => ipcRenderer.invoke('screen:capture'),
  onScreenshot: (callback) => subscribe('screen:attached', callback),

  // Settings
  getState: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (patch) => ipcRenderer.invoke('settings:save', patch),

  // Window
  onShown: (callback) => subscribe('overlay:shown', callback),
  resize: (height) => ipcRenderer.send('overlay:resize', height),
  hide: () => ipcRenderer.send('overlay:hide'),

  // Misc
  copy: (text) => ipcRenderer.send('clipboard:write', text),
  openExternal: (url) => ipcRenderer.send('open-external', url),
});
