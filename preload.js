const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  scanLibrary:   ()      => ipcRenderer.invoke('scan-library'),
  rescanLibrary: ()      => ipcRenderer.invoke('rescan-library'),
  openAndScan:   ()      => ipcRenderer.invoke('open-and-scan'),
  openFolder:    ()      => ipcRenderer.invoke('open-folder'),
  addPaths:      (paths) => ipcRenderer.invoke('add-paths', paths),
  pathToUrl:     (fp)    => ipcRenderer.invoke('path-to-url', fp),
  getCoverBase64: (p) => ipcRenderer.invoke('get-cover-base64', p),
  minimize: () => ipcRenderer.send('win-minimize'),
  close:    () => ipcRenderer.send('win-close'),
  setWidth: (w) => ipcRenderer.send('win-set-width', w),
});

// Media key forwarding
ipcRenderer.on('media-play-pause', () => window.dispatchEvent(new Event('media-play-pause')));
ipcRenderer.on('media-next',       () => window.dispatchEvent(new Event('media-next')));
ipcRenderer.on('media-prev',       () => window.dispatchEvent(new Event('media-prev')));
