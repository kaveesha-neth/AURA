const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('floatingLyricsAPI', {
  onState: (callback) => {
    if (typeof callback !== 'function') return;
    ipcRenderer.on('floating-lyrics-state', (_event, state) => callback(state));
  },
  onScale: (callback) => {
    if (typeof callback !== 'function') return;
    ipcRenderer.on('floating-lyrics-scale', (_event, scale) => callback(scale));
  },
  onVisibleLineCount: (callback) => {
    if (typeof callback !== 'function') return;
    ipcRenderer.on('floating-lyrics-visible-line-count', (_event, lineCount) => callback(lineCount));
  },
  onPlaybackState: (callback) => {
    if (typeof callback !== 'function') return;
    ipcRenderer.on('floating-lyrics-playback-state', (_event, state) => callback(state));
  },
  setControlsHover: (hovered) => ipcRenderer.send('floating-lyrics-controls-hover', hovered),
  controlPlayback: (action) => ipcRenderer.send('floating-lyrics-control', action),
});
