const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  scanLibrary:   ()      => ipcRenderer.invoke('scan-library'),
  rescanLibrary: ()      => ipcRenderer.invoke('rescan-library'),
  openAndScan:   ()      => ipcRenderer.invoke('open-and-scan'),
  openFolder:    ()      => ipcRenderer.invoke('open-folder'),
  addPaths:      (paths) => ipcRenderer.invoke('add-paths', paths),
  getLibrary:    ()      => ipcRenderer.invoke('get-library'),
  removeLibraryFolder: (folderPath) => ipcRenderer.invoke('remove-library-folder', folderPath),
  removeLibraryFile:   (filePath)   => ipcRenderer.invoke('remove-library-file', filePath),
  clearLibrary:  ()      => ipcRenderer.invoke('clear-library'),
  pathToUrl:     (fp)    => ipcRenderer.invoke('path-to-url', fp),
  getCoverBase64: (p) => ipcRenderer.invoke('get-cover-base64', p),
  getLyrics:     (song) => ipcRenderer.invoke('get-lyrics', song),
  refreshLyrics: (song) => ipcRenderer.invoke('refresh-lyrics', song),
  minimize: () => ipcRenderer.send('win-minimize'),
  close:    () => ipcRenderer.send('win-close'),
  toggleMaximize: () => ipcRenderer.send('win-toggle-maximize'),
  setFullscreen: (enabled) => ipcRenderer.send('win-set-fullscreen', enabled),
  setWidth: (w) => ipcRenderer.send('win-set-width', w),
});

// Media key forwarding
ipcRenderer.on('media-play-pause', () => window.dispatchEvent(new Event('media-play-pause')));
ipcRenderer.on('media-next',       () => window.dispatchEvent(new Event('media-next')));
ipcRenderer.on('media-prev',       () => window.dispatchEvent(new Event('media-prev')));
ipcRenderer.on('window-focus-changed', (event, isFocused) => {
  window.dispatchEvent(new CustomEvent('window-focus-changed', { detail: isFocused }));
});
ipcRenderer.on('fullscreen-changed', (event, isFullscreen) => {
  window.dispatchEvent(new CustomEvent('fullscreen-changed', { detail: isFullscreen }));
});
ipcRenderer.on('window-maximized-changed', (event, isMaximized) => {
  window.dispatchEvent(new CustomEvent('window-maximized-changed', { detail: isMaximized }));
});
