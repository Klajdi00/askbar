// Preload for the mascot window: a tiny, explicit API and nothing else.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mascot', {
  onState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('mascot:state', listener);
    return () => ipcRenderer.removeListener('mascot:state', listener);
  },
  click: () => ipcRenderer.send('mascot:click'),
  lookAtScreen: () => ipcRenderer.send('mascot:look'),
  openMenu: () => ipcRenderer.send('mascot:menu'),
  dragStart: (offsetX, offsetY) => ipcRenderer.send('mascot:drag-start', { offsetX, offsetY }),
  dragEnd: () => ipcRenderer.send('mascot:drag-end'),
});
