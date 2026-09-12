const { app, BrowserWindow, ipcMain, dialog, protocol, nativeImage } = require('electron');
const path   = require('path');
const fs     = require('fs');
const crypto = require('crypto');

let mm; // music-metadata loaded lazily after app ready
let mainWindow;
let floatingLyricsWindow;
let windowedBounds = null;
let wasMaximizedBeforeFullscreen = false;
let floatingLyricsBoundsTimer = null;
let isQuitting = false;
let floatingLyricsVisibleLineCount = 6;
let floatingLyricsControlsHovered = false;
let isMainWindowFullscreen = false;
let latestFloatingLyricsState = {
  lines: ['', '', 'Lyrics will appear here', '', '', ''],
  activeIndex: 2,
  transition: 'none',
};
let latestFloatingLyricsPlayback = { isPlaying: false };
let updateCheckInFlight = false;
let updaterConfigured = false;
let updateCheckTimer = null;
let autoUpdater = null;
let updateState = {
  status: 'idle',
  version: null,
  percent: 0,
};

const PANEL_W = 450;
const WIN_H   = 824;
const FLOATING_LYRICS_BASE_WIDTH = 840;
const FLOATING_LYRICS_BASE_HEIGHT = 400;

// ─── Paths ────────────────────────────────────────────────────────────────────
const APP_ROOT   = path.join(__dirname);
const DATA_DIR   = path.join(app.getPath('userData'), 'data');
const COVERS_DIR = path.join(DATA_DIR, 'covers');
const LYRICS_DIR = path.join(DATA_DIR, 'lyrics');
const DB_FILE    = path.join(DATA_DIR, 'library.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

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

function normalizeFloatingLyricsBounds(bounds) {
  if (!bounds || !Number.isFinite(Number(bounds.x)) || !Number.isFinite(Number(bounds.y))) return null;
  return { x: Math.round(Number(bounds.x)), y: Math.round(Number(bounds.y)) };
}

function normalizeFloatingLyricsScale(scale) {
  const value = Number(scale);
  if (!Number.isFinite(value)) return 100;
  return Math.max(10, Math.min(140, Math.round(value / 5) * 5));
}

function normalizeFloatingLyricsVisibleLineCount(lineCount) {
  const value = Number(lineCount);
  if (!Number.isFinite(value)) return 6;
  return Math.max(3, Math.min(6, Math.round(value)));
}

function floatingLyricsSize(scale) {
  const factor = normalizeFloatingLyricsScale(scale) / 100;
  return {
    width: Math.round(FLOATING_LYRICS_BASE_WIDTH * factor),
    height: Math.round(FLOATING_LYRICS_BASE_HEIGHT * factor),
  };
}

function getUpdateState() {
  return { ...updateState };
}

function sendUpdateState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('update-state', getUpdateState());
}

function setUpdateState(next) {
  updateState = { ...updateState, ...next };
  sendUpdateState();
}

function configureAutoUpdater() {
  if (!app.isPackaged || updaterConfigured) return;
  try {
    ({ autoUpdater } = require('electron-updater'));
  } catch (error) {
    console.warn('[autoUpdater] unavailable', error?.message || error);
    return;
  }

  updaterConfigured = true;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowPrerelease = false;

  autoUpdater.on('checking-for-update', () => {
    setUpdateState({ status: 'checking', version: null, percent: 0 });
  });
  autoUpdater.on('update-available', info => {
    setUpdateState({ status: 'available', version: info.version, percent: 0 });
  });
  autoUpdater.on('update-not-available', () => {
    setUpdateState({ status: 'idle', version: null, percent: 0 });
  });
  autoUpdater.on('download-progress', progress => {
    setUpdateState({
      status: 'downloading',
      percent: Math.max(0, Math.min(100, Math.round(Number(progress.percent) || 0))),
    });
  });
  autoUpdater.on('update-downloaded', info => {
    setUpdateState({ status: 'downloaded', version: info.version || updateState.version, percent: 100 });
  });
  autoUpdater.on('error', error => {
    console.warn('[autoUpdater]', error?.message || error);
    setUpdateState({ status: 'error', percent: 0 });
  });

  // Let Aura finish rendering before performing a silent network request.
  updateCheckTimer = setTimeout(() => {
    updateCheckTimer = null;
    void checkForUpdates();
  }, 3500);
}

async function checkForUpdates() {
  if (!app.isPackaged || !updaterConfigured || updateCheckInFlight) return getUpdateState();
  updateCheckInFlight = true;
  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    console.warn('[checkForUpdates]', error?.message || error);
    setUpdateState({ status: 'error', percent: 0 });
  } finally {
    updateCheckInFlight = false;
  }
  return getUpdateState();
}

function readSettings() {
  try {
    const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    const delay = Number(settings?.autoFullscreenDelay);
    const theme = ['midnight', 'oled'].includes(settings?.theme) ? settings.theme : 'midnight';
    return {
      autoFullscreenDelay: [0, 120000, 300000, 600000, 900000, 1800000].includes(delay) ? delay : 300000,
      theme,
      floatingLyricsEnabled: Boolean(settings?.floatingLyricsEnabled),
      floatingLyricsClickThrough: Boolean(settings?.floatingLyricsClickThrough),
      floatingLyricsScale: normalizeFloatingLyricsScale(settings?.floatingLyricsScale),
      floatingLyricsVisibleLineCount: normalizeFloatingLyricsVisibleLineCount(settings?.floatingLyricsVisibleLineCount),
      floatingLyricsBounds: normalizeFloatingLyricsBounds(settings?.floatingLyricsBounds),
    };
  } catch {
    return {
      autoFullscreenDelay: 300000,
      theme: 'midnight',
      floatingLyricsEnabled: false,
      floatingLyricsClickThrough: false,
      floatingLyricsScale: 100,
      floatingLyricsVisibleLineCount: 6,
      floatingLyricsBounds: null,
    };
  }
}

function writeSettings(partial = {}) {
  const current = readSettings();
  const delay = Number(partial.autoFullscreenDelay);
  const theme = partial.theme;
  const hasBounds = Object.prototype.hasOwnProperty.call(partial, 'floatingLyricsBounds');
  const next = {
    ...current,
    autoFullscreenDelay: [0, 120000, 300000, 600000, 900000, 1800000].includes(delay) ? delay : current.autoFullscreenDelay,
    theme: ['midnight', 'oled'].includes(theme) ? theme : current.theme,
    floatingLyricsEnabled: typeof partial.floatingLyricsEnabled === 'boolean'
      ? partial.floatingLyricsEnabled
      : current.floatingLyricsEnabled,
    floatingLyricsClickThrough: typeof partial.floatingLyricsClickThrough === 'boolean'
      ? partial.floatingLyricsClickThrough
      : current.floatingLyricsClickThrough,
    floatingLyricsScale: Object.prototype.hasOwnProperty.call(partial, 'floatingLyricsScale')
      ? normalizeFloatingLyricsScale(partial.floatingLyricsScale)
      : current.floatingLyricsScale,
    floatingLyricsVisibleLineCount: Object.prototype.hasOwnProperty.call(partial, 'floatingLyricsVisibleLineCount')
      ? normalizeFloatingLyricsVisibleLineCount(partial.floatingLyricsVisibleLineCount)
      : current.floatingLyricsVisibleLineCount,
    floatingLyricsBounds: hasBounds ? normalizeFloatingLyricsBounds(partial.floatingLyricsBounds) : current.floatingLyricsBounds,
  };
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(next, null, 2), 'utf8');
  return next;
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

  // return [...bestByKey.values()].sort((a, b) => {
  //   const aa = `${a.artist || ''} ${a.album || ''} ${String(a.track || '').padStart(3, '0')} ${a.title || ''}`.toLowerCase();
  //   const bb = `${b.artist || ''} ${b.album || ''} ${String(b.track || '').padStart(3, '0')} ${b.title || ''}`.toLowerCase();
  //   return aa.localeCompare(bb);
  // });

  return [...bestByKey.values()].sort((a, b) => {
    const aa = `${a.filePath || a.fileName || ''}`.toLowerCase();
    const bb = `${b.filePath || b.fileName || ''}`.toLowerCase();
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
function sendFloatingLyricsState() {
  if (!floatingLyricsWindow || floatingLyricsWindow.isDestroyed()) return;
  floatingLyricsWindow.webContents.send('floating-lyrics-state', latestFloatingLyricsState);
}

function sendFloatingLyricsPlaybackState() {
  if (!floatingLyricsWindow || floatingLyricsWindow.isDestroyed()) return;
  floatingLyricsWindow.webContents.send('floating-lyrics-playback-state', latestFloatingLyricsPlayback);
}

function applyFloatingLyricsMouseEvents(overlay, clickThrough, controlsHovered = false) {
  if (!overlay || overlay.isDestroyed()) return;
  const ignoreMouseEvents = Boolean(clickThrough) && !controlsHovered;
  if (ignoreMouseEvents) overlay.setIgnoreMouseEvents(true, { forward: true });
  else overlay.setIgnoreMouseEvents(false);
}

function applyFloatingLyricsScale(overlay, scale) {
  if (!overlay || overlay.isDestroyed()) return;
  const normalizedScale = normalizeFloatingLyricsScale(scale);
  const nextSize = floatingLyricsSize(normalizedScale);
  const currentBounds = overlay.getBounds();
  if (currentBounds.width !== nextSize.width || currentBounds.height !== nextSize.height) {
    overlay.setBounds({
      x: currentBounds.x,
      y: currentBounds.y,
      ...nextSize,
    });
  }
  overlay.webContents.send('floating-lyrics-scale', { scale: normalizedScale });
}

function applyFloatingLyricsVisibleLineCount(overlay, lineCount) {
  floatingLyricsVisibleLineCount = normalizeFloatingLyricsVisibleLineCount(lineCount);
  if (!overlay || overlay.isDestroyed()) return;
  overlay.webContents.send('floating-lyrics-visible-line-count', { count: floatingLyricsVisibleLineCount });
}

function persistFloatingLyricsBounds() {
  if (!floatingLyricsWindow || floatingLyricsWindow.isDestroyed()) return;
  if (floatingLyricsBoundsTimer) clearTimeout(floatingLyricsBoundsTimer);
  floatingLyricsBoundsTimer = setTimeout(() => {
    floatingLyricsBoundsTimer = null;
    if (!floatingLyricsWindow || floatingLyricsWindow.isDestroyed()) return;
    writeSettings({ floatingLyricsBounds: floatingLyricsWindow.getBounds() });
  }, 250);
}

function createFloatingLyricsWindow(settings = readSettings()) {
  if (floatingLyricsWindow && !floatingLyricsWindow.isDestroyed()) return floatingLyricsWindow;

  const savedBounds = normalizeFloatingLyricsBounds(settings.floatingLyricsBounds);
  const overlaySize = floatingLyricsSize(settings.floatingLyricsScale);
  floatingLyricsWindow = new BrowserWindow({
    ...overlaySize,
    ...(savedBounds || {}),
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'lyrics-overlay-preload.js'),
    },
  });

  floatingLyricsWindow.setAlwaysOnTop(true, 'floating');
  floatingLyricsWindow.loadFile(path.join(__dirname, 'src', 'floating-lyrics.html'));
  floatingLyricsWindow.webContents.on('did-finish-load', () => {
    sendFloatingLyricsState();
    sendFloatingLyricsPlaybackState();
    const savedSettings = readSettings();
    applyFloatingLyricsVisibleLineCount(
      floatingLyricsWindow,
      savedSettings.floatingLyricsVisibleLineCount,
    );
    applyFloatingLyricsScale(floatingLyricsWindow, savedSettings.floatingLyricsScale);
  });
  floatingLyricsWindow.on('move', persistFloatingLyricsBounds);
  floatingLyricsWindow.on('close', event => {
    if (isQuitting) return;
    event.preventDefault();
    floatingLyricsWindow?.hide();
    writeSettings({ floatingLyricsEnabled: false });
  });
  floatingLyricsWindow.on('closed', () => { floatingLyricsWindow = null; });
  return floatingLyricsWindow;
}

function syncFloatingLyricsWindow(settings = readSettings()) {
  floatingLyricsVisibleLineCount = normalizeFloatingLyricsVisibleLineCount(settings.floatingLyricsVisibleLineCount);
  floatingLyricsControlsHovered = false;
  if (!settings.floatingLyricsEnabled || isMainWindowFullscreen) {
    floatingLyricsWindow?.hide();
    return;
  }

  const overlay = createFloatingLyricsWindow(settings);
  applyFloatingLyricsMouseEvents(overlay, settings.floatingLyricsClickThrough, floatingLyricsControlsHovered);
  applyFloatingLyricsVisibleLineCount(overlay, settings.floatingLyricsVisibleLineCount);
  applyFloatingLyricsScale(overlay, settings.floatingLyricsScale);
  sendFloatingLyricsState();
  if (!overlay.isVisible()) overlay.showInactive();
}

function destroyFloatingLyricsWindow() {
  if (floatingLyricsBoundsTimer) clearTimeout(floatingLyricsBoundsTimer);
  floatingLyricsBoundsTimer = null;
  const overlay = floatingLyricsWindow;
  floatingLyricsWindow = null;
  if (overlay && !overlay.isDestroyed()) overlay.destroy();
}

function createWindow() {
  // The native window is visible before the renderer can apply its CSS. Match
  // that first paint to the saved theme so OLED never flashes Midnight navy.
  const initialTheme = readSettings().theme;
  mainWindow = new BrowserWindow({
    width: PANEL_W * 2,
    height: WIN_H,
    minWidth: 750,
    minHeight: 600,
    resizable: true,
    frame: false,
    transparent: false,
    titleBarStyle: 'hidden',
    backgroundColor: initialTheme === 'oled' ? '#050506' : '#030417',
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
  mainWindow.on('focus', () => mainWindow?.webContents.send('window-focus-changed', true));
  mainWindow.on('blur', () => mainWindow?.webContents.send('window-focus-changed', false));
  mainWindow.on('minimize', () => mainWindow?.webContents.send('window-focus-changed', false));
  mainWindow.on('maximize', () => mainWindow?.webContents.send('window-maximized-changed', true));
  mainWindow.on('unmaximize', () => mainWindow?.webContents.send('window-maximized-changed', false));
  mainWindow.on('enter-full-screen', () => {
    isMainWindowFullscreen = true;
    syncFloatingLyricsWindow();
    mainWindow?.webContents.send('fullscreen-changed', true);
  });
  mainWindow.on('leave-full-screen', () => {
    const bounds = windowedBounds;
    const restoreMaximized = wasMaximizedBeforeFullscreen;
    windowedBounds = null;
    wasMaximizedBeforeFullscreen = false;
    // Restore after Windows has finished leaving fullscreen; restoring before
    // that transition completes can leave an oversized black client area.
    setTimeout(() => {
      if (mainWindow && restoreMaximized) mainWindow.maximize();
      else if (mainWindow && bounds) mainWindow.setBounds(bounds);
      isMainWindowFullscreen = false;
      syncFloatingLyricsWindow();
      mainWindow?.webContents.send('fullscreen-changed', false);
    }, 50);
  });
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.executeJavaScript(`
      navigator.mediaSession.setActionHandler('play',          () => window.dispatchEvent(new Event('media-play-pause')));
      navigator.mediaSession.setActionHandler('pause',         () => window.dispatchEvent(new Event('media-play-pause')));
      navigator.mediaSession.setActionHandler('nexttrack',     () => window.dispatchEvent(new Event('media-next')));
      navigator.mediaSession.setActionHandler('previoustrack', () => window.dispatchEvent(new Event('media-prev')));
      navigator.mediaSession.setActionHandler('shuffle', null);
    `).catch(() => {});
    mainWindow.webContents.send('window-focus-changed', mainWindow.isFocused() && !mainWindow.isMinimized());
    mainWindow.webContents.send('window-maximized-changed', mainWindow.isMaximized());
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
    isMainWindowFullscreen = false;
    destroyFloatingLyricsWindow();
  });
}

app.whenReady().then(() => {
  protocol.registerFileProtocol('localfile', (req, cb) => {
    const fp = decodeURIComponent(req.url.replace(/^localfile:\/\/\/?/, ''));
    cb({ path: fp });
  });
  createWindow();
  syncFloatingLyricsWindow();
  configureAutoUpdater();
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => {
  if (!mainWindow) {
    createWindow();
    syncFloatingLyricsWindow();
  }
});
app.on('before-quit', () => {
  isQuitting = true;
  if (updateCheckTimer) clearTimeout(updateCheckTimer);
  destroyFloatingLyricsWindow();
});

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

ipcMain.handle('get-settings', () => readSettings());
ipcMain.handle('save-settings', (event, settings) => {
  const saved = writeSettings(settings);
  syncFloatingLyricsWindow(saved);
  return saved;
});
ipcMain.handle('get-app-version', () => app.getVersion());
ipcMain.handle('get-update-state', () => getUpdateState());
ipcMain.handle('download-update', async () => {
  if (!app.isPackaged || updateState.status !== 'available') return getUpdateState();

  try {
    setUpdateState({ status: 'downloading', percent: 0 });
    await autoUpdater.downloadUpdate();
  } catch (error) {
    console.warn('[downloadUpdate]', error?.message || error);
    setUpdateState({ status: 'error', percent: 0 });
  }
  return getUpdateState();
});
ipcMain.handle('install-update', () => {
  if (!app.isPackaged || updateState.status !== 'downloaded') return false;
  isQuitting = true;
  setImmediate(() => autoUpdater.quitAndInstall(false, true));
  return true;
});
ipcMain.on('floating-lyrics-update', (event, payload) => {
  const lines = Array.isArray(payload?.lines)
    ? payload.lines.slice(0, 6).map(line => String(line || ''))
    : latestFloatingLyricsState.lines;
  const activeIndex = Math.max(0, Math.min(lines.length - 1, Number(payload?.activeIndex) || 0));
  latestFloatingLyricsState = {
    lines,
    activeIndex,
    transition: ['forward', 'backward'].includes(payload?.transition) ? payload.transition : 'none',
  };
  sendFloatingLyricsState();
});
ipcMain.on('floating-lyrics-set-scale', (event, scale) => {
  applyFloatingLyricsScale(floatingLyricsWindow, scale);
});
ipcMain.on('floating-lyrics-set-visible-line-count', (event, lineCount) => {
  applyFloatingLyricsVisibleLineCount(floatingLyricsWindow, lineCount);
});
ipcMain.on('floating-lyrics-playback-update', (event, isPlaying) => {
  latestFloatingLyricsPlayback = { isPlaying: Boolean(isPlaying) };
  sendFloatingLyricsPlaybackState();
});
ipcMain.on('floating-lyrics-controls-hover', (event, hovered) => {
  if (event.sender !== floatingLyricsWindow?.webContents) return;
  floatingLyricsControlsHovered = Boolean(hovered);
  const settings = readSettings();
  applyFloatingLyricsMouseEvents(floatingLyricsWindow, settings.floatingLyricsClickThrough, floatingLyricsControlsHovered);
});
ipcMain.on('floating-lyrics-control', (event, action) => {
  if (event.sender !== floatingLyricsWindow?.webContents) return;
  if (!['previous', 'play-pause', 'next'].includes(action)) return;
  mainWindow?.webContents.send('floating-lyrics-control', action);
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
ipcMain.on('win-toggle-maximize', () => {
  if (!mainWindow || mainWindow.isFullScreen()) return;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.on('win-set-fullscreen', (event, enabled) => {
  if (!mainWindow) return;

  if (enabled) {
    if (mainWindow.isFullScreen()) return;
    windowedBounds = mainWindow.getBounds();
    wasMaximizedBeforeFullscreen = mainWindow.isMaximized();
    mainWindow.setFullScreen(true);
  } else if (mainWindow.isFullScreen()) {
    mainWindow.setFullScreen(false);
  }
});
ipcMain.on('win-set-width', (event, w) => {
  if (!mainWindow) return;
  const target = Math.max(PANEL_W, Number(w) || PANEL_W);
  // The queue needs room for both panes; the compact player can be narrower.
  mainWindow.setMinimumSize(target <= PANEL_W ? PANEL_W : 750, 600);
  const [, h] = mainWindow.getSize();
  mainWindow.setSize(target, h, false);
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
