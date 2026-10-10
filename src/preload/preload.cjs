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

  // Screen (capture happens only when the user asks: button or hotkey)
  lookAtScreen: () => ipcRenderer.send('screen:look'),
  onScreenshot: (callback) => subscribe('screen:attached', callback),
  onScreenError: (callback) => subscribe('screen:error', callback),

  // Settings
  getState: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (patch) => ipcRenderer.invoke('settings:save', patch),
  // While a shortcut box records keys, AskBar's own global hotkeys are paused.
  suspendHotkeys: (on) => ipcRenderer.send('hotkeys:suspend', Boolean(on)),
  chooseCustomMascot: () => ipcRenderer.invoke('mascot:choose-custom'),
  getCustomMascotPreview: () => ipcRenderer.invoke('mascot:custom-preview'),

  // Window
  onShown: (callback) => subscribe('overlay:shown', callback),
  onLayout: (callback) => subscribe('overlay:layout', callback),
  resize: (height) => ipcRenderer.send('overlay:resize', height),
  hide: () => ipcRenderer.send('overlay:hide'),
  dragStart: (offsetX, offsetY) => ipcRenderer.send('overlay:drag-start', { offsetX, offsetY }),
  dragEnd: () => ipcRenderer.send('overlay:drag-end'),

  // Misc
  copy: (text) => ipcRenderer.send('clipboard:write', text),
  openExternal: (url) => ipcRenderer.send('open-external', url),
});
