const { app, BrowserWindow, ipcMain, dialog, protocol } = require('electron');
const path   = require('path');
const fs     = require('fs');
const crypto = require('crypto');
let mm; // music-metadata loaded lazily after app ready

let mainWindow;

const PANEL_W = 450;
const WIN_H   = 800;

// ─── Paths ────────────────────────────────────────────────────────────────────
const APP_ROOT   = path.join(__dirname);
const SONGS_DIR  = path.join(APP_ROOT, 'songs');
const DATA_DIR   = path.join(app.getPath('userData'), 'data');
const COVERS_DIR = path.join(app.getPath('userData'), 'data', 'covers');
const DB_FILE    = path.join(app.getPath('userData'), 'data', 'library.json');

const AUDIO_EXTS = ['.mp3','.flac','.wav','.ogg','.m4a','.aac','.opus','.wma','.aiff','.mp4'];

// Ensure dirs exist
[DATA_DIR, COVERS_DIR, SONGS_DIR].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

// ─── ID3 Parsing ──────────────────────────────────────────────────────────────

function readSynchsafe(buf, offset) {
  return ((buf[offset] & 0x7f) << 21) | ((buf[offset+1] & 0x7f) << 14) |
         ((buf[offset+2] & 0x7f) << 7)  |  (buf[offset+3] & 0x7f);
}

function readUint32BE(buf, offset) {
  return ((buf[offset] >>> 0) << 24) | (buf[offset+1] << 16) | (buf[offset+2] << 8) | buf[offset+3];
}

function decodeText(slice, enc) {
  try {
    const s = (str) => str.replace(/\0+$/, '').trim();
    if (enc === 0) return s(slice.toString('latin1'));
    if (enc === 3) return s(slice.toString('utf8'));
    if (enc === 1) {
      // UTF-16 with BOM
      if (slice.length >= 2) {
        const bom = (slice[0] << 8) | slice[1];
        if (bom === 0xFEFF) return s(slice.slice(2).toString('utf16le'));
        if (bom === 0xFFFE) return s(slice.slice(2).swap16().toString('utf16le'));
      }
      return s(slice.toString('utf16le'));
    }
    if (enc === 2) return s(Buffer.from(slice).swap16().toString('utf16le'));
  } catch {}
  return slice.toString('utf8').replace(/\0+$/, '').trim();
}

function skipNullTerm(buf, pos, enc, limit) {
  if (enc === 1 || enc === 2) {
    while (pos + 1 < limit) {
      if (buf[pos] === 0 && buf[pos+1] === 0) return pos + 2;
      pos += 2;
    }
    return limit;
  }
  while (pos < limit && buf[pos] !== 0) pos++;
  return pos + 1;
}

function parseID3v2(buf) {
  const result = { title: null, artist: null, album: null, coverBuffer: null, coverMime: null };
  if (!buf || buf.length < 10) return result;
  if (buf[0] !== 0x49 || buf[1] !== 0x44 || buf[2] !== 0x33) return result;

  const version = buf[3];
  const flags   = buf[5];
  const tagSize = readSynchsafe(buf, 6);
  let offset = 10;
  const end = Math.min(10 + tagSize, buf.length);

  // Skip extended header
  if (version >= 3 && (flags & 0x40)) {
    const extSize = version === 4 ? readSynchsafe(buf, offset) : readUint32BE(buf, offset);
    offset += extSize;
  }

  const isV22 = version === 2;
  const idLen  = isV22 ? 3 : 4;
  const hdrLen = isV22 ? 6 : 10;

  while (offset + hdrLen <= end) {
    if (buf[offset] === 0) break;

    const frameID = buf.slice(offset, offset + idLen).toString('ascii');

    let frameSize;
    if (isV22) {
      frameSize = (buf[offset+3] << 16) | (buf[offset+4] << 8) | buf[offset+5];
    } else if (version === 4) {
      frameSize = readSynchsafe(buf, offset + 4);
    } else {
      frameSize = readUint32BE(buf, offset + 4);
    }

    if (frameSize <= 0 || offset + hdrLen + frameSize > end) break;

    const dataStart = offset + hdrLen;
    const data = buf.slice(dataStart, dataStart + frameSize);

    // Text frames
    const textMap = isV22
      ? { TT2: 'title', TP1: 'artist', TAL: 'album' }
      : { TIT2: 'title', TPE1: 'artist', TALB: 'album' };

    if (textMap[frameID] && data.length > 1) {
      const enc = data[0];
      const val = decodeText(data.slice(1), enc);
      if (val) result[textMap[frameID]] = val;
    }

    // Picture frame
    const picFrame = isV22 ? 'PIC' : 'APIC';
    if (frameID === picFrame && !result.coverBuffer && data.length > 4) {
      try {
        let pos = 0;
        const enc = data[pos++];
        let mime = 'image/jpeg';

        if (isV22) {
          const fmt = data.slice(pos, pos + 3).toString('ascii').toUpperCase();
          pos += 3;
          if (fmt === 'PNG') mime = 'image/png';
        } else {
          const mimeEnd = data.indexOf(0, pos);
          if (mimeEnd >= pos) {
            const mimeStr = data.slice(pos, mimeEnd).toString('ascii').toLowerCase();
            if (mimeStr.includes('png')) mime = 'image/png';
            else if (mimeStr.includes('gif')) mime = 'image/gif';
            pos = mimeEnd + 1;
          } else {
            pos++;
          }
        }

        pos++; // picture type
        pos = skipNullTerm(data, pos, enc, data.length); // skip description

        const imgBuf = data.slice(pos);
        if (imgBuf.length > 16) {
          // Detect by magic bytes (more reliable)
          if (imgBuf[0] === 0xFF && imgBuf[1] === 0xD8) mime = 'image/jpeg';
          else if (imgBuf[0] === 0x89 && imgBuf[1] === 0x50) mime = 'image/png';
          else if (imgBuf[0] === 0x47 && imgBuf[1] === 0x49) mime = 'image/gif';
          result.coverBuffer = imgBuf;
          result.coverMime   = mime;
        }
      } catch (e) {
        console.warn('[APIC]', e.message);
      }
    }

    offset = dataStart + frameSize;
  }

  return result;
}

// ─── Save cover image to disk ─────────────────────────────────────────────────
function saveCover(coverBuffer, coverMime) {
  try {
    const ext  = coverMime === 'image/png' ? '.png' : coverMime === 'image/gif' ? '.gif' : '.jpg';
    const hash = crypto.createHash('md5').update(coverBuffer.slice(0, 512)).digest('hex').slice(0, 16);
    const coverPath = path.join(COVERS_DIR, `${hash}${ext}`);
    if (!fs.existsSync(coverPath)) {
      fs.writeFileSync(coverPath, coverBuffer);
    }
    return coverPath;
  } catch (e) {
    console.warn('[saveCover]', e.message);
    return null;
  }
}

// ─── Find sidecar cover from songs/covers folder ─────────────────────────────
const SONGS_COVERS_DIR = path.join(APP_ROOT, 'songs', 'covers');

function findSidecarCover(basename) {
  const exts = ['.jpg', '.jpeg', '.png', '.webp'];
  for (const ext of exts) {
    const p = path.join(SONGS_COVERS_DIR, basename + ext);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

// ─── Scan a single audio file (async, uses music-metadata) ──────────────────
async function scanFile(filePath) {
  const basename = path.basename(filePath, path.extname(filePath));
  let title  = basename;
  let artist = 'Unknown Artist';
  let album  = 'Unknown Album';
  let coverPath = null;

  // Filename heuristic "Artist - Title"
  const dash = basename.indexOf(' - ');
  if (dash > 0) {
    artist = basename.slice(0, dash).trim();
    title  = basename.slice(dash + 3).trim();
  }

  try {
    if (!mm) mm = await import('music-metadata');
    const meta = await mm.parseFile(filePath, { duration: false, skipCovers: false });
    const tags = meta.common;

    if (tags.title)   title  = tags.title;
    if (tags.artist)  artist = tags.artist;
    if (tags.album)   album  = tags.album;

    // Embedded cover art
    const pic = tags.picture && tags.picture[0];
    if (pic && pic.data && pic.data.length > 16) {
      coverPath = saveCover(pic.data, pic.format.includes('png') ? 'image/png' : 'image/jpeg');
    }
  } catch (e) {
    console.warn('[scanFile]', path.basename(filePath), e.message);
  }

  // Sidecar cover takes priority over embedded art (user's covers are correct)
  const sidecar = findSidecarCover(basename);
  if (sidecar) coverPath = sidecar;

  return {
    filePath,
    title,
    artist,
    album,
    coverPath,
    ext: path.extname(filePath).slice(1).toLowerCase(),
    scannedAt: Date.now(),
  };
}

// ─── Scan songs directory ─────────────────────────────────────────────────────
function getAudioFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => AUDIO_EXTS.includes(path.extname(f).toLowerCase()))
    .map(f => path.join(dir, f));
}

// ─── Build / update library.json (incremental) ───────────────────────────────
async function buildLibrary(filePaths, forceRescan = false) {
  let existingMap = {};
  if (fs.existsSync(DB_FILE) && !forceRescan) {
    try {
      const lib = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      if (Array.isArray(lib.songs) && lib.version >= 3) {
        lib.songs.forEach(s => { existingMap[s.filePath] = s; });
      }
    } catch {}
  }

  const songs = await Promise.all(filePaths.map(async fp => {
    const cached = existingMap[fp];
    if (cached && !forceRescan) {
      try {
        const mtime = fs.statSync(fp).mtimeMs;
        if (cached.scannedAt > mtime) {
          if (!cached.coverPath) {
            const basename = path.basename(fp, path.extname(fp));
            const sidecar = findSidecarCover(basename);
            if (sidecar) cached.coverPath = sidecar;
          }
          return cached;
        }
      } catch {}
    }
    console.log('[scan]', path.basename(fp));
    return scanFile(fp);
  }));

  const library = {
    version: 3,
    updatedAt: Date.now(),
    songsDir: SONGS_DIR,
    songs,
  };
  fs.writeFileSync(DB_FILE, JSON.stringify(library, null, 2), 'utf8');
  return songs;
}

// ─── Electron window ──────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: PANEL_W * 2,
    height: WIN_H,
    minWidth: PANEL_W * 2,
    minHeight: WIN_H,
    maxWidth: PANEL_W * 2,
    maxHeight: WIN_H,
    resizable: false,
    frame: false,
    transparent: true,
    titleBarStyle: 'hidden',
    backgroundColor: '#00000000',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: false,
    },
    // icon: path.join(__dirname, 'assets', 'icon.ico'),
    icon: path.join(__dirname, 'assets', 'AURA-logo-icon-HQ.png'),
    show: false,
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.executeJavaScript(`
      navigator.mediaSession.setActionHandler('play',          () => window.dispatchEvent(new Event('media-play-pause')));
      navigator.mediaSession.setActionHandler('pause',         () => window.dispatchEvent(new Event('media-play-pause')));
      navigator.mediaSession.setActionHandler('nexttrack',     () => window.dispatchEvent(new Event('media-next')));
      navigator.mediaSession.setActionHandler('previoustrack', () => window.dispatchEvent(new Event('media-prev')));
      navigator.mediaSession.setActionHandler('shuffle', null);
    `).catch(() => {});
  });
  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
  protocol.registerFileProtocol('localfile', (req, cb) => {
    const fp = decodeURIComponent(req.url.replace(/^localfile:\/\/\/?/, ''));
    cb({ path: fp });
  });
  createWindow();

});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (!mainWindow) createWindow(); });

// ─── IPC ──────────────────────────────────────────────────────────────────────

// Startup: scan songs/ dir
ipcMain.handle('scan-library', async () => {
  const files = getAudioFiles(SONGS_DIR);
  const songs = await buildLibrary(files);
  return { songs, songsDir: SONGS_DIR };
});

// Force full rescan
ipcMain.handle('rescan-library', async () => {
  const files = getAudioFiles(SONGS_DIR);
  const songs = await buildLibrary(files, true);
  return { songs, songsDir: SONGS_DIR };
});

// Open file dialog → scan → return songs
ipcMain.handle('open-and-scan', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Audio', extensions: AUDIO_EXTS.map(e => e.slice(1)) }],
    defaultPath: SONGS_DIR,
  });
  if (result.canceled || !result.filePaths.length) return [];
  return await buildLibrary(result.filePaths);
});

// Open folder dialog → scan all audio inside → return songs
ipcMain.handle('open-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    defaultPath: APP_ROOT,
  });
  if (result.canceled || !result.filePaths.length) return [];
  const files = getAudioFiles(result.filePaths[0]);
  return await buildLibrary(files);
});

// Drag-drop: receive paths, scan, return songs
ipcMain.handle('add-paths', async (event, filePaths) => {
  const audio = filePaths.filter(p => AUDIO_EXTS.includes(path.extname(p).toLowerCase()));
  return await buildLibrary(audio);
});

// Convert absolute path to file:// URL
ipcMain.handle('path-to-url', (event, filePath) => {
  const norm = filePath.replace(/\\/g, '/');
  return norm.startsWith('/') ? `file://${norm}` : `file:///${norm}`;
});

// Window controls
ipcMain.on('win-minimize',   () => mainWindow?.minimize());
ipcMain.on('win-close',      () => mainWindow?.close());
ipcMain.on('win-set-width',  (event, w) => {
  if (!mainWindow) return;
  const [, h] = mainWindow.getSize();
  // Animate the OS window resize in sync with the CSS transition (420ms)
  const start  = mainWindow.getSize()[0];
  const target = w;
  const dur    = 400;
  const steps  = 20;
  const interval = dur / steps;
  let step = 0;
  const timer = setInterval(() => {
    step++;
    const t   = step / steps;
    const ease = 1 - Math.pow(1 - t, 3); // ease-out-cubic
    const cur  = Math.round(start + (target - start) * ease);
    mainWindow?.setSize(cur, h, false);
    if (step >= steps) {
      clearInterval(timer);
      mainWindow?.setSize(target, h, false);
      // Update resizability based on new state
      mainWindow?.setMinimumSize(target, h);
      mainWindow?.setMaximumSize(target, h);
    }
  }, interval);
});

// Cover art as base64 for Windows media overlay
ipcMain.handle('get-cover-base64', async (event, coverPath) => {
  try {
    if (!coverPath || !fs.existsSync(coverPath)) return null;
    const data = fs.readFileSync(coverPath);
    const ext  = path.extname(coverPath).toLowerCase();
    const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
    return `data:${mime};base64,${data.toString('base64')}`;
  } catch { return null; }
});