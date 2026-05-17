const { app, BrowserWindow, ipcMain, dialog, protocol, nativeImage } = require('electron');
const path   = require('path');
const fs     = require('fs');
const crypto = require('crypto');

let mm; // music-metadata loaded lazily after app ready
let mainWindow;

const PANEL_W = 450;
const WIN_H   = 800;

// ─── Paths ────────────────────────────────────────────────────────────────────
const APP_ROOT   = path.join(__dirname);
const DATA_DIR   = path.join(app.getPath('userData'), 'data');
const COVERS_DIR = path.join(DATA_DIR, 'covers');
const LYRICS_DIR = path.join(DATA_DIR, 'lyrics');
const DB_FILE    = path.join(DATA_DIR, 'library.json');

const AUDIO_EXTS = ['.mp3', '.flac', '.wav', '.ogg', '.m4a', '.aac', '.opus', '.wma', '.aiff', '.aif', '.mp4', '.m4b'];
const COVER_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.bmp'];
const LIBRARY_VERSION = 6;

// Ensure app data dirs exist. Do not write into the packaged install directory.
[DATA_DIR, COVERS_DIR, LYRICS_DIR].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

// ─── Small helpers ────────────────────────────────────────────────────────────
function uniquePaths(paths) {
  const out = [];
  const seen = new Set();

  for (const p of paths || []) {
    if (!p || typeof p !== 'string') continue;
    const normalized = path.resolve(p);
    const key = process.platform === 'win32' ? normalized.toLowerCase() : normalized;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }

  return out;
}

function isAudioFile(filePath) {
  return AUDIO_EXTS.includes(path.extname(filePath).toLowerCase());
}

function safeMusicPath() {
  try { return app.getPath('music'); }
  catch { return app.getPath('home'); }
}

function statMtimeMs(filePath) {
  try { return fs.statSync(filePath).mtimeMs; }
  catch { return 0; }
}

function readLibrary() {
  if (!fs.existsSync(DB_FILE)) {
    return { version: LIBRARY_VERSION, updatedAt: Date.now(), folders: [], files: [], songs: [] };
  }

  try {
    const lib = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    return {
      version: Number(lib.version) || 0,
      updatedAt: lib.updatedAt || Date.now(),
      folders: uniquePaths(Array.isArray(lib.folders) ? lib.folders : []),
      files: uniquePaths(Array.isArray(lib.files) ? lib.files : []),
      songs: Array.isArray(lib.songs) ? lib.songs : [],
    };
  } catch (e) {
    console.warn('[readLibrary]', e.message);
    return { version: LIBRARY_VERSION, updatedAt: Date.now(), folders: [], files: [], songs: [] };
  }
}

function writeLibrary(library) {
  const clean = {
    version: LIBRARY_VERSION,
    updatedAt: Date.now(),
    folders: uniquePaths(library.folders || []),
    files: uniquePaths(library.files || []),
    songs: Array.isArray(library.songs) ? library.songs : [],
  };
  fs.writeFileSync(DB_FILE, JSON.stringify(clean, null, 2), 'utf8');
  return clean;
}

// ─── Cover extraction / square crop ───────────────────────────────────────────
function squareImageToCoverFile(img) {
  if (!img || img.isEmpty()) return null;

  const size = img.getSize();
  if (!size.width || !size.height) return null;

  const squareSize = Math.min(size.width, size.height);
  const cropRect = {
    x: Math.floor((size.width  - squareSize) / 2),
    y: Math.floor((size.height - squareSize) / 2),
    width: squareSize,
    height: squareSize,
  };

  const square = img.crop(cropRect).resize({ width: 512, height: 512, quality: 'best' });
  const outBuffer = square.toJPEG(90);

  const hash = crypto.createHash('md5').update(outBuffer).digest('hex').slice(0, 16);
  const coverPath = path.join(COVERS_DIR, `${hash}.jpg`);

  if (!fs.existsSync(coverPath)) {
    fs.writeFileSync(coverPath, outBuffer);
  }

  return coverPath;
}

function saveCover(coverBuffer) {
  try {
    const img = nativeImage.createFromBuffer(Buffer.from(coverBuffer));
    return squareImageToCoverFile(img);
  } catch (e) {
    console.warn('[saveCover]', e.message);
    return null;
  }
}

function saveCoverFromFile(coverFilePath) {
  try {
    if (!coverFilePath || !fs.existsSync(coverFilePath)) return null;
    const img = nativeImage.createFromPath(coverFilePath);
    return squareImageToCoverFile(img);
  } catch (e) {
    console.warn('[saveCoverFromFile]', e.message);
    return null;
  }
}

function findSidecarCover(filePath) {
  // Only use covers that clearly belong to this exact audio file.
  // Generic folder.jpg / cover.jpg caused the same thumbnail to be copied
  // to many unrelated tracks inside large nested folders.
  const dir = path.dirname(filePath);
  const basename = path.basename(filePath, path.extname(filePath));
  const candidates = [];

  for (const ext of COVER_EXTS) {
    candidates.push(path.join(dir, basename + ext));
    candidates.push(path.join(dir, 'covers', basename + ext));
    candidates.push(path.join(dir, 'cover', basename + ext));
    candidates.push(path.join(dir, 'artwork', basename + ext));
  }

  return candidates.find(p => fs.existsSync(p)) || null;
}

// ─── Audio scanning ───────────────────────────────────────────────────────────
function getAudioFilesRecursive(dir) {
  const results = [];

  function walk(currentDir) {
    let entries = [];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && isAudioFile(fullPath)) {
        results.push(fullPath);
      }
    }
  }

  if (dir && fs.existsSync(dir)) walk(dir);
  return results;
}

function getAudioFilesFromSources(folders, files) {
  const fromFolders = [];
  for (const folder of folders || []) {
    if (fs.existsSync(folder)) fromFolders.push(...getAudioFilesRecursive(folder));
  }

  const looseFiles = (files || []).filter(fp => fs.existsSync(fp) && isAudioFile(fp));
  return uniquePaths([...fromFolders, ...looseFiles]);
}

function normalizeTextForDedupe(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .replace(/official|audio|video|lyrics?|mv|hd|hq|remaster(ed)?|explicit/gi, ' ')
    .replace(/[^a-z0-9가-힣ぁ-んァ-ン一-龯]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function songDedupeKey(song) {
  const title = normalizeTextForDedupe(song?.title || path.basename(song?.filePath || '', path.extname(song?.filePath || '')));
  const artist = normalizeTextForDedupe(song?.artist || '');

  // Avoid collapsing a huge number of badly-tagged "Unknown Artist" files.
  if (!title || !artist || artist === 'unknown artist') {
    return `file:${process.platform === 'win32' ? String(song?.filePath || '').toLowerCase() : String(song?.filePath || '')}`;
  }

  return `${artist}::${title}`;
}

function songQualityScore(song) {
  let score = 0;
  if (song.coverPath) score += 1000;
  if (song.title && song.title !== path.basename(song.filePath || '', path.extname(song.filePath || ''))) score += 120;
  if (song.artist && song.artist !== 'Unknown Artist') score += 120;
  if (song.album && song.album !== 'Unknown Album') score += 60;
  if (song.duration) score += Math.min(80, Math.round(song.duration));
  if (song.bitrate) score += Math.min(320, Math.round(song.bitrate / 1000));
  if (song.sampleRate) score += Math.min(80, Math.round(song.sampleRate / 1000));

  try {
    score += Math.min(150, Math.round(fs.statSync(song.filePath).size / 1024 / 1024));
  } catch {}

  return score;
}

function dedupeSongs(songs) {
  const bestByKey = new Map();

  for (const song of songs || []) {
    const key = songDedupeKey(song);
    const existing = bestByKey.get(key);

    if (!existing || songQualityScore(song) > songQualityScore(existing)) {
      bestByKey.set(key, song);
    }
  }

  return [...bestByKey.values()].sort((a, b) => {
    const aa = `${a.artist || ''} ${a.album || ''} ${String(a.track || '').padStart(3, '0')} ${a.title || ''}`.toLowerCase();
    const bb = `${b.artist || ''} ${b.album || ''} ${String(b.track || '').padStart(3, '0')} ${b.title || ''}`.toLowerCase();
    return aa.localeCompare(bb);
  });
}


// ─── Permanent lyrics cache / LRCLIB lookup ──────────────────────────────────
const lyricsDownloadsInFlight = new Set();
let backgroundLyricsRunning = false;

function lyricsKeyForSong(song) {
  const artist = normalizeTextForDedupe(song?.artist || 'unknown artist');
  const title = normalizeTextForDedupe(song?.title || path.basename(song?.filePath || '', path.extname(song?.filePath || 'unknown')));
  const raw = `${artist}::${title}`;
  const hash = crypto.createHash('sha1').update(raw).digest('hex').slice(0, 24);
  return { raw, hash, artist, title };
}

function lyricsPathForSong(song) {
  return path.join(LYRICS_DIR, `${lyricsKeyForSong(song).hash}.json`);
}

function readCachedLyrics(song) {
  try {
    const fp = lyricsPathForSong(song);
    if (!fs.existsSync(fp)) return null;
    const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
    return data && typeof data === 'object' ? data : null;
  } catch (e) {
    console.warn('[readCachedLyrics]', e.message);
    return null;
  }
}

function writeCachedLyrics(song, payload) {
  const key = lyricsKeyForSong(song);
  const fp = path.join(LYRICS_DIR, `${key.hash}.json`);
  const clean = {
    version: 1,
    key: key.raw,
    cacheId: key.hash,
    trackName: song?.title || '',
    artistName: song?.artist || '',
    albumName: song?.album || '',
    duration: song?.duration || null,
    provider: 'LRCLIB',
    fetchedAt: Date.now(),
    status: payload?.status || 'ok',
    instrumental: !!payload?.instrumental,
    syncedLyrics: payload?.syncedLyrics || '',
    plainLyrics: payload?.plainLyrics || '',
    source: payload?.source || null,
    error: payload?.error || null,
    attempts: Number(payload?.attempts || 0),
  };
  fs.writeFileSync(fp, JSON.stringify(clean, null, 2), 'utf8');
  return clean;
}

function encodeQuery(params) {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
}

function cleanSearchField(value) {
  return String(value || '')
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function lyricsMatchScore(song, record) {
  const titleA = normalizeTextForDedupe(song?.title || '');
  const artistA = normalizeTextForDedupe(song?.artist || '');
  const albumA = normalizeTextForDedupe(song?.album || '');
  const titleB = normalizeTextForDedupe(record?.trackName || record?.name || '');
  const artistB = normalizeTextForDedupe(record?.artistName || '');
  const albumB = normalizeTextForDedupe(record?.albumName || '');

  let score = 0;
  if (titleA && titleB && titleA === titleB) score += 80;
  else if (titleA && titleB && (titleA.includes(titleB) || titleB.includes(titleA))) score += 42;

  if (artistA && artistB && artistA === artistB) score += 70;
  else if (artistA && artistB && (artistA.includes(artistB) || artistB.includes(artistA))) score += 35;

  if (albumA && albumB && albumA === albumB) score += 18;
  if (record?.syncedLyrics) score += 28;
  if (record?.plainLyrics) score += 8;

  const d1 = Number(song?.duration || 0);
  const d2 = Number(record?.duration || 0);
  if (d1 && d2) {
    const diff = Math.abs(d1 - d2);
    if (diff <= 2) score += 24;
    else if (diff <= 5) score += 12;
    else if (diff > 20) score -= 30;
  }

  return score;
}

async function fetchLyricsFromLRCLIB(song) {
  const trackName = cleanSearchField(song?.title || '');
  const artistName = cleanSearchField(song?.artist || '');
  const albumName = cleanSearchField(song?.album || '');
  const duration = song?.duration ? Math.round(Number(song.duration)) : null;

  if (!trackName || !artistName || artistName === 'Unknown Artist') {
    console.log(`[lyrics] skipped: missing metadata for "${trackName || song?.fileName || 'unknown'}"`);
    return { status: 'missing', attempts: 0, error: 'Not enough metadata to search lyrics.' };
  }

  const headers = {
    'User-Agent': 'Aura Music Player (local Electron app)',
    'Accept': 'application/json',
  };

  const attemptLimit = 4;
  let attempts = 0;
  let lastError = null;

  const titleNoVersion = cleanSearchField(
    trackName.replace(/\b(official|audio|video|lyrics?|mv|hd|hq|remix|live|performance|visualizer)\b/gi, ' ')
  );
  const titleAnd = trackName.replace(/\s*&\s*/g, ' and ');
  const titleAmp = trackName.replace(/\s+and\s+/gi, ' & ');

  const exactVariants = [
    {
      track_name: trackName,
      artist_name: artistName,
      album_name: albumName && albumName !== 'Unknown Album' ? albumName : '',
      duration,
    },
    {
      track_name: trackName,
      artist_name: artistName,
    },
    titleNoVersion && titleNoVersion !== trackName ? {
      track_name: titleNoVersion,
      artist_name: artistName,
    } : null,
  ].filter(Boolean);

  for (const params of exactVariants) {
    if (attempts >= attemptLimit) break;
    attempts += 1;
    const exactUrl = `https://lrclib.net/api/get?${encodeQuery(params)}`;
    console.log(`[lyrics] attempt ${attempts}/${attemptLimit}: exact ${params.artist_name} - ${params.track_name}`);

    try {
      const exactRes = await fetch(exactUrl, { headers });
      if (exactRes.ok) {
        const record = await exactRes.json();
        if (record && (record.syncedLyrics || record.plainLyrics || record.instrumental)) {
          console.log(`[lyrics] found exact: ${artistName} - ${trackName}`);
          return {
            status: 'ok',
            attempts,
            instrumental: !!record.instrumental,
            syncedLyrics: record.syncedLyrics || '',
            plainLyrics: record.plainLyrics || '',
            source: record,
          };
        }
      } else {
        lastError = `LRCLIB exact returned ${exactRes.status}`;
      }
    } catch (e) {
      lastError = e.message;
      console.warn('[lyrics exact]', e.message);
    }
  }

  const searchQueries = [
    `${artistName} ${trackName}`,
    `${trackName} ${artistName}`,
    titleAnd !== trackName ? `${artistName} ${titleAnd}` : null,
    titleAmp !== trackName ? `${artistName} ${titleAmp}` : null,
    titleNoVersion && titleNoVersion !== trackName ? `${artistName} ${titleNoVersion}` : null,
    trackName,
  ].filter(Boolean);

  for (const q of [...new Set(searchQueries)]) {
    if (attempts >= attemptLimit) break;
    attempts += 1;
    console.log(`[lyrics] attempt ${attempts}/${attemptLimit}: search "${q}"`);

    try {
      const searchUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(q)}`;
      const res = await fetch(searchUrl, { headers });
      if (!res.ok) {
        lastError = `LRCLIB search returned ${res.status}`;
        continue;
      }

      const records = await res.json();
      if (!Array.isArray(records) || !records.length) {
        lastError = 'No search results';
        continue;
      }

      const best = records
        .map(record => ({ record, score: lyricsMatchScore(song, record) }))
        .sort((a, b) => b.score - a.score)[0];

      if (best) {
        console.log(`[lyrics] best ${best.score}: ${best.record.artistName || ''} - ${best.record.trackName || ''}`);
      }

      if (!best || best.score < 45) {
        lastError = `Best score too low: ${best?.score ?? 0}`;
        continue;
      }

      console.log(`[lyrics] found search: ${best.record.artistName || artistName} - ${best.record.trackName || trackName}`);
      return {
        status: 'ok',
        attempts,
        instrumental: !!best.record.instrumental,
        syncedLyrics: best.record.syncedLyrics || '',
        plainLyrics: best.record.plainLyrics || '',
        source: best.record,
      };
    } catch (e) {
      lastError = e.message;
      console.warn('[lyrics search]', e.message);
    }
  }

  console.log(`[lyrics] abandoned after ${attempts}/${attemptLimit}: ${artistName} - ${trackName}`);
  return {
    status: 'not_found',
    attempts,
    error: lastError || `No lyrics found after ${attempts} tries.`,
  };
}

async function getLyricsForSong(song, force = false) {
  if (!song) return { status: 'missing' };

  const key = lyricsKeyForSong(song).hash;
  const cached = !force ? readCachedLyrics(song) : null;
  if (cached) return cached;

  if (lyricsDownloadsInFlight.has(key) && !force) {
    for (let i = 0; i < 40; i++) {
      await new Promise(resolve => setTimeout(resolve, 250));
      const fresh = readCachedLyrics(song);
      if (fresh) return fresh;
      if (!lyricsDownloadsInFlight.has(key)) break;
    }
    return { status: 'loading', cacheId: key };
  }

  lyricsDownloadsInFlight.add(key);
  try {
    const result = await fetchLyricsFromLRCLIB(song);
    return writeCachedLyrics(song, result);
  } catch (e) {
    return writeCachedLyrics(song, { status: 'error', error: e.message });
  } finally {
    lyricsDownloadsInFlight.delete(key);
  }
}

async function backgroundFetchLyrics(songs) {
  if (backgroundLyricsRunning) return;
  backgroundLyricsRunning = true;

  try {
    const candidates = (songs || [])
      .filter(song => song && song.title && song.artist && song.artist !== 'Unknown Artist')
      .filter(song => !readCachedLyrics(song));

    for (const song of candidates) {
      await getLyricsForSong(song, false);
      // Be polite to the public API and keep the app responsive.
      await new Promise(resolve => setTimeout(resolve, 650));
    }
  } finally {
    backgroundLyricsRunning = false;
  }
}

async function scanFile(filePath) {
  const basename = path.basename(filePath, path.extname(filePath));

  let title  = basename;
  let artist = 'Unknown Artist';
  let album  = 'Unknown Album';
  let duration = null;
  let year = null;
  let genre = [];
  let track = null;
  let disc = null;
  let bitrate = null;
  let sampleRate = null;
  let coverPath = null;

  // Filename heuristic: "Artist - Title"
  const dash = basename.indexOf(' - ');
  if (dash > 0) {
    artist = basename.slice(0, dash).trim();
    title  = basename.slice(dash + 3).trim();
  }

  try {
    if (!mm) mm = await import('music-metadata');

    const meta = await mm.parseFile(filePath, {
      duration: true,
      skipCovers: false,
    });

    const tags = meta.common || {};
    const format = meta.format || {};

    if (tags.title)  title  = tags.title;
    if (tags.artist) artist = tags.artist;
    if (tags.album)  album  = tags.album;

    duration = Number.isFinite(format.duration) ? format.duration : null;
    bitrate = format.bitrate || null;
    sampleRate = format.sampleRate || null;
    year = tags.year || null;
    genre = Array.isArray(tags.genre) ? tags.genre : (tags.genre ? [tags.genre] : []);
    track = tags.track?.no || null;
    disc = tags.disk?.no || null;

    const pic = tags.picture && tags.picture[0];
    if (pic && pic.data && pic.data.length > 16) {
      coverPath = saveCover(pic.data);
    }
  } catch (e) {
    console.warn('[scanFile]', path.basename(filePath), e.message);
  }

  // Sidecar cover takes priority if the user placed a custom cover near the song.
  const sidecar = findSidecarCover(filePath);
  if (sidecar) {
    coverPath = saveCoverFromFile(sidecar) || coverPath;
  }

  return {
    id: crypto.createHash('md5').update(path.resolve(filePath)).digest('hex'),
    filePath,
    folderPath: path.dirname(filePath),
    fileName: path.basename(filePath),
    title,
    artist,
    album,
    duration,
    year,
    genre,
    track,
    disc,
    bitrate,
    sampleRate,
    coverPath,
    ext: path.extname(filePath).slice(1).toLowerCase(),
    fileMtimeMs: statMtimeMs(filePath),
    scannedAt: Date.now(),
  };
}

async function buildLibraryFromSources(folders, files, forceRescan = false) {
  const existing = readLibrary();
  const cleanFolders = uniquePaths(folders || []).filter(folder => fs.existsSync(folder));
  const cleanFiles = uniquePaths(files || []).filter(fp => fs.existsSync(fp) && isAudioFile(fp));
  const filePaths = getAudioFilesFromSources(cleanFolders, cleanFiles);

  const existingMap = {};
  if (!forceRescan && existing.version === LIBRARY_VERSION) {
    for (const song of existing.songs || []) {
      if (song && song.filePath) existingMap[song.filePath] = song;
    }
  }

  const songs = await Promise.all(filePaths.map(async fp => {
    const cached = existingMap[fp];
    const mtime = statMtimeMs(fp);

    if (cached && !forceRescan && cached.scannedAt && cached.scannedAt > mtime) {
      return cached;
    }

    console.log('[scan]', path.basename(fp));
    return scanFile(fp);
  }));

  const updated = writeLibrary({
    folders: cleanFolders,
    files: cleanFiles,
    songs: dedupeSongs(songs),
  });

  // Fire-and-forget: lyrics stay cached forever and are not tied to selected folders.
  backgroundFetchLyrics(updated.songs).catch(e => console.warn('[backgroundFetchLyrics]', e.message));

  return updated;
}

async function mergeAndBuildLibrary({ foldersToAdd = [], filesToAdd = [], forceRescan = false } = {}) {
  const lib = readLibrary();
  const folders = uniquePaths([...lib.folders, ...foldersToAdd]);
  const files = uniquePaths([...lib.files, ...filesToAdd]);
  return buildLibraryFromSources(folders, files, forceRescan);
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
ipcMain.handle('scan-library', async () => {
  const lib = readLibrary();

  if (!lib.folders.length && !lib.files.length) {
    return { songs: [], folders: [], files: [] };
  }

  const updated = await buildLibraryFromSources(lib.folders, lib.files, false);
  return { songs: updated.songs, folders: updated.folders, files: updated.files };
});

ipcMain.handle('rescan-library', async () => {
  const lib = readLibrary();

  if (!lib.folders.length && !lib.files.length) {
    return { songs: [], folders: [], files: [] };
  }

  const updated = await buildLibraryFromSources(lib.folders, lib.files, true);
  return { songs: updated.songs, folders: updated.folders, files: updated.files };
});

ipcMain.handle('open-and-scan', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Audio', extensions: AUDIO_EXTS.map(e => e.slice(1)) }],
    defaultPath: safeMusicPath(),
  });

  if (result.canceled || !result.filePaths.length) return readLibrary();

  const updated = await mergeAndBuildLibrary({ filesToAdd: result.filePaths });
  return { songs: updated.songs, folders: updated.folders, files: updated.files };
});

ipcMain.handle('open-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'multiSelections'],
    defaultPath: safeMusicPath(),
  });

  if (result.canceled || !result.filePaths.length) return readLibrary();

  const updated = await mergeAndBuildLibrary({ foldersToAdd: result.filePaths });
  return { songs: updated.songs, folders: updated.folders, files: updated.files };
});

ipcMain.handle('add-paths', async (event, droppedPaths) => {
  const foldersToAdd = [];
  const filesToAdd = [];

  for (const p of droppedPaths || []) {
    try {
      const stat = fs.statSync(p);
      if (stat.isDirectory()) foldersToAdd.push(p);
      else if (stat.isFile() && isAudioFile(p)) filesToAdd.push(p);
    } catch {}
  }

  const updated = await mergeAndBuildLibrary({ foldersToAdd, filesToAdd });
  return { songs: updated.songs, folders: updated.folders, files: updated.files };
});

ipcMain.handle('get-library', async () => {
  const lib = readLibrary();
  return { songs: lib.songs, folders: lib.folders, files: lib.files };
});

ipcMain.handle('remove-library-folder', async (event, folderPath) => {
  const lib = readLibrary();
  const target = path.resolve(folderPath || '');
  const targetKey = process.platform === 'win32' ? target.toLowerCase() : target;
  const folders = lib.folders.filter(folder => {
    const resolved = path.resolve(folder);
    const key = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
    return key !== targetKey;
  });

  const updated = await buildLibraryFromSources(folders, lib.files, false);
  return { songs: updated.songs, folders: updated.folders, files: updated.files };
});

ipcMain.handle('remove-library-file', async (event, filePath) => {
  const lib = readLibrary();
  const target = path.resolve(filePath || '');
  const targetKey = process.platform === 'win32' ? target.toLowerCase() : target;
  const files = lib.files.filter(file => {
    const resolved = path.resolve(file);
    const key = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
    return key !== targetKey;
  });

  const updated = await buildLibraryFromSources(lib.folders, files, false);
  return { songs: updated.songs, folders: updated.folders, files: updated.files };
});

ipcMain.handle('clear-library', async () => {
  const updated = writeLibrary({ folders: [], files: [], songs: [] });
  return { songs: updated.songs, folders: updated.folders, files: updated.files };
});


ipcMain.handle('get-lyrics', async (event, song) => {
  return getLyricsForSong(song, false);
});

ipcMain.handle('refresh-lyrics', async (event, song) => {
  return getLyricsForSong(song, true);
});

ipcMain.handle('path-to-url', (event, filePath) => {
  const norm = filePath.replace(/\\/g, '/');
  return norm.startsWith('/') ? `file://${norm}` : `file:///${norm}`;
});

// Window controls
ipcMain.on('win-minimize', () => mainWindow?.minimize());
ipcMain.on('win-close',    () => mainWindow?.close());
ipcMain.on('win-set-width', (event, w) => {
  if (!mainWindow) return;
  const [, h] = mainWindow.getSize();
  const start  = mainWindow.getSize()[0];
  const target = w;
  const dur    = 400;
  const steps  = 20;
  const interval = dur / steps;
  let step = 0;

  const timer = setInterval(() => {
    step++;
    const t = step / steps;
    const ease = 1 - Math.pow(1 - t, 3);
    const cur = Math.round(start + (target - start) * ease);
    mainWindow?.setSize(cur, h, false);

    if (step >= steps) {
      clearInterval(timer);
      mainWindow?.setSize(target, h, false);
      mainWindow?.setMinimumSize(target, h);
      mainWindow?.setMaximumSize(target, h);
    }
  }, interval);
});

ipcMain.handle('get-cover-base64', async (event, coverPath) => {
  try {
    if (!coverPath || !fs.existsSync(coverPath)) return null;
    const data = fs.readFileSync(coverPath);
    return `data:image/jpeg;base64,${data.toString('base64')}`;
  } catch {
    return null;
  }
});
