/*
 * Mouseferatu — preload bridge.
 * Exposes a minimal, safe API on window.electronAPI that the React renderer
 * uses to receive native mouse/state events and request initial metadata.
 */
const { contextBridge, ipcRenderer } = require('electron');

const channels = [
  'mf:mouseMove', 'mf:mouseState', 'mf:ambientState',
  'mf:transientState', 'mouseferatu:open-app',
];

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  isOverlay: new URLSearchParams(location.search).get('overlay') === '1'
          || location.hash.includes('overlay=1'),

  getInitial: () => ipcRenderer.invoke('mf:getInitial'),
  openSettings: () => ipcRenderer.send('mf:open-settings'),

  on: (channel, cb) => {
    if (!channels.includes(channel)) return () => {};
    const listener = (_evt, data) => cb(data);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
});
