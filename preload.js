const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  systemVolumeSupported: process.platform === 'win32',
  getWindowsMedia: () => ipcRenderer.invoke('get-windows-media'),
  openWindowsMediaLog: () => ipcRenderer.invoke('open-windows-media-log'),
  windowsMediaCommand: command => ipcRenderer.invoke('windows-media-command', command),
  selectAudioOutput: id => ipcRenderer.invoke('select-audio-output', id),
  openSoundSettings: () => ipcRenderer.invoke('open-sound-settings'),
  getMasterVolume: () => ipcRenderer.invoke('get-master-volume'),
  setMasterVolume: value => ipcRenderer.send('set-master-volume', value),
  toggleMasterMute: () => ipcRenderer.send('toggle-master-mute'),
  searchYouTube: (query, source) => ipcRenderer.invoke('youtube-search', query, source),
  downloadYouTube: (id) => ipcRenderer.invoke('youtube-download', id),
  cancelYouTube: () => ipcRenderer.invoke('youtube-cancel'),
  checkYouTubeTools: () => ipcRenderer.invoke('youtube-check-tools'),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  getPlayerState: () => ipcRenderer.invoke('get-player-state'),
  savePlayerState: (state) => ipcRenderer.invoke('save-player-state', state),
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
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getUpdateState: () => ipcRenderer.invoke('get-update-state'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  updateFloatingLyrics: (state) => ipcRenderer.send('floating-lyrics-update', state),
  updateFloatingLyricsPlayback: (isPlaying) => ipcRenderer.send('floating-lyrics-playback-update', isPlaying),
  setFloatingLyricsScale: (scale) => ipcRenderer.send('floating-lyrics-set-scale', scale),
  setFloatingLyricsVisibleLineCount: (count) => ipcRenderer.send('floating-lyrics-set-visible-line-count', count),
  minimize: () => ipcRenderer.send('win-minimize'),
  close:    () => ipcRenderer.send('win-close'),
  toggleMaximize: () => ipcRenderer.send('win-toggle-maximize'),
  setFullscreen: (enabled) => ipcRenderer.send('win-set-fullscreen', enabled),
  setWidth: (w) => ipcRenderer.send('win-set-width', w),
});

ipcRenderer.on('master-volume-changed', (event, state) => {
  window.dispatchEvent(new CustomEvent('master-volume-changed', { detail: state }));
});
ipcRenderer.on('windows-media-changed', (event, state) => {
  window.dispatchEvent(new CustomEvent('windows-media-changed', { detail: state }));
});

ipcRenderer.on('youtube-progress', (event, message) => {
  window.dispatchEvent(new CustomEvent('youtube-progress', { detail: message }));
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
ipcRenderer.on('update-state', (event, state) => {
  window.dispatchEvent(new CustomEvent('update-state', { detail: state }));
});
ipcRenderer.on('floating-lyrics-control', (event, action) => {
  window.dispatchEvent(new CustomEvent('floating-lyrics-control', { detail: action }));
});
