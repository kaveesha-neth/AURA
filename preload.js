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
  setWidth: (w) => ipcRenderer.send('win-set-width', w),
});

// Media key forwarding
ipcRenderer.on('media-play-pause', () => window.dispatchEvent(new Event('media-play-pause')));
ipcRenderer.on('media-next',       () => window.dispatchEvent(new Event('media-next')));
ipcRenderer.on('media-prev',       () => window.dispatchEvent(new Event('media-prev')));
