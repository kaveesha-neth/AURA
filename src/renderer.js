"use strict";

// Playback remains imperative; React subscribes only to structural queue changes.
let sessionReady = false;
let sessionSaveTimer;
let notificationTimer;
function notify(message) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = String(message);
  toast.classList.add("visible");
  clearTimeout(notificationTimer);
  notificationTimer = setTimeout(() => toast.classList.remove("visible"), 5000);
}
function saveSession() {
  if (!sessionReady) return;
  const pathFor = (id) => queue.map[id]?.song.filePath;
  const snapshot = {
    order: queue.toArray().map((n) => n.song.filePath),
    current: state.currentNode?.song.filePath || null,
    time: audio.currentTime || 0,
    volume: state.volume,
    repeat: state.repeat,
    shuffle: state.shuffle,
    original: shuffleState.originalOrder.map(pathFor).filter(Boolean),
    history: shuffleState.history.map((n) => n.song.filePath),
    historyIndex: shuffleState.historyIndex,
    remaining: [...shuffleState.remaining].map(pathFor).filter(Boolean),
    eq: [...eqValues],
    eqEnabled,
  };
  window.electronAPI?.savePlayerState?.(snapshot)?.catch(() => {});
}
function scheduleSessionSave() {
  if (!sessionReady) return;
  clearTimeout(sessionSaveTimer);
  sessionSaveTimer = setTimeout(saveSession, 350);
}
async function restoreSession() {
  try {
    const saved = await window.electronAPI?.getPlayerState?.();
    if (saved && Array.isArray(saved.order)) {
      const byPath = new Map(queue.toArray().map((n) => [n.song.filePath, n]));
      rebuildQueue(
        [...new Set(saved.order)].map((p) => byPath.get(p)).filter(Boolean),
      );
      state.shuffle = Boolean(saved.shuffle);
      state.repeat = [0, 1, 2].includes(saved.repeat) ? saved.repeat : 0;
      shuffleState.originalOrder = (saved.original || saved.order)
        .map((p) => byPath.get(p)?.id)
        .filter((id) => queue.map[id]);
      shuffleState.history = (saved.history || [])
        .map((p) => byPath.get(p))
        .filter((n) => n && queue.map[n.id]);
      shuffleState.historyIndex = Math.min(
        Math.max(-1, Number(saved.historyIndex) || 0),
        shuffleState.history.length - 1,
      );
      shuffleState.remaining = new Set(
        (saved.remaining || [])
          .map((p) => byPath.get(p)?.id)
          .filter((id) => queue.map[id]),
      );
      btnShuffle.classList.toggle("active", state.shuffle);
      btnRepeat.classList.toggle("active", state.repeat > 0);
      iconRepAll.style.display = state.repeat === 2 ? "none" : "block";
      iconRepOne.style.display = state.repeat === 2 ? "block" : "none";
      btnRepeat.title = ["Repeat off", "Repeat all", "Repeat one"][
        state.repeat
      ];
      const node = byPath.get(saved.current);
      if (node && queue.map[node.id]) {
        await loadNode(node, false);
        const restoreTime = () => {
          if (Number.isFinite(saved.time) && audio.duration)
            audio.currentTime = Math.min(
              audio.duration,
              Math.max(0, saved.time),
            );
        };
        if (audio.readyState >= 1) restoreTime();
        else
          audio.addEventListener("loadedmetadata", restoreTime, { once: true });
      } else if (queue.head) await loadNode(queue.head, false);
      else {
        state.currentNode = null;
        audio.pause();
        audio.removeAttribute("src");
        songTitle.textContent = "No track selected";
        songArtist.textContent = "Add music to your queue to begin.";
        songAlbum.textContent = "";
        setCover(null);
        coverWrap.classList.remove("has-song");
        resetLyricsOverlay();
      }
      if (!usesMasterVolume && Number.isFinite(saved.volume)) setVolume(saved.volume);
      if (Array.isArray(saved.eq) && saved.eq.length === 5)
        saved.eq.forEach((g, i) => {
          eqValues[i] = Math.max(-12, Math.min(12, Number(g) || 0));
        });
      setEQEnabled(saved.eqEnabled !== false);
      document.getElementById("eq-toggle").checked = eqEnabled;
    }
  } catch (error) {
    console.warn("Unable to restore player session", error);
  }
  sessionReady = true;
  renderQueue();
  updatePlayBtn();
}

// DOUBLY LINKED LIST  +  ID MAP
const MusicQueue = window.AuraDomain.MusicQueue;

// STATE
const queue = new MusicQueue();
const usesMasterVolume = window.electronAPI?.systemVolumeSupported === true;
let masterVolumeAvailable = !usesMasterVolume;
let isWindowFocused = document.hasFocus();
let isFullscreenMode = false;
let isTouchMode = false;
let touchSource = "native";
let fullscreenLyricIndex = -1;
const AUTO_FULLSCREEN_DELAYS = new Set([
  0, 120000, 300000, 600000, 900000, 1800000,
]);
let autoFullscreenDelay = 300000;
let autoFullscreenTimer = null;
let lastAutoFullscreenActivity = Date.now();
let floatingLyricsEnabled = false;
let floatingLyricsClickThrough = false;
let floatingLyricsScale = 100;
let floatingLyricsVisibleLineCount = 6;
const state = {
  currentNode: null,
  isPlaying: false,
  shuffle: false,
  repeat: 0,
  volume: 0.8,
  seeking: false,
  acx: null,
  lyrics: {
    loading: false,
    type: "none",
    status: "idle",
    lines: [],
    activeIndex: -1,
    requestId: 0,
  },
};

// Shuffle creates one fixed playback order. The linked list remains the exact
// order shown in the queue while shuffle is on; history only tracks navigation.
const shuffleState = {
  originalOrder: [], // node ids, captured when shuffle is enabled
  history: [], // nodes in the order they were played
  historyIndex: -1,
  remaining: new Set(), // ids left in the current shuffled cycle
};

// ELEMENTS
const audio = document.getElementById("audio");
const coverImg = document.getElementById("cover-img");
const coverPh = document.getElementById("cover-placeholder");
const coverWrap = document.getElementById("cover-wrap");
const coverCont = document.getElementById("cover-container");
const coverGlow = document.getElementById("cover-glow");
const lyricsOverlay = document.getElementById("lyrics-overlay");
const lyricsPrev = document.getElementById("lyrics-prev");
const lyricsCurrent = document.getElementById("lyrics-current");
const lyricsNext = document.getElementById("lyrics-next");
const lyricsStatus = document.getElementById("lyrics-status");
const playerBg = document.getElementById("player-bg");
const songTitle = document.getElementById("song-title");
const songArtist = document.getElementById("song-artist");
const songAlbum = document.getElementById("song-album");
const fullscreenPlayer = document.getElementById("fullscreen-player");
const fullscreenBackground = document.getElementById("fullscreen-background");
const fullscreenBackgroundTransition = document.getElementById(
  "fullscreen-background-transition",
);
const fullscreenCover = document.getElementById("fullscreen-cover");
const fullscreenCoverTransition = document.getElementById(
  "fullscreen-cover-transition",
);
const fullscreenTitle = document.getElementById("fullscreen-title");
const fullscreenArtist = document.getElementById("fullscreen-artist");
const fullscreenSeekTrack = document.getElementById("fullscreen-seek-track");
const fullscreenSeekFill = document.getElementById("fullscreen-seek-fill");
const fullscreenSeekThumb = document.getElementById("fullscreen-seek-thumb");
const fullscreenTimeCurrent = document.getElementById(
  "fullscreen-time-current",
);
const fullscreenTimeTotal = document.getElementById("fullscreen-time-total");
const fullscreenLyrics = [...document.querySelectorAll(".fullscreen-lyric")];
const fullscreenIconPlay = document.getElementById("fullscreen-icon-play");
const fullscreenIconPause = document.getElementById("fullscreen-icon-pause");
const seekTrack = document.getElementById("seek-track");
const seekFill = document.getElementById("seek-fill");
const seekThumb = document.getElementById("seek-thumb");
const timeCur = document.getElementById("time-current");
const timeTot = document.getElementById("time-total");
const btnPlay = document.getElementById("btn-play");
const iconPlay = document.getElementById("icon-play");
const iconPause = document.getElementById("icon-pause");
const btnPrev = document.getElementById("btn-prev");
const btnNext = document.getElementById("btn-next");
const btnShuffle = document.getElementById("btn-shuffle");
const btnRepeat = document.getElementById("btn-repeat");
const iconRepAll = document.getElementById("icon-repeat-all");
const iconRepOne = document.getElementById("icon-repeat-one");
const volTrack = document.getElementById("vol-track");
const volFill = document.getElementById("vol-fill");
const volThumb = document.getElementById("vol-thumb");
const volLabel = document.getElementById("vol-label");
const queueList = document.getElementById("queue-list");
const qCount = document.getElementById("q-count");
const qSearch = document.getElementById("queue-search");
const btnAddFiles = document.getElementById("btn-add-files");
const btnAddFolder = document.getElementById("btn-add-folder");
const btnRescan = document.getElementById("btn-rescan");
const btnClear = document.getElementById("btn-clear-queue");
const playRipple = document.getElementById("play-ripple");
const loadingOverlay = document.getElementById("loading-overlay");
const loadingText = document.getElementById("loading-text");
const btnLibrary = document.getElementById("btn-library");
const libraryModal = document.getElementById("library-modal");
const libraryBackdrop = document.getElementById("library-backdrop");
const libraryClose = document.getElementById("library-close");
const libraryContent = document.getElementById("library-content");
const librarySearchInput = document.getElementById("library-search");
const libraryFolderCount = document.getElementById("library-folder-count");
const libraryFileCount = document.getElementById("library-file-count");
const librarySongCount = document.getElementById("library-song-count");
const libraryAddFolderBtn = document.getElementById("library-add-folder");
const libraryAddFilesBtn = document.getElementById("library-add-files");
const libraryRescanBtn = document.getElementById("library-rescan");
const libraryClearBtn = document.getElementById("library-clear");

// HELPERS
const fmtTime = (s) =>
  !s || isNaN(s) || !isFinite(s)
    ? "0:00"
    : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const esc = (s) =>
  (s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
const toUrl = window.AuraDomain.mediaUrl;
const showLoading = (t) => {
  loadingText.textContent = t || "Loading…";
  loadingOverlay.style.opacity = "1";
  loadingOverlay.style.pointerEvents = "all";
};
const hideLoading = () => {
  loadingOverlay.style.opacity = "0";
  loadingOverlay.style.pointerEvents = "none";
};

// TIMELINE
// SYNCHRONIZED LYRICS OVERLAY
const { parseLRCTime, parseLRC } = window.AuraDomain;

function plainLyricsToTimedLines(text, duration) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);

  if (!lines.length) return [];

  const total = Number(duration || audio.duration || 0);
  const step = total > 15 ? total / Math.max(lines.length, 1) : 4;
  return lines.map((text, i) => ({ time: i * step, text }));
}

function publishFloatingLyrics(transition = "none") {
  const offsets = fullscreenLyrics.map((el) =>
    Number(el.dataset.lyricOffset || 0),
  );
  const activeIndex = Math.max(0, offsets.indexOf(0));
  const lines = state.lyrics.lines;
  const sourceIndex =
    state.lyrics.activeIndex < 0 ? 0 : state.lyrics.activeIndex;
  const fallback = lyricsCurrent?.textContent || "";
  const lyricStack = offsets.map((offset) => {
    if (!lines.length) return offset === 0 ? fallback : "";
    return lines[sourceIndex + offset]?.text || "";
  });

  window.electronAPI?.updateFloatingLyrics?.({
    lines: lyricStack,
    activeIndex,
    transition,
  });
}

function setLyricsVisual(
  prev = "",
  cur = "",
  next = "",
  status = "",
  transition = "none",
) {
  window.auraLyricsRender?.({
    track: state.currentNode?.song.filePath || "",
    lines: state.lyrics.lines,
    activeIndex: state.lyrics.type === "synced" ? state.lyrics.activeIndex : -1,
    type: state.lyrics.type,
    message: state.lyrics.lines.length ? "" : cur || "No track selected",
  });
  if (!lyricsOverlay) return;
  lyricsPrev.textContent = prev;
  lyricsCurrent.textContent = cur;
  lyricsNext.textContent = next;
  lyricsStatus.textContent = status || "";
  updateFullscreenLyrics(cur);
  publishFloatingLyrics(transition);
}

function updateFullscreenLyrics(fallback = "") {
  if (!fullscreenLyrics.length) return;
  const lines = state.lyrics.lines;
  const activeIndex =
    state.lyrics.activeIndex < 0 ? 0 : state.lyrics.activeIndex;

  fullscreenLyrics.forEach((el) => {
    const offset = Number(el.dataset.lyricOffset || 0);
    el.textContent = lines.length
      ? lines[activeIndex + offset]?.text || ""
      : offset === 0
        ? fallback
        : "";
  });

  if (isFullscreenMode) {
    requestAnimationFrame(() =>
      fullscreenLyrics
        .find((el) => Number(el.dataset.lyricOffset) === 0)
        ?.scrollIntoView({
          block: "nearest",
          behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "instant"
            : "smooth",
        }),
    );
  }

  if (!lines.length) {
    fullscreenLyricIndex = -1;
    return;
  }

  if (fullscreenLyricIndex !== -1 && fullscreenLyricIndex !== activeIndex) {
    fullscreenLyrics[0]?.parentElement?.classList.remove(
      "lyrics-stepping-up",
      "lyrics-stepping-down",
    );
    void fullscreenLyrics[0]?.parentElement?.offsetWidth;
    fullscreenLyrics[0]?.parentElement?.classList.add(
      activeIndex > fullscreenLyricIndex
        ? "lyrics-stepping-up"
        : "lyrics-stepping-down",
    );
  }
  fullscreenLyricIndex = activeIndex;
}

function resetLyricsOverlay(message = "") {
  // Clearing playback also invalidates any outstanding request for that track.
  ++state.lyrics.requestId;
  state.lyrics.loading = false;
  state.lyrics.lines = [];
  state.lyrics.activeIndex = -1;
  state.lyrics.type = "none";
  state.lyrics.status = message ? "message" : "idle";
  setLyricsVisual("", message, "", "");
  lyricsOverlay?.classList.toggle("lyrics-hidden", !message);
  lyricsOverlay?.classList.remove("lyrics-has-lines", "lyrics-loading");
}

function showLyricsLoading() {
  state.lyrics.loading = true;
  state.lyrics.type = "none";
  state.lyrics.status = "loading";
  state.lyrics.lines = [];
  state.lyrics.activeIndex = -1;
  setLyricsVisual("", "Finding lyrics…", "", "");
  lyricsOverlay?.classList.remove("lyrics-hidden", "lyrics-has-lines");
  lyricsOverlay?.classList.add("lyrics-loading");
}

function setLyricsLines(lines, type, statusText = "") {
  state.lyrics.loading = false;
  state.lyrics.lines = Array.isArray(lines) ? lines : [];
  state.lyrics.activeIndex = -1;
  state.lyrics.type = type || "none";
  state.lyrics.status = state.lyrics.lines.length ? "ready" : "missing";

  lyricsOverlay?.classList.remove("lyrics-loading");
  lyricsOverlay?.classList.toggle("lyrics-hidden", !state.lyrics.lines.length);
  lyricsOverlay?.classList.toggle(
    "lyrics-has-lines",
    !!state.lyrics.lines.length,
  );
  lyricsOverlay?.classList.toggle("lyrics-plain", type === "plain");

  if (!state.lyrics.lines.length) {
    setLyricsVisual("", statusText || "No lyrics found", "", "");
    return;
  }

  updateLyricsOverlay(audio.currentTime || 0, true);
}

function findActiveLyricIndex(time) {
  return window.AuraDomain.activeLyricIndex(state.lyrics.lines, time);
}

function updateLyricsOverlay(time, force = false) {
  const lines = state.lyrics.lines;
  if (!lines.length || !lyricsOverlay) return;

  const idx = findActiveLyricIndex(time);
  if (!force && idx === state.lyrics.activeIndex) return;

  const previousIndex = state.lyrics.activeIndex;
  state.lyrics.activeIndex = idx;
  const prev = idx > 0 ? lines[idx - 1].text : "";
  const cur = lines[idx]?.text || "";
  const next = idx < lines.length - 1 ? lines[idx + 1].text : "";
  const status = state.lyrics.type === "plain" ? "Plain lyrics" : "";

  lyricsOverlay.classList.remove("lyrics-step");
  void lyricsOverlay.offsetWidth;
  lyricsOverlay.classList.add("lyrics-step");
  const transition =
    previousIndex < 0 || previousIndex === idx
      ? "none"
      : idx > previousIndex
        ? "forward"
        : "backward";
  setLyricsVisual(prev, cur, next, status, transition);
}

async function loadLyricsForSong(song, force = false) {
  const requestId = ++state.lyrics.requestId;
  showLyricsLoading();

  try {
    const payload = force
      ? await window.electronAPI?.refreshLyrics?.(song)
      : await window.electronAPI?.getLyrics?.(song);

    if (requestId !== state.lyrics.requestId) return;

    if (!payload || payload.status === "error") {
      resetLyricsOverlay("Lyrics unavailable");
      return;
    }
    if (payload.status === "loading") {
      resetLyricsOverlay("Lyrics downloading…");
      return;
    }

    if (payload.instrumental) {
      resetLyricsOverlay("Instrumental");
      return;
    }

    const synced = parseLRC(payload.syncedLyrics || "");
    if (synced.length) {
      setLyricsLines(synced, "synced");
      return;
    }

    const plain = plainLyricsToTimedLines(
      payload.plainLyrics || "",
      song?.duration || audio.duration,
    );
    if (plain.length) {
      setLyricsLines(plain, "plain");
      return;
    }

    resetLyricsOverlay("No lyrics found");
  } catch (e) {
    if (requestId === state.lyrics.requestId)
      resetLyricsOverlay("Lyrics unavailable");
    console.warn("[loadLyricsForSong]", e);
  } finally {
    if (requestId === state.lyrics.requestId) {
      state.lyrics.loading = false;
      lyricsOverlay?.classList.remove("lyrics-loading");
    }
  }
}

// COVER
function extractAccent(img) {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 16;
    const context = canvas.getContext("2d");
    context.drawImage(img, 0, 0, 16, 16);
    const pixels = context.getImageData(0, 0, 16, 16).data;
    let r = 0,
      g = 0,
      b = 0,
      total = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const max = Math.max(pixels[i], pixels[i + 1], pixels[i + 2]),
        min = Math.min(pixels[i], pixels[i + 1], pixels[i + 2]);
      const light = (max + min) / 510;
      if (light < 0.06 || light > 0.94) continue;
      const weight = 0.3 + (max - min) / 255;
      r += pixels[i] * weight;
      g += pixels[i + 1] * weight;
      b += pixels[i + 2] * weight;
      total += weight;
    }
    if (!total) return;
    playerBg.style.setProperty(
      "--ambient-color",
      "rgb(" +
        Math.round(r / total) +
        "," +
        Math.round(g / total) +
        "," +
        Math.round(b / total) +
        ")",
    );
  } catch {}
}
function setCover(path) {
  const ambient = document.getElementById("ambient-art");
  const previous = document.getElementById("ambient-art-previous");
  if (ambient.getAttribute("src")) {
    previous.src = ambient.src;
    previous.style.opacity = ".12";
  }
  if (path) {
    const url = toUrl(path);
    coverImg.onload = () => {
      coverImg.style.display = "block";
      coverPh.style.display = "none";
      extractAccent(coverImg);
      if (!matchMedia("(prefers-reduced-motion: reduce)").matches)
        coverImg.animate(
          [
            { opacity: 0.3, transform: "scale(.99)" },
            { opacity: 1, transform: "scale(1)" },
          ],
          { duration: 280, easing: "cubic-bezier(.2,.7,.2,1)" },
        );
    };
    coverImg.onerror = () => {
      coverImg.style.display = "none";
      coverPh.style.display = "flex";
    };
    coverImg.src = url;
    ambient.onload = () => {
      previous.style.opacity = "0";
    };
    ambient.src = url;
  } else {
    coverImg.style.display = "none";
    coverPh.style.display = "flex";
    ambient.removeAttribute("src");
    previous.removeAttribute("src");
    playerBg.style.setProperty("--ambient-color", "#333545");
  }
}

let fullscreenTrackTransitionTimer;
function setFullscreenArtwork(coverPath, animate = false, direction = "next") {
  const nextUrl = coverPath ? toUrl(coverPath) : "";
  const currentUrl = fullscreenCover.getAttribute("src") || "";
  const canAnimate = animate && currentUrl && nextUrl && currentUrl !== nextUrl;

  if (!canAnimate) {
    if (nextUrl) fullscreenCover.src = nextUrl;
    else fullscreenCover.removeAttribute("src");
    fullscreenBackground.style.backgroundImage = nextUrl
      ? `url("${nextUrl}")`
      : "none";
    fullscreenBackgroundTransition.style.backgroundImage = "none";
    return;
  }

  clearTimeout(fullscreenTrackTransitionTimer);
  fullscreenCoverTransition.src = currentUrl;
  fullscreenBackgroundTransition.style.backgroundImage = `url("${nextUrl}")`;
  fullscreenCover.src = nextUrl;
  fullscreenPlayer.classList.remove(
    "track-transition",
    "track-transition-previous",
  );
  void fullscreenPlayer.offsetWidth;
  if (direction === "previous")
    fullscreenPlayer.classList.add("track-transition-previous");
  fullscreenPlayer.classList.add("track-transition");

  fullscreenTrackTransitionTimer = setTimeout(() => {
    fullscreenBackground.style.backgroundImage = `url("${nextUrl}")`;
    fullscreenBackgroundTransition.style.backgroundImage = "none";
    fullscreenCoverTransition.removeAttribute("src");
    fullscreenPlayer.classList.remove(
      "track-transition",
      "track-transition-previous",
    );
  }, 720);
}

function syncFullscreenTrack(song = state.currentNode?.song) {
  fullscreenTitle.textContent = song?.title || "No track selected";
  fullscreenArtist.textContent = song?.artist || "Choose a song to get started";
}

// INFO ANIMATION
let infoTimer = null;
function animateInfo(song) {
  const el = document.getElementById("song-info");
  el.classList.remove("info-enter");
  el.classList.add("info-exit");
  clearTimeout(infoTimer);
  infoTimer = setTimeout(() => {
    el.classList.remove("info-exit");
    songTitle.textContent = song.title;
    songArtist.textContent = song.artist;
    songAlbum.textContent =
      song.album && song.album !== "Unknown Album" ? song.album : "";
    songTitle.title = song.title;
    songArtist.title = song.artist;
    el.classList.add("info-enter");
  }, 180);
}

// LOAD NODE
async function updateMediaSession(song) {
  if (!("mediaSession" in navigator)) return;
  let artwork = [];
  if (song.coverPath && window.electronAPI?.getCoverBase64) {
    const b64 = await window.electronAPI.getCoverBase64(song.coverPath);
    if (b64) artwork = [{ src: b64, sizes: "512x512", type: "image/jpeg" }];
  }
  if (state.currentNode?.song.filePath !== song.filePath) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: song.title,
    artist: song.artist,
    album: song.album || "",
    artwork,
  });
}

function updateMediaPosition() {
  if (!("mediaSession" in navigator) || !audio.duration) return;
  navigator.mediaSession.setPositionState({
    duration: audio.duration,
    playbackRate: audio.playbackRate,
    position: audio.currentTime,
  });
}

async function loadNode(node, autoplay, direction = "next") {
  if (!node) return;
  const animateFullscreenChange =
    isFullscreenMode && state.currentNode && state.currentNode !== node;
  state.currentNode = node;
  resetAutoFullscreenTimer();
  animateInfo(node.song);
  setCover(node.song.coverPath);
  coverWrap.classList.add("has-song");
  setFullscreenArtwork(node.song.coverPath, animateFullscreenChange, direction);
  syncFullscreenTrack(node.song);
  updateMediaSession(node.song);
  loadLyricsForSong(node.song, false);
  coverCont.style.animation = "none";
  void coverCont.offsetHeight;
  coverCont.style.animation = "";
  const url = toUrl(node.song.filePath);
  audio.src = url;
  audio.load();
  seekFill.style.width = "0%";
  seekThumb.style.left = "0%";
  timeCur.textContent = "0:00";
  timeTot.textContent = "—";
  // Loading a replacement source pauses the media element, including when
  // library removal selects a fallback track without autoplay.
  if (!autoplay) {
    state.isPlaying = false;
    updatePlayBtn();
    updateQueuePlayingState();
    clearAutoFullscreenTimer();
  }
  renderQueue();
  if (autoplay) {
    try {
      await audio.play();
      state.isPlaying = true;
    } catch (e) {
      console.error(e);
      notify(e?.message || "Something went wrong. Please try again.");
      state.isPlaying = false;
    }
    updatePlayBtn();
    updateQueuePlayingState();
    if (state.isPlaying) resetAutoFullscreenTimer();
    else clearAutoFullscreenTimer();
    triggerRipple();
  }
}

// PLAYBACK HELPERS
function updatePlayBtn() {
  btnPlay.setAttribute("aria-label", state.isPlaying ? "Pause" : "Play");
  btnPlay.setAttribute("aria-pressed", String(state.isPlaying));
  iconPlay.style.display = state.isPlaying ? "none" : "block";
  scheduleSessionSave();
  iconPause.style.display = state.isPlaying ? "block" : "none";
  coverCont.classList.toggle("playing", state.isPlaying);
  coverCont.classList.toggle(
    "spinning-paused",
    !state.isPlaying || !isWindowFocused,
  );
  if (fullscreenIconPlay && fullscreenIconPause) {
    fullscreenIconPlay.hidden = state.isPlaying;
    fullscreenIconPause.hidden = !state.isPlaying;
  }
  window.electronAPI?.updateFloatingLyricsPlayback?.(state.isPlaying);
}
function updateQueuePlayingState() {
  renderQueue();
  const active = queueList.querySelector(".q-item.active");
  if (!active) return;

  active
    .querySelector(".q-now-playing-overlay")
    ?.classList.toggle("paused", !state.isPlaying);

  active
    .querySelector(".eq-anim")
    ?.classList.toggle("paused", !state.isPlaying);
}

function triggerRipple() {
  btnPlay.classList.remove("rippling");
  void btnPlay.offsetHeight;
  btnPlay.classList.add("rippling");
  setTimeout(() => btnPlay.classList.remove("rippling"), 500);
}
function applyVolume(v, muted = false) {
  const volumeButton = document.getElementById("vol-icon");
  if (volumeButton) {
    volumeButton.dataset.muted = String(muted || v <= 0);
    volumeButton.disabled = !masterVolumeAvailable;
    volumeButton.setAttribute("aria-label", usesMasterVolume ? (muted ? "Unmute master volume" : "Mute master volume") : (v <= 0 ? "Unmute" : "Mute"));
    volumeButton.title = masterVolumeAvailable ? volumeButton.getAttribute("aria-label") : "Master volume unavailable";
  }
  state.volume = Math.max(0, Math.min(1, v));
  state.muted = muted;
  audio.volume = usesMasterVolume ? 1 : state.volume;
  const p = state.volume * 100;
  volTrack?.setAttribute("aria-valuenow", String(Math.round(p)));
  volTrack?.setAttribute("aria-disabled", String(!masterVolumeAvailable));
  volTrack?.setAttribute("aria-label", usesMasterVolume ? "Master volume" : "Volume");
  volTrack?.setAttribute("aria-valuetext", masterVolumeAvailable ? `${Math.round(p)} percent${muted ? ", muted" : ""}` : "Master volume unavailable");
  scheduleSessionSave();
  if (volFill) volFill.style.width = p + "%";
  if (volThumb) volThumb.style.left = p + "%";
  if (volLabel) volLabel.textContent = masterVolumeAvailable ? Math.round(p) : "—";
  window.dispatchEvent(new Event("aura-volume-changed"));
}
function setVolume(v) {
  if (!Number.isFinite(v)) return;
  v = Math.max(0, Math.min(1, v));
  if (usesMasterVolume) {
    if (masterVolumeAvailable) {
      applyVolume(v, false);
      window.electronAPI.setMasterVolume(v);
    }
    return;
  }
  applyVolume(v);
}
function receiveMasterVolume(value) {
  if (!usesMasterVolume || !value) return;
  masterVolumeAvailable = value.available === true;
  applyVolume(Number.isFinite(value.volume) ? value.volume : state.volume, value.muted === true);
}
function updateSeek() {
  if (!audio.duration || state.seeking) return;
  const p = audio.currentTime / audio.duration;
  seekFill.style.width = p * 100 + "%";
  seekThumb.style.left = p * 100 + "%";
  timeCur.textContent = fmtTime(audio.currentTime);
  fullscreenSeekFill.style.width = p * 100 + "%";
  fullscreenSeekThumb.style.left = p * 100 + "%";
  fullscreenTimeCurrent.textContent = fmtTime(audio.currentTime);
  updateMediaPosition();
  updateLyricsOverlay(audio.currentTime);
}

// NAVIGATION
function rebuildQueue(nodes) {
  queue.head = null;
  queue.tail = null;
  queue.size = 0;
  queue.map = {};
  nodes.forEach((node) => {
    node.prev = null;
    node.next = null;
    queue.appendNode(node);
  });
}

function fisherYates(nodes) {
  const shuffled = nodes.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function rememberShuffleStart(current) {
  shuffleState.history = current ? [current] : [];
  shuffleState.historyIndex = current ? 0 : -1;
  shuffleState.remaining = new Set(
    queue
      .toArray()
      .filter((node) => node !== current)
      .map((node) => node.id),
  );
}

function recordShuffleVisit(node) {
  if (shuffleState.history[shuffleState.historyIndex] === node) return;
  shuffleState.history.splice(shuffleState.historyIndex + 1);
  shuffleState.history.push(node);
  shuffleState.historyIndex = shuffleState.history.length - 1;
  shuffleState.remaining.delete(node.id);
}

function findUpcomingShuffleNode() {
  if (!state.currentNode || !queue.size) return queue.head;

  let node = state.currentNode.next || queue.head;
  for (
    let count = 0;
    count < queue.size;
    count++, node = node.next || queue.head
  ) {
    if (shuffleState.remaining.has(node.id)) return node;
  }
  return null;
}

function getNextNode() {
  if (!state.currentNode) return queue.head;
  if (!state.shuffle) {
    if (state.currentNode.next) return state.currentNode.next;
    return state.repeat === 1 ? queue.head : null;
  }

  // After Previous, Next first walks forward through the real play history.
  if (shuffleState.historyIndex < shuffleState.history.length - 1) {
    return shuffleState.history[shuffleState.historyIndex + 1];
  }

  let next = findUpcomingShuffleNode();
  if (next) return next;

  // Repeat all begins a new pass through the same established queue order.
  if (state.repeat === 1 && queue.size > 1) {
    shuffleState.remaining = new Set(
      queue
        .toArray()
        .filter((node) => node !== state.currentNode)
        .map((node) => node.id),
    );
    next = findUpcomingShuffleNode();
  }
  return next;
}

function queueNodeNext(node) {
  if (!node || node === state.currentNode) return;
  queue.detach(node);
  if (state.currentNode) queue.insertAfter(state.currentNode, node);
  else if (queue.head) queue.insertBefore(queue.head, node);
  else queue.appendNode(node);
  if (state.shuffle) {
    shuffleState.history.splice(shuffleState.historyIndex + 1);
    shuffleState.remaining.add(node.id);
  }
}

function addDownloadedSong(song, library, next) {
  libraryState = library;
  // Insert only this song, preserving queue edits and the current audio element.
  let node = queue
    .toArray()
    .find((item) => item.song.filePath === song.filePath);
  if (!node) {
    stampOrig(song);
    node = queue.push(song);
    if (state.shuffle) {
      shuffleState.originalOrder.push(node.id);
      shuffleState.remaining.add(node.id);
    }
  }
  if (next) queueNodeNext(node);
  renderQueue();
  renderLibraryManager();
  if (!state.currentNode) loadNode(queue.head, false);
}

function getPrevNode() {
  if (audio.currentTime > 3) return state.currentNode;
  if (!state.currentNode) return queue.tail;
  if (!state.shuffle) {
    if (state.currentNode.prev) return state.currentNode.prev;
    return state.repeat === 1 ? queue.tail : state.currentNode;
  }
  return shuffleState.historyIndex > 0
    ? shuffleState.history[shuffleState.historyIndex - 1]
    : state.currentNode;
}

function playNext(autoplay) {
  const node = getNextNode();
  if (!node) return false;

  if (state.shuffle) {
    const fromHistory =
      shuffleState.history[shuffleState.historyIndex + 1] === node;
    if (fromHistory) shuffleState.historyIndex++;
    else recordShuffleVisit(node);
  }
  loadNode(node, autoplay, "next");
  return true;
}

function playPrevious(autoplay) {
  const node = getPrevNode();
  if (!node) return false;

  if (state.shuffle && node !== state.currentNode) {
    shuffleState.historyIndex--;
  }
  loadNode(node, autoplay, "previous");
  return true;
}

function playSpecificNode(node, autoplay) {
  if (!node) return false;
  if (state.shuffle && node !== state.currentNode) {
    const historyPosition = shuffleState.history.lastIndexOf(node);
    if (historyPosition !== -1) shuffleState.historyIndex = historyPosition;
    else recordShuffleVisit(node);
  }
  loadNode(node, autoplay);
  return true;
}

function enableShuffle() {
  if (!queue.size) return;
  const current = state.currentNode || queue.head;
  const nodes = queue.toArray();
  shuffleState.originalOrder = nodes.map((node) => node.id);
  rebuildQueue([
    current,
    ...fisherYates(nodes.filter((node) => node !== current)),
  ]);
  state.currentNode = current;
  state.shuffle = true;
  rememberShuffleStart(current);
  renderQueue();
}

function reshuffleUpcoming() {
  if (!state.shuffle || !state.currentNode) return;
  const current = state.currentNode;
  const nodes = queue.toArray();
  const upcoming = nodes.filter(
    (node) => node !== current && shuffleState.remaining.has(node.id),
  );
  const played = nodes.filter(
    (node) => node !== current && !shuffleState.remaining.has(node.id),
  );
  rebuildQueue([current, ...fisherYates(upcoming), ...played]);
  renderQueue();
}

function disableShuffle() {
  if (!state.shuffle) return;
  const byId = queue.map;
  const restored = shuffleState.originalOrder
    .map((id) => byId[id])
    .filter(Boolean);
  // Anything added while shuffled was not part of the original snapshot.
  queue.toArray().forEach((node) => {
    if (!restored.includes(node)) restored.push(node);
  });
  // Put the visible queue back at its genuine original first track. The current
  // song keeps playing in place instead of forcing the queue to start from it.
  rebuildQueue(restored);
  state.shuffle = false;
  shuffleState.originalOrder = [];
  shuffleState.history = [];
  shuffleState.historyIndex = -1;
  shuffleState.remaining.clear();
  renderQueue();
}

// REMOVE NODE
function removeNode(node) {
  if (!node) return;
  const wasCurrent = node === state.currentNode;
  const fallback = node.next || node.prev;
  queue.remove(node);
  if (state.shuffle) {
    shuffleState.originalOrder = shuffleState.originalOrder.filter(
      (id) => id !== node.id,
    );
    shuffleState.remaining.delete(node.id);
    const oldHistoryIndex = shuffleState.historyIndex;
    shuffleState.history = shuffleState.history.filter((item) => item !== node);
    shuffleState.historyIndex = Math.min(
      oldHistoryIndex,
      shuffleState.history.length - 1,
    );
  }
  if (wasCurrent) {
    if (!queue.size) {
      audio.pause();
      audio.src = "";
      state.isPlaying = false;
      state.currentNode = null;
      songTitle.textContent = "No track selected";
      songArtist.textContent = "Choose music from your library.";
      songAlbum.textContent = "";
      setCover(null);
      coverWrap.classList.remove("has-song");
      resetLyricsOverlay();
      updatePlayBtn();
    } else {
      if (state.shuffle) {
        rememberShuffleStart(fallback);
      }
      loadNode(fallback, state.isPlaying);
    }
  }
  renderQueue();
}

// QUEUE SORT
// sortKeys: ordered array of active sort keys, e.g. ['artist','album']
// dateDir: 1 = ascending (oldest first), -1 = descending (newest first)
let sortKeys = [];
let dateDir = 1;
let dateFlipped = false; // true after 2nd click (direction toggled); 3rd click removes
let _origSeed = 0;

// Stamp original insertion index on a song object when pushed
function stampOrig(song) {
  if (song._origIndex == null) song._origIndex = ++_origSeed;
}

// Apply active sorts to the linked list (stable multi-key sort)
function applySort() {
  const nodes = queue.toArray();
  if (!nodes.length) return;

  if (!sortKeys.length) {
    // Restore original order
    nodes.sort((a, b) => (a.song._origIndex || 0) - (b.song._origIndex || 0));
  } else {
    nodes.sort((a, b) => {
      for (const key of sortKeys) {
        let av = "",
          bv = "";
        if (key === "artist") {
          av = (a.song.artist || "").toLowerCase();
          bv = (b.song.artist || "").toLowerCase();
        } else if (key === "album") {
          av = (a.song.album || "").toLowerCase();
          bv = (b.song.album || "").toLowerCase();
        } else if (key === "date") {
          // Use _origIndex as proxy for "date added" order
          const diff =
            ((a.song._origIndex || 0) - (b.song._origIndex || 0)) * dateDir;
          if (diff !== 0) return diff;
          continue;
        }
        if (av < bv) return -1;
        if (av > bv) return 1;
      }
      // Stable tie-break: original order
      return (a.song._origIndex || 0) - (b.song._origIndex || 0);
    });
  }

  // Rebuild the linked list in sorted order
  queue.head = null;
  queue.tail = null;
  queue.size = 0;
  nodes.forEach((n) => {
    n.prev = null;
    n.next = null;
    queue.appendNode(n);
  });
}

function toggleSortKey(key) {
  const idx = sortKeys.indexOf(key);
  if (key === "date" && idx !== -1) {
    if (!dateFlipped) {
      // 2nd click: flip direction
      dateDir = -1;
      dateFlipped = true;
      document.getElementById("sort-date-dir").textContent = "↓";
    } else {
      // 3rd click: remove
      sortKeys.splice(idx, 1);
      dateDir = 1;
      dateFlipped = false;
      document.getElementById("sort-date-dir").textContent = "↑";
    }
  } else if (idx !== -1) {
    // Remove key
    sortKeys.splice(idx, 1);
  } else {
    // Add key (1st click for date resets direction)
    if (key === "date") {
      dateDir = 1;
      dateFlipped = false;
      document.getElementById("sort-date-dir").textContent = "↑";
    }
    sortKeys.push(key);
  }
  updateSortUI();
  applySort();
  renderQueue();
}

function updateSortUI() {
  ["artist", "album", "date"].forEach((key) => {
    const btn = document.getElementById(`sort-${key}`);
    if (!btn) return;
    btn.classList.toggle("active", sortKeys.includes(key));
    if (key !== "date") return;
    const dir = document.getElementById("sort-date-dir");
    if (dir) dir.style.display = sortKeys.includes("date") ? "" : "none";
  });
  // Show priority badges on pills when more than one active
  document.querySelectorAll(".sort-pill").forEach((btn) => {
    btn.querySelector(".sort-priority")?.remove();
    const key = btn.dataset.key;
    const pos = sortKeys.indexOf(key);
    if (pos !== -1 && sortKeys.length > 1) {
      const badge = document.createElement("span");
      badge.className = "sort-priority";
      badge.textContent = pos + 1;
      btn.appendChild(badge);
    }
  });
}

// RENDER QUEUE
let searchQuery = "";
function renderQueue() {
  window.auraLibraryRender?.(libraryState);
  [btnPlay, btnPrev, btnNext, btnShuffle, btnRepeat].forEach(
    (button) => (button.disabled = !queue.size),
  );
  document
    .querySelectorAll("[data-fullscreen-action]")
    .forEach((button) => (button.disabled = !queue.size));
  window.auraQueueRender?.({
    nodes: queue.toArray().map((n) => ({ id: n.id, song: n.song })),
    current: state.currentNode?.id || null,
    playing: state.isPlaying,
    shuffle: state.shuffle,
    repeat: state.repeat,
    query: searchQuery,
    sortKeys: [...sortKeys],
    dateDir,
  });
  document
    .querySelector("[data-fullscreen-action=shuffle]")
    ?.classList.toggle("active", state.shuffle);
  const fullRepeat = document.querySelector("[data-fullscreen-action=repeat]");
  fullRepeat?.classList.toggle("active", state.repeat > 0);
  if (fullRepeat) fullRepeat.dataset.repeat = String(state.repeat);
  fullRepeat?.setAttribute(
    "aria-label",
    ["Repeat off", "Repeat all", "Repeat one"][state.repeat],
  );
  scheduleSessionSave();
}

let libraryState = { songs: [], folders: [], files: [] };
let libraryTab = "songs";
let librarySearch = "";
let libraryReturnFocus = null;

function applyLibraryPayload(payload) {
  libraryState = {
    songs: Array.isArray(payload?.songs) ? payload.songs : [],
    folders: Array.isArray(payload?.folders) ? payload.folders : [],
    files: Array.isArray(payload?.files) ? payload.files : [],
  };
  replaceQueueWithSongs(libraryState.songs);
  renderLibraryManager();
}

function setLibraryModal(open) {
  if (!libraryModal) return;
  if (open && !libraryModal.classList.contains("open")) {
    libraryReturnFocus = document.activeElement;
    setSettingsPopover(false);
    setAudioPanel(false);
  }
  libraryModal.classList.toggle("open", open);
  libraryModal.setAttribute("aria-hidden", open ? "false" : "true");
  if (open) {
    librarySearchInput.value = librarySearch;
    setTimeout(() => librarySearchInput?.focus(), 80);
  } else if (libraryModal.contains(document.activeElement)) {
    if (libraryReturnFocus?.isConnected) libraryReturnFocus.focus();
    else
      document
        .querySelector('[aria-label="Library and queue actions"]')
        ?.focus();
  }
}

async function openLibraryManager() {
  setLibraryModal(true);
  try {
    const payload = await window.electronAPI.getLibrary();
    libraryState = {
      songs: Array.isArray(payload?.songs) ? payload.songs : [],
      folders: Array.isArray(payload?.folders) ? payload.folders : [],
      files: Array.isArray(payload?.files) ? payload.files : [],
    };
    renderLibraryManager();
  } catch (e) {
    console.error(e);
    notify(e?.message || "Something went wrong. Please try again.");
  }
}

function setLibraryTab(tab) {
  libraryTab = tab;
  window.dispatchEvent(new CustomEvent("aura-source-tab", { detail: tab }));
  document
    .querySelectorAll(".library-tab")
    .forEach((btn) => btn.classList.toggle("active", btn.dataset.tab === tab));
  renderLibraryManager();
}

function renderLibraryManager() {
  window.auraLibraryRender?.(libraryState);
}

// LIBRARY LOADING
async function initLibrary() {
  showLoading("Loading music library…");
  try {
    const payload = await window.electronAPI.scanLibrary();
    libraryState = {
      songs: Array.isArray(payload?.songs) ? payload.songs : [],
      folders: Array.isArray(payload?.folders) ? payload.folders : [],
      files: Array.isArray(payload?.files) ? payload.files : [],
    };
    replaceQueueWithSongs(libraryState.songs);
    await restoreSession();
    hideLoading();
    console.log(
      `Loaded ${queue.size} songs from ${libraryState.folders.length} folder(s) and ${libraryState.files.length} file(s)`,
    );
  } catch (e) {
    console.error(e);
    notify(e?.message || "Something went wrong. Please try again.");
    hideLoading();
    renderQueue();
  }
}

async function doRescan() {
  showLoading("Rescanning…");
  try {
    const payload = await window.electronAPI.rescanLibrary();
    libraryState = {
      songs: Array.isArray(payload?.songs) ? payload.songs : [],
      folders: Array.isArray(payload?.folders) ? payload.folders : [],
      files: Array.isArray(payload?.files) ? payload.files : [],
    };
    replaceQueueWithSongs(libraryState.songs);
    renderLibraryManager();
    hideLoading();
  } catch (e) {
    console.error(e);
    notify(e?.message || "Something went wrong. Please try again.");
    hideLoading();
  }
}

function replaceQueueWithSongs(songs) {
  const oldNodes = queue.toArray();
  const currentPath = state.currentNode?.song?.filePath;
  const songByPath = new Map();
  (songs || []).forEach((song) => {
    const key = song.filePath;
    if (key && !songByPath.has(key)) songByPath.set(key, song);
  });
  const incomingPaths = [...songByPath.keys()];

  if (state.shuffle) {
    const oldById = new Map(oldNodes.map((node) => [node.id, node]));
    const pathForId = (id) => oldById.get(id)?.song.filePath;
    const uniqueExisting = (paths) => [
      ...new Set(paths.filter((path) => songByPath.has(path))),
    ];
    const originalPaths = uniqueExisting(
      shuffleState.originalOrder.map(pathForId),
    );
    const visiblePaths = uniqueExisting(
      oldNodes.map((node) => node.song.filePath),
    );
    const historyPaths = shuffleState.history.map((node) => node.song.filePath);
    const remainingPaths = [...shuffleState.remaining].map(pathForId);

    // New library entries become upcoming tracks, and removed entries simply
    // disappear from every shuffle structure.
    incomingPaths.forEach((path) => {
      if (!originalPaths.includes(path)) originalPaths.push(path);
      if (!visiblePaths.includes(path)) visiblePaths.push(path);
    });

    const newNodes = new Map();
    _origSeed = 0;
    queue.clear();
    visiblePaths.forEach((path) => {
      const song = songByPath.get(path);
      stampOrig(song);
      newNodes.set(path, queue.push(song));
    });

    const current = newNodes.get(currentPath) || queue.head;
    state.currentNode = current || null;
    shuffleState.originalOrder = originalPaths
      .map((path) => newNodes.get(path)?.id)
      .filter(Boolean);
    shuffleState.history = historyPaths
      .map((path) => newNodes.get(path))
      .filter(Boolean);
    shuffleState.historyIndex = shuffleState.history.lastIndexOf(current);
    if (shuffleState.historyIndex < 0 && current) {
      shuffleState.history = [current];
      shuffleState.historyIndex = 0;
    }
    shuffleState.remaining = new Set(
      remainingPaths.map((path) => newNodes.get(path)?.id).filter(Boolean),
    );
    incomingPaths.forEach((path) => {
      const node = newNodes.get(path);
      if (node && node !== current && !shuffleState.history.includes(node))
        shuffleState.remaining.add(node.id);
    });
  } else {
    queue.clear();
    state.currentNode = null;
    _origSeed = 0;
    (songs || []).forEach((song) => {
      if (!song.filePath || songByPath.get(song.filePath) !== song) return;
      stampOrig(song);
      queue.push(song);
    });
    if (currentPath)
      state.currentNode =
        queue.toArray().find((node) => node.song.filePath === currentPath) ||
        null;
  }

  renderQueue();
  if (!queue.size) {
    audio.pause();
    audio.src = "";
    state.isPlaying = false;
    songTitle.textContent = "No track selected";
    songArtist.textContent = "Choose music from your library.";
    songAlbum.textContent = "";
    setCover(null);
    coverWrap.classList.remove("has-song");
    resetLyricsOverlay();
    updatePlayBtn();
    seekFill.style.width = "0%";
    seekThumb.style.left = "0%";
    timeCur.textContent = "0:00";
    timeTot.textContent = "0:00";
    fullscreenSeekFill.style.width = "0%";
    fullscreenSeekThumb.style.left = "0%";
    fullscreenTimeCurrent.textContent = "0:00";
    fullscreenTimeTotal.textContent = "0:00";
    syncFullscreenTrack();
    return;
  }
  if (!state.currentNode && queue.head) loadNode(queue.head, false);
}

async function addFiles() {
  showLoading("Scanning files…");
  try {
    const payload = await window.electronAPI.openAndScan();
    applyLibraryPayload(payload);
  } catch (e) {
    console.error(e);
    notify(e?.message || "Something went wrong. Please try again.");
  }
  hideLoading();
}
async function addFolder() {
  showLoading("Scanning folder…");
  try {
    const payload = await window.electronAPI.openFolder();
    applyLibraryPayload(payload);
  } catch (e) {
    console.error(e);
    notify(e?.message || "Something went wrong. Please try again.");
  }
  hideLoading();
}

// File drop onto window
document.addEventListener("dragover", (e) => {
  if (e.dataTransfer.types.includes("Files")) {
    e.preventDefault();
    e.stopPropagation();
  }
});
document.addEventListener("drop", async (e) => {
  if (!e.dataTransfer.files.length) return;
  e.preventDefault();
  const paths = [...e.dataTransfer.files]
    .map((f) => window.electronAPI?.getPathForFile(f))
    .filter(Boolean);
  if (!paths.length) return;
  showLoading(`Scanning ${paths.length} file${paths.length > 1 ? "s" : ""}…`);
  try {
    const payload = await window.electronAPI.addPaths(paths);
    applyLibraryPayload(payload);
  } catch (e) {
    console.error(e);
    notify(e?.message || "Something went wrong. Please try again.");
  }
  hideLoading();
});

// CONTROLS
btnPlay.addEventListener("click", async () => {
  if (!queue.size) return;
  if (!state.currentNode) {
    await loadNode(queue.head, true);
    return;
  }

  if (state.isPlaying) {
    audio.pause();
    state.isPlaying = false;
  } else {
    try {
      await audio.play();
      state.isPlaying = true;
      triggerRipple();
    } catch {}
  }

  updatePlayBtn();
  updateQueuePlayingState();
  if (state.isPlaying) resetAutoFullscreenTimer();
  else clearAutoFullscreenTimer();
});

btnPrev.addEventListener("click", () => {
  playPrevious(state.isPlaying);
});
btnNext.addEventListener("click", () => {
  playNext(state.isPlaying);
});
btnShuffle.addEventListener("click", () => {
  if (state.shuffle) disableShuffle();
  else enableShuffle();
  btnShuffle.classList.toggle("active", state.shuffle);
  btnShuffle.title = state.shuffle ? "Disable shuffle" : "Enable shuffle";
});
btnShuffle.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  if (!state.shuffle) return;
  reshuffleUpcoming();
  btnShuffle.classList.add("active");
});
btnRepeat.addEventListener("click", () => {
  state.repeat = (state.repeat + 1) % 3;
  btnRepeat.classList.toggle("active", state.repeat > 0);
  iconRepAll.style.display = state.repeat === 2 ? "none" : "block";
  iconRepOne.style.display = state.repeat === 2 ? "block" : "none";
  btnRepeat.title = ["Repeat off", "Repeat all", "Repeat one"][state.repeat];
  renderQueue();
});

function seekTo(e) {
  if (!audio.duration) return;
  const r = seekTrack.getBoundingClientRect();
  const p = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
  audio.currentTime = p * audio.duration;
  timeCur.textContent = fullscreenTimeCurrent.textContent = fmtTime(
    audio.currentTime,
  );
  updateLyricsOverlay(audio.currentTime);
  seekFill.style.width = p * 100 + "%";
  seekThumb.style.left = p * 100 + "%";
  fullscreenSeekFill.style.width = p * 100 + "%";
  fullscreenSeekThumb.style.left = p * 100 + "%";
}
seekTrack.addEventListener("mousedown", (e) => {
  if (e.button !== 0) return;
  state.seeking = true;
  seekTo(e);
  const up = () => {
    state.seeking = false;
    window.removeEventListener("mousemove", seekTo);
    window.removeEventListener("mouseup", up);
  };
  window.addEventListener("mousemove", seekTo);
  window.addEventListener("mouseup", up);
});
fullscreenSeekTrack.addEventListener("mousedown", (e) => {
  if (e.button !== 0) return;
  state.seeking = true;
  const seekFromFullscreen = (event) => {
    if (!audio.duration) return;
    const r = fullscreenSeekTrack.getBoundingClientRect();
    const p = Math.max(0, Math.min(1, (event.clientX - r.left) / r.width));
    audio.currentTime = p * audio.duration;
    timeCur.textContent = fullscreenTimeCurrent.textContent = fmtTime(
      audio.currentTime,
    );
    updateLyricsOverlay(audio.currentTime);
    seekFill.style.width = fullscreenSeekFill.style.width = `${p * 100}%`;
    seekThumb.style.left = fullscreenSeekThumb.style.left = `${p * 100}%`;
  };
  seekFromFullscreen(e);
  const up = () => {
    state.seeking = false;
    window.removeEventListener("mousemove", seekFromFullscreen);
    window.removeEventListener("mouseup", up);
  };
  window.addEventListener("mousemove", seekFromFullscreen);
  window.addEventListener("mouseup", up);
});

function setVolFromEvent(e) {
  if (!volTrack) return;
  const r = volTrack.getBoundingClientRect();
  setVolume(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)));
}
if (volTrack) {
  volTrack.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    setVolFromEvent(e);
    const up = () => {
      window.removeEventListener("mousemove", setVolFromEvent);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", setVolFromEvent);
    window.addEventListener("mouseup", up);
  });
}
const volIcon = document.getElementById("vol-icon");
if (volIcon) {
  volIcon.addEventListener("click", () => {
    if (usesMasterVolume) {
      if (masterVolumeAvailable) window.electronAPI.toggleMasterMute();
      return;
    }
    if (state.volume > 0) {
      state._vol = state.volume;
      setVolume(0);
    } else setVolume(state._vol || 0.8);
  });
}
coverWrap?.addEventListener("dblclick", () => {
  if (state.currentNode?.song) loadLyricsForSong(state.currentNode.song, true);
});

btnAddFiles.addEventListener("click", addFiles);
btnAddFolder.addEventListener("click", addFolder);
btnRescan.addEventListener("click", doRescan);
btnLibrary?.addEventListener("click", () => {
  setLibraryTab("folders");
  openLibraryManager();
});
libraryBackdrop?.addEventListener("click", () => setLibraryModal(false));
libraryClose?.addEventListener("click", () => setLibraryModal(false));
document
  .querySelectorAll(".library-tab")
  .forEach((btn) =>
    btn.addEventListener("click", () => setLibraryTab(btn.dataset.tab)),
  );
librarySearchInput?.addEventListener("input", () => {
  librarySearch = librarySearchInput.value.trim();
  renderLibraryManager();
});
libraryAddFolderBtn?.addEventListener("click", addFolder);
libraryAddFilesBtn?.addEventListener("click", addFiles);
libraryRescanBtn?.addEventListener("click", doRescan);
libraryClearBtn?.addEventListener("click", async () => {
  if (
    !(await window.auraConfirm(
      "Remove all saved folders and loose files from AURA? Your actual music files will stay on disk.",
    ))
  )
    return;
  try {
    const payload = await window.electronAPI.clearLibrary();
    applyLibraryPayload(payload);
  } catch (e) {
    console.error(e);
    notify(e?.message || "Something went wrong. Please try again.");
  }
});
btnClear.addEventListener("click", () => {
  audio.pause();
  audio.src = "";
  state.isPlaying = false;
  state.currentNode = null;
  queue.clear();
  state.shuffle = false;
  btnShuffle.classList.remove("active");
  btnShuffle.title = "Enable shuffle";
  shuffleState.originalOrder = [];
  shuffleState.history = [];
  shuffleState.historyIndex = -1;
  shuffleState.remaining.clear();
  songTitle.textContent = "No track selected";
  songArtist.textContent = "Choose music from your library.";
  songAlbum.textContent = "";
  setCover(null);
  coverWrap.classList.remove("has-song");
  resetLyricsOverlay();
  updatePlayBtn();
  renderQueue();
  seekFill.style.width = "0%";
  seekThumb.style.left = "0%";
  timeCur.textContent = "0:00";
  timeTot.textContent = "0:00";
  fullscreenSeekFill.style.width = "0%";
  fullscreenSeekThumb.style.left = "0%";
  fullscreenTimeCurrent.textContent = "0:00";
  fullscreenTimeTotal.textContent = "0:00";
  syncFullscreenTrack();
});
qSearch.addEventListener("input", () => {
  searchQuery = qSearch.value.toLowerCase().trim();
  renderQueue();
});
document
  .getElementById("sort-artist")
  ?.addEventListener("click", () => toggleSortKey("artist"));
document
  .getElementById("sort-album")
  ?.addEventListener("click", () => toggleSortKey("album"));
document
  .getElementById("sort-date")
  ?.addEventListener("click", () => toggleSortKey("date"));
// Init: hide date direction arrow since sort is off by default
document.addEventListener("DOMContentLoaded", updateSortUI);
document
  .getElementById("btn-min")
  .addEventListener("click", () => window.electronAPI?.minimize());
document
  .getElementById("btn-close")
  .addEventListener("click", () => window.electronAPI?.close());

const PANEL_W = 450;
let queueVisible = true;
const root = document.getElementById("root");
const iconCompress = document.getElementById("icon-compress");
const iconExpand = document.getElementById("icon-expand");
const btnQueueToggle = document.getElementById("btn-queue-toggle");
const btnFloatingLyrics = document.getElementById("btn-floating-lyrics");
const btnFullscreen = document.getElementById("btn-fullscreen");
const btnExitFullscreen = document.getElementById("btn-exit-fullscreen");
const btnMaximize = document.getElementById("btn-maximize");
const iconMaximize = document.getElementById("icon-maximize");
const iconRestore = document.getElementById("icon-restore");
const btnSettings = document.getElementById("btn-settings");
const btnUpdate = document.getElementById("btn-update");
const iconUpdateDownload = document.getElementById("icon-update-download");
const iconUpdateRestart = document.getElementById("icon-update-restart");
const settingsPopover = document.getElementById("settings-popover");
const autoFullscreenOptions = document.getElementById(
  "auto-fullscreen-options",
);
const settingsVersion = document.getElementById("settings-version");
const themeOptions = document.getElementById("theme-options");
const floatingLyricsOptions = document.getElementById(
  "floating-lyrics-options",
);
const floatingLyricsClickThroughOptions = document.getElementById(
  "floating-lyrics-click-through-options",
);
const floatingLyricsScaleInput = document.getElementById(
  "floating-lyrics-scale",
);
const floatingLyricsScaleValue = document.getElementById(
  "floating-lyrics-scale-value",
);
const floatingLyricsVisibleLinesInput = document.getElementById(
  "floating-lyrics-visible-lines",
);
const floatingLyricsVisibleLinesValue = document.getElementById(
  "floating-lyrics-visible-lines-value",
);
let currentUpdateState = { status: "idle", version: null, percent: 0 };

function updateUpdateButton(nextState = {}) {
  currentUpdateState = { ...currentUpdateState, ...nextState };
  if (!btnUpdate) return;

  const { status, version, percent } = currentUpdateState;
  const visible = ["available", "downloading", "downloaded"].includes(status);
  btnUpdate.hidden = !visible;
  btnUpdate.disabled = status === "downloading";
  btnUpdate.classList.toggle("update-downloading", status === "downloading");
  btnUpdate.classList.toggle("update-ready", status === "downloaded");
  btnUpdate.style.setProperty(
    "--update-progress",
    `${Math.max(0, Math.min(100, Number(percent) || 0))}%`,
  );
  iconUpdateDownload.hidden = status === "downloaded";
  iconUpdateRestart.hidden = status !== "downloaded";

  const versionLabel = version ? `Aura v${version}` : "the latest Aura update";
  if (status === "available") {
    btnUpdate.title = `Download ${versionLabel}`;
    btnUpdate.setAttribute("aria-label", `Download ${versionLabel}`);
  } else if (status === "downloading") {
    btnUpdate.title = `Downloading ${versionLabel}: ${Math.round(Number(percent) || 0)}%`;
    btnUpdate.setAttribute("aria-label", btnUpdate.title);
  } else if (status === "downloaded") {
    btnUpdate.title = `Restart Aura to install ${versionLabel}`;
    btnUpdate.setAttribute("aria-label", btnUpdate.title);
  }
}

async function initUpdateButton() {
  try {
    const savedState = await window.electronAPI?.getUpdateState?.();
    if (savedState) updateUpdateButton(savedState);
  } catch (error) {
    console.warn("Unable to read update state", error);
  }
}

function canAutoEnterFullscreen() {
  return (
    autoFullscreenDelay > 0 &&
    state.isPlaying &&
    isWindowFocused &&
    !isFullscreenMode &&
    !isTouchMode &&
    document.getElementById("youtube-modal").hidden
  );
}

function clearAutoFullscreenTimer() {
  if (autoFullscreenTimer) clearTimeout(autoFullscreenTimer);
  autoFullscreenTimer = null;
}

function scheduleAutoFullscreen() {
  clearAutoFullscreenTimer();
  if (!canAutoEnterFullscreen()) return;
  const remaining = Math.max(
    0,
    autoFullscreenDelay - (Date.now() - lastAutoFullscreenActivity),
  );
  autoFullscreenTimer = setTimeout(() => {
    autoFullscreenTimer = null;
    if (!canAutoEnterFullscreen()) return;
    if (Date.now() - lastAutoFullscreenActivity < autoFullscreenDelay) {
      scheduleAutoFullscreen();
      return;
    }
    setFullscreenMode(true);
  }, remaining);
}

function resetAutoFullscreenTimer() {
  lastAutoFullscreenActivity = Date.now();
  scheduleAutoFullscreen();
}

function updateAutoFullscreenSetting(delay) {
  autoFullscreenDelay = AUTO_FULLSCREEN_DELAYS.has(Number(delay))
    ? Number(delay)
    : 300000;
  autoFullscreenOptions
    ?.querySelectorAll("[data-auto-fullscreen-delay]")
    .forEach((button) => {
      const selected =
        Number(button.dataset.autoFullscreenDelay) === autoFullscreenDelay;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-checked", String(selected));
    });
  resetAutoFullscreenTimer();
}

function updateTheme(theme) {
  const selectedTheme = ["midnight", "oled"].includes(theme)
    ? theme
    : "midnight";
  root.dataset.theme = selectedTheme;
  themeOptions?.querySelectorAll("[data-theme]").forEach((button) => {
    const selected = button.dataset.theme === selectedTheme;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-checked", String(selected));
  });
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

function updateFloatingLyricsSettings(settings = {}) {
  if (typeof settings.floatingLyricsEnabled === "boolean")
    floatingLyricsEnabled = settings.floatingLyricsEnabled;
  if (typeof settings.floatingLyricsClickThrough === "boolean")
    floatingLyricsClickThrough = settings.floatingLyricsClickThrough;
  if (Object.prototype.hasOwnProperty.call(settings, "floatingLyricsScale")) {
    floatingLyricsScale = normalizeFloatingLyricsScale(
      settings.floatingLyricsScale,
    );
  }
  if (
    Object.prototype.hasOwnProperty.call(
      settings,
      "floatingLyricsVisibleLineCount",
    )
  ) {
    floatingLyricsVisibleLineCount = normalizeFloatingLyricsVisibleLineCount(
      settings.floatingLyricsVisibleLineCount,
    );
  }

  floatingLyricsOptions
    ?.querySelectorAll("[data-floating-lyrics-enabled]")
    .forEach((button) => {
      const selected =
        (button.dataset.floatingLyricsEnabled === "true") ===
        floatingLyricsEnabled;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-checked", String(selected));
    });
  btnFloatingLyrics?.classList.toggle("active", floatingLyricsEnabled);
  btnFloatingLyrics?.setAttribute(
    "aria-pressed",
    String(floatingLyricsEnabled),
  );
  btnFloatingLyrics?.setAttribute(
    "aria-label",
    `${floatingLyricsEnabled ? "Disable" : "Enable"} Floating Lyrics`,
  );
  btnFloatingLyrics?.setAttribute(
    "title",
    `${floatingLyricsEnabled ? "Disable" : "Enable"} Floating Lyrics`,
  );
  floatingLyricsClickThroughOptions
    ?.querySelectorAll("[data-floating-lyrics-click-through]")
    .forEach((button) => {
      const selected =
        (button.dataset.floatingLyricsClickThrough === "true") ===
        floatingLyricsClickThrough;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-checked", String(selected));
      button.disabled = !floatingLyricsEnabled;
    });
  if (floatingLyricsScaleInput) {
    floatingLyricsScaleInput.value = String(floatingLyricsScale);
    floatingLyricsScaleInput.disabled = !floatingLyricsEnabled;
  }
  if (floatingLyricsScaleValue)
    floatingLyricsScaleValue.textContent = `${floatingLyricsScale}%`;
  if (floatingLyricsVisibleLinesInput) {
    floatingLyricsVisibleLinesInput.value = String(
      floatingLyricsVisibleLineCount,
    );
    floatingLyricsVisibleLinesInput.disabled = !floatingLyricsEnabled;
  }
  if (floatingLyricsVisibleLinesValue)
    floatingLyricsVisibleLinesValue.textContent = String(
      floatingLyricsVisibleLineCount,
    );
}

function positionPopover(panel, trigger, above = false) {
  const bounds = trigger.getBoundingClientRect();
  const width = panel.offsetWidth,
    height = panel.offsetHeight;
  panel.style.left =
    Math.max(12, Math.min(bounds.right - width, innerWidth - width - 12)) +
    "px";
  panel.style.top =
    Math.max(
      12,
      Math.min(
        above ? bounds.top - height - 10 : bounds.bottom + 10,
        innerHeight - height - 12,
      ),
    ) + "px";
  panel.style.right = "auto";
  panel.style.bottom = "auto";
}
function setSettingsPopover(open) {
  const shouldOpen = Boolean(open) && !isFullscreenMode;
  if (shouldOpen) setAudioPanel(false);
  settingsPopover?.classList.toggle("open", shouldOpen);
  settingsPopover?.setAttribute("aria-hidden", String(!shouldOpen));
  btnSettings?.setAttribute("aria-expanded", String(shouldOpen));
  if (shouldOpen) {
    positionPopover(settingsPopover, btnSettings);
    requestAnimationFrame(() =>
      settingsPopover.querySelector("button:not([hidden])")?.focus(),
    );
  } else if (settingsPopover?.contains(document.activeElement))
    btnSettings.focus();
}

async function initAutoFullscreenSetting() {
  try {
    const saved = await window.electronAPI?.getSettings?.();
    updateAutoFullscreenSetting(saved?.autoFullscreenDelay);
    updateTheme(saved?.theme);
    updateFloatingLyricsSettings(saved);
  } catch {
    updateAutoFullscreenSetting(300000);
    updateTheme("midnight");
    updateFloatingLyricsSettings();
  }
}

async function initSettingsVersion() {
  try {
    const version = await window.electronAPI?.getAppVersion?.();
    if (version) settingsVersion.textContent = `v${version}`;
  } catch {}
}

function updateMaximizeButton(isMaximized) {
  iconMaximize.style.display = isMaximized ? "none" : "block";
  iconRestore.style.display = isMaximized ? "block" : "none";
  btnMaximize.title = isMaximized ? "Restore" : "Maximize";
  btnMaximize.setAttribute("aria-label", btnMaximize.title);
}

function applyFullscreenState(enabled) {
  const wasFullscreen = isFullscreenMode;
  isFullscreenMode = enabled;
  if (!enabled && wasFullscreen) btnFullscreen.focus();
  root.classList.toggle("fullscreen-mode", enabled);
  fullscreenPlayer.setAttribute("aria-hidden", String(!enabled));
  if (enabled) setSettingsPopover(false);
  if (enabled) {
    requestAnimationFrame(() => btnExitFullscreen.focus());
    setFullscreenArtwork(state.currentNode?.song?.coverPath, false);
    syncFullscreenTrack();
    updateFullscreenLyrics(lyricsCurrent.textContent);
    fullscreenSeekFill.style.width = seekFill.style.width;
    fullscreenSeekThumb.style.left = seekThumb.style.left;
    fullscreenTimeCurrent.textContent = timeCur.textContent;
    fullscreenTimeTotal.textContent = timeTot.textContent;
    updatePlayBtn();
  }
  resetAutoFullscreenTimer();
}

function setFullscreenMode(enabled) {
  applyFullscreenState(enabled);
  window.electronAPI?.setFullscreen(enabled);
}

function setTouchMode(enabled, native = true) {
  isTouchMode = enabled;
  if (enabled) {
    if (isFullscreenMode) applyFullscreenState(false);
    setSettingsPopover(false);
    setAudioPanel(false);
  }
  root.classList.toggle("touch-mode", enabled);
  document.getElementById("btn-touch-mode").setAttribute("aria-pressed", String(enabled));
  window.dispatchEvent(new CustomEvent("touch-mode-changed", { detail: enabled }));
  if (native) window.electronAPI?.setFullscreen(enabled);
  resetAutoFullscreenTimer();
  requestAnimationFrame(() => document.getElementById(enabled ? "touch-exit" : "btn-touch-mode")?.focus());
}

function setQueueVisible(visible, animate = true) {
  queueVisible = visible;
  root.classList.toggle("queue-collapsed", !visible);
  iconCompress.style.display = visible ? "block" : "none";
  iconExpand.style.display = !visible ? "block" : "none";
  btnQueueToggle.title = visible ? "Collapse queue" : "Expand queue";
  // Resize the actual Electron window
  const targetW = visible ? 1120 : PANEL_W;
  window.electronAPI?.setWidth(targetW);
}

// Keyboard-accessible secondary controls and isolated UI concerns.
const audioPopover = document.getElementById("audio-popover");
const audioSettingsButton = document.getElementById("btn-eq");
function setAudioPanel(open) {
  if (open) setSettingsPopover(false);
  audioPopover.classList.toggle("open", open);
  audioPopover.setAttribute("aria-hidden", String(!open));
  audioSettingsButton.setAttribute("aria-expanded", String(open));
  if (!open && audioPopover.contains(document.activeElement))
    audioSettingsButton.focus();
  if (open) {
    positionPopover(audioPopover, audioSettingsButton, true);
    audioPopover.querySelector(".eq-slider-wrap")?.focus();
    requestAnimationFrame(() =>
      document
        .querySelectorAll(".eq-band")
        .forEach((band, i) =>
          updateBandUI(band.querySelector(".eq-slider-wrap"), eqValues[i]),
        ),
    );
  }
}
audioSettingsButton.addEventListener("click", () =>
  setAudioPanel(!audioPopover.classList.contains("open")),
);
document.addEventListener("pointerdown", (e) => {
  if (
    !audioPopover.contains(e.target) &&
    !audioSettingsButton.contains(e.target)
  )
    setAudioPanel(false);
});
document.addEventListener("keydown", (e) => {
  if (e.code === "Escape") setAudioPanel(false);
});
volTrack.addEventListener("keydown", (e) => {
  if (
    ["ArrowLeft", "ArrowDown", "ArrowRight", "ArrowUp", "Home", "End"].includes(
      e.key,
    )
  ) {
    e.preventDefault();
    setVolume(
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? 1
          : state.volume +
            (["ArrowLeft", "ArrowDown"].includes(e.key) ? -0.05 : 0.05),
    );
  }
});
[seekTrack, fullscreenSeekTrack].forEach((track) =>
  track.addEventListener("keydown", (e) => {
    if (!audio.duration) return;
    if (
      [
        "ArrowLeft",
        "ArrowDown",
        "ArrowRight",
        "ArrowUp",
        "Home",
        "End",
      ].includes(e.key)
    ) {
      e.preventDefault();
      audio.currentTime =
        e.key === "Home"
          ? 0
          : e.key === "End"
            ? audio.duration
            : Math.max(
                0,
                Math.min(
                  audio.duration,
                  audio.currentTime +
                    (["ArrowLeft", "ArrowDown"].includes(e.key) ? -5 : 5),
                ),
              );
      updateSeek();
    }
  }),
);
audio.addEventListener("timeupdate", () => {
  const progress = audio.duration
    ? (audio.currentTime / audio.duration) * 100
    : 0;
  [seekTrack, fullscreenSeekTrack].forEach((track) => {
    track.setAttribute("aria-valuenow", String(Math.round(progress)));
    track.setAttribute(
      "aria-valuetext",
      `${fmtTime(audio.currentTime)} of ${fmtTime(audio.duration)}`,
    );
  });
});
audio.addEventListener("pause", scheduleSessionSave);
setInterval(() => {
  if (state.isPlaying) saveSession();
}, 10000);
window.addEventListener("beforeunload", saveSession);

btnQueueToggle.addEventListener("click", () => setQueueVisible(!queueVisible));

// AUDIO EVENTS
audio.addEventListener("timeupdate", updateSeek);
audio.addEventListener("seeked", () => updateLyricsOverlay(audio.currentTime));
audio.addEventListener("loadedmetadata", () => {
  timeTot.textContent = fmtTime(audio.duration);
  fullscreenTimeTotal.textContent = fmtTime(audio.duration);
});
audio.addEventListener("play", () =>
  window.electronAPI?.updateFloatingLyricsPlayback?.(true),
);
audio.addEventListener("pause", () =>
  window.electronAPI?.updateFloatingLyricsPlayback?.(false),
);
audio.addEventListener("ended", () => {
  if (state.repeat === 2) {
    audio.currentTime = 0;
    audio.play();
    return;
  }

  if (playNext(true)) {
    // Playback advances through the established queue order without rearranging it.
  } else {
    state.isPlaying = false;
    clearAutoFullscreenTimer();
    updatePlayBtn();
    updateQueuePlayingState();
  }
});
audio.addEventListener("error", (e) => {
  console.warn(e);
  const n = getNextNode();
  if (n && n !== state.currentNode) playNext(state.isPlaying);
});

// KEYBOARD
document.addEventListener("keydown", (e) => {
  if (e.defaultPrevented || document.querySelector(".context-menu")) return;
  if (e.code === "Escape" && isTouchMode) {
    e.preventDefault();
    setTouchMode(false);
    return;
  }
  if (!document.getElementById("youtube-modal").hidden) return;
  if (e.code === "Escape" && isFullscreenMode) {
    e.preventDefault();
    setFullscreenMode(false);
    return;
  }
  if (e.code === "Escape" && settingsPopover?.classList.contains("open")) {
    e.preventDefault();
    setSettingsPopover(false);
    return;
  }
  if (e.code === "Escape" && libraryModal?.classList.contains("open")) {
    setLibraryModal(false);
    return;
  }
  if (
    e.target.closest(
      "input,select,textarea,[contenteditable=true],[role=slider]",
    )
  )
    return;
  if (e.target.closest("button") && ["Space", "Enter"].includes(e.code)) return;
  if (isTouchMode && touchSource === "windows") {
    const actions = { Space: "toggle", ArrowRight: e.altKey ? "next" : "seek-relative", ArrowLeft: e.altKey ? "previous" : "seek-relative", KeyS: "shuffle", KeyR: "repeat" };
    if (actions[e.code]) {
      e.preventDefault();
      window.dispatchEvent(new CustomEvent("touch-remote-action", { detail: { action: actions[e.code], delta: e.code === "ArrowLeft" ? -5 : 5 } }));
      return;
    }
  }
  switch (e.code) {
    case "Space":
      e.preventDefault();
      btnPlay.click();
      break;
    case "ArrowRight":
      e.altKey
        ? btnNext.click()
        : audio.duration &&
          (audio.currentTime = Math.min(audio.duration, audio.currentTime + 5));
      break;
    case "ArrowLeft":
      e.altKey
        ? btnPrev.click()
        : audio.duration &&
          (audio.currentTime = Math.max(0, audio.currentTime - 5));
      break;
    case "ArrowUp":
      e.preventDefault();
      setVolume(state.volume + 0.05);
      break;
    case "ArrowDown":
      e.preventDefault();
      setVolume(state.volume - 0.05);
      break;
    case "KeyS":
      if (e.shiftKey && state.shuffle) reshuffleUpcoming();
      else btnShuffle.click();
      break;
    case "KeyR":
      btnRepeat.click();
      break;
  }
});

// EQUALIZER  (unchanged)
const EQ_FREQS = ["60", "250", "1k", "4k", "12k"].map(
  (_, i) => [60, 250, 1000, 4000, 12000][i],
);
const EQ_TYPES = ["lowshelf", "peaking", "peaking", "peaking", "highshelf"];
const EQ_MIN = -12,
  EQ_MAX = 12;
let eqFilters = [],
  eqEnabled = true,
  eqConnected = false;
const eqValues = [0, 0, 0, 0, 0];
const equalizerEngine = new window.AuraDomain.EqualizerEngine(audio);
function initEQ() {
  if (eqConnected) return;
  const engine = equalizerEngine.initialize(eqValues, eqEnabled);
  state.acx = engine.context;
  eqFilters = engine.filters;
  eqConnected = true;
}
function applyEQBand(i, g) {
  eqValues[i] = g;
  scheduleSessionSave();
  if (!eqConnected) initEQ();
  if (eqFilters[i]) eqFilters[i].gain.value = eqEnabled ? g : 0;
}
function setEQEnabled(on) {
  eqEnabled = on;
  scheduleSessionSave();
  if (eqConnected)
    eqFilters.forEach((f, i) => {
      f.gain.value = on ? eqValues[i] : 0;
    });
  document.getElementById("eq-panel").classList.toggle("eq-disabled", !on);
}
function updateBandUI(wrap, g) {
  wrap.setAttribute("aria-valuenow", g);
  wrap.closest(".eq-band").querySelector(".eq-value").textContent = g + " dB";
  const handle = wrap.querySelector(".eq-handle"),
    fill = wrap.querySelector(".eq-track-fill");
  const trackH = wrap.clientHeight - 8,
    pct = (EQ_MAX - g) / (EQ_MAX - EQ_MIN);
  const handleH = handle.offsetHeight || 36,
    usable = trackH - handleH;
  handle.style.top = 4 + pct * usable + "px";
  const pos = (1 - pct) * 100;
  if (pos >= 50) {
    fill.style.bottom = "50%";
    fill.style.top = 100 - pos + "%";
  } else {
    fill.style.bottom = pos + "%";
    fill.style.top = "50%";
  }
}
function setupEQ() {
  audio.addEventListener(
    "play",
    () => {
      if (!eqConnected) initEQ();
    },
    { once: true },
  );
  const bands = document.querySelectorAll(".eq-band");
  bands.forEach((band, i) => {
    const wrap = band.querySelector(".eq-slider-wrap");
    requestAnimationFrame(() => updateBandUI(wrap, 0));
    let dragging = false,
      startY = 0,
      startGain = 0;
    wrap.addEventListener("mousedown", (e) => {
      e.preventDefault();
      dragging = true;
      startY = e.clientY;
      startGain = eqValues[i];
      wrap.classList.add("dragging");
      if (!eqConnected) initEQ();
      const onMove = (e) => {
        if (!dragging) return;
        const usable = wrap.clientHeight - 8 - 36;
        const delta = (e.clientY - startY) / (usable / (EQ_MAX - EQ_MIN));
        applyEQBand(
          i,
          Math.max(
            EQ_MIN,
            Math.min(EQ_MAX, Math.round((startGain - delta) * 2) / 2),
          ),
        );
        updateBandUI(wrap, eqValues[i]);
      };
      const onUp = () => {
        dragging = false;
        wrap.classList.remove("dragging");
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    });
    wrap.addEventListener("keydown", (e) => {
      if (
        [
          "ArrowUp",
          "ArrowRight",
          "ArrowDown",
          "ArrowLeft",
          "Home",
          "End",
        ].includes(e.key)
      ) {
        e.preventDefault();
        const gain =
          e.key === "Home"
            ? 0
            : e.key === "End"
              ? 12
              : Math.max(
                  -12,
                  Math.min(
                    12,
                    eqValues[i] +
                      (["ArrowUp", "ArrowRight"].includes(e.key) ? 0.5 : -0.5),
                  ),
                );
        applyEQBand(i, gain);
        updateBandUI(wrap, gain);
      }
    });
    wrap.addEventListener("dblclick", () => {
      applyEQBand(i, 0);
      updateBandUI(wrap, 0);
    });
  });
  document
    .getElementById("eq-toggle")
    .addEventListener("change", (e) => setEQEnabled(e.target.checked));
  document.getElementById("eq-reset").addEventListener("click", () => {
    bands.forEach((band, i) => {
      applyEQBand(i, 0);
      updateBandUI(band.querySelector(".eq-slider-wrap"), 0);
    });
  });
  window.addEventListener("resize", () => {
    bands.forEach((band, i) =>
      updateBandUI(band.querySelector(".eq-slider-wrap"), eqValues[i]),
    );
  });
}
setupEQ();

// INIT
window.aura = {
  setTouchSource(source) {
    touchSource = source === "windows" ? "windows" : "native";
    if (touchSource === "windows" && state.isPlaying) btnPlay.click();
  },
  getVolume: () => ({ volume: state.volume, muted: !!state.muted, available: masterVolumeAvailable, master: usesMasterVolume }),
  touchMode: setTouchMode,
  touchSeek(seconds) {
    if (Number.isFinite(audio.duration) && Number.isFinite(seconds)) {
      audio.currentTime = Math.max(0, Math.min(audio.duration, seconds));
      updateSeek();
    }
  },
  touchVolume: setVolume,
  closePanels() {
    setSettingsPopover(false);
    setAudioPanel(false);
  },
  applyLibrary: applyLibraryPayload,
  libraryTrack(path, action) {
    const song = libraryState.songs.find((song) => song.filePath === path);
    if (!song) return;
    addDownloadedSong(song, libraryState, action === "next");
    const node = queue.toArray().find((node) => node.song.filePath === path);
    if (action === "play") playSpecificNode(node, true);
    else
      notify(
        action === "next"
          ? "Playing next: " + song.title
          : "Added to queue: " + song.title,
      );
  },
  library(tab = "songs") {
    setLibraryTab(tab);
    openLibraryManager();
  },
  play(id) {
    const node = queue.map[id];
    if (node) playSpecificNode(node, true);
  },
  next(id) {
    queueNodeNext(queue.map[id]);
    renderQueue();
  },
  remove(id) {
    if (queue.map[id]) removeNode(queue.map[id]);
  },
  move(id, target) {
    const node = queue.map[id];
    if (!node) return;
    if (target && queue.map[target]) queue.moveBefore(node, queue.map[target]);
    else queue.moveToEnd(node);
    renderQueue();
  },
  search(query) {
    searchQuery = query;
    renderQueue();
  },
};
if (usesMasterVolume) {
  applyVolume(0);
  window.addEventListener("master-volume-changed", event => receiveMasterVolume(event.detail));
  window.electronAPI.getMasterVolume().then(receiveMasterVolume).catch(() => receiveMasterVolume({ available: false }));
} else setVolume(0.8);
renderQueue();
updateSortUI();
if (window.electronAPI) void initAutoFullscreenSetting().finally(initLibrary);
else {
  hideLoading();
  console.warn("No electronAPI");
}
window.addEventListener("media-play-pause", () => { if (!(isTouchMode && touchSource === "windows")) btnPlay.click(); });
window.addEventListener("media-next", () => { if (!(isTouchMode && touchSource === "windows")) btnNext.click(); });
window.addEventListener("media-prev", () => { if (!(isTouchMode && touchSource === "windows")) btnPrev.click(); });
window.addEventListener("floating-lyrics-control", (event) => {
  ({ previous: btnPrev, "play-pause": btnPlay, next: btnNext })[
    event.detail
  ]?.click();
});
window.addEventListener("update-state", (event) =>
  updateUpdateButton(event.detail),
);
window.addEventListener("window-focus-changed", (event) => {
  isWindowFocused = Boolean(event.detail);
  updatePlayBtn();
  resetAutoFullscreenTimer();
});
btnFullscreen.addEventListener("click", () => setFullscreenMode(true));
btnExitFullscreen.addEventListener("click", () => setFullscreenMode(false));
btnUpdate?.addEventListener("click", async () => {
  try {
    if (currentUpdateState.status === "available") {
      const nextState = await window.electronAPI?.downloadUpdate?.();
      if (nextState) updateUpdateButton(nextState);
    } else if (currentUpdateState.status === "downloaded") {
      await window.electronAPI?.installUpdate?.();
    }
  } catch (error) {
    console.warn("Unable to apply update action", error);
  }
});
btnFloatingLyrics?.addEventListener("click", async () => {
  const enabled = !floatingLyricsEnabled;
  updateFloatingLyricsSettings({ floatingLyricsEnabled: enabled });
  try {
    const saved = await window.electronAPI?.saveSettings?.({
      floatingLyricsEnabled: enabled,
    });
    if (saved) updateFloatingLyricsSettings(saved);
  } catch (error) {
    console.warn("Unable to save floating lyrics setting", error);
  }
});
btnSettings?.addEventListener("click", (event) => {
  event.stopPropagation();
  setSettingsPopover(!settingsPopover?.classList.contains("open"));
});
autoFullscreenOptions?.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-auto-fullscreen-delay]");
  if (!button) return;
  const delay = Number(button.dataset.autoFullscreenDelay);
  updateAutoFullscreenSetting(delay);
  try {
    const saved = await window.electronAPI?.saveSettings?.({
      autoFullscreenDelay: delay,
    });
    if (saved) updateAutoFullscreenSetting(saved.autoFullscreenDelay);
  } catch (error) {
    console.warn("Unable to save settings", error);
  }
});
themeOptions?.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-theme]");
  if (!button) return;
  const theme = button.dataset.theme;
  updateTheme(theme);
  try {
    const saved = await window.electronAPI?.saveSettings?.({ theme });
    if (saved) updateTheme(saved.theme);
  } catch (error) {
    console.warn("Unable to save theme", error);
  }
});
floatingLyricsOptions?.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-floating-lyrics-enabled]");
  if (!button) return;
  const enabled = button.dataset.floatingLyricsEnabled === "true";
  updateFloatingLyricsSettings({ floatingLyricsEnabled: enabled });
  try {
    const saved = await window.electronAPI?.saveSettings?.({
      floatingLyricsEnabled: enabled,
    });
    if (saved) updateFloatingLyricsSettings(saved);
  } catch (error) {
    console.warn("Unable to save floating lyrics setting", error);
  }
});
floatingLyricsClickThroughOptions?.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-floating-lyrics-click-through]");
  if (!button || !floatingLyricsEnabled) return;
  const clickThrough = button.dataset.floatingLyricsClickThrough === "true";
  updateFloatingLyricsSettings({ floatingLyricsClickThrough: clickThrough });
  try {
    const saved = await window.electronAPI?.saveSettings?.({
      floatingLyricsClickThrough: clickThrough,
    });
    if (saved) updateFloatingLyricsSettings(saved);
  } catch (error) {
    console.warn("Unable to save click-through setting", error);
  }
});
floatingLyricsScaleInput?.addEventListener("input", () => {
  const scale = normalizeFloatingLyricsScale(floatingLyricsScaleInput.value);
  updateFloatingLyricsSettings({ floatingLyricsScale: scale });
  window.electronAPI?.setFloatingLyricsScale?.(scale);
});
floatingLyricsScaleInput?.addEventListener("change", async () => {
  const scale = normalizeFloatingLyricsScale(floatingLyricsScaleInput.value);
  try {
    const saved = await window.electronAPI?.saveSettings?.({
      floatingLyricsScale: scale,
    });
    if (saved) updateFloatingLyricsSettings(saved);
  } catch (error) {
    console.warn("Unable to save floating lyrics scale", error);
  }
});
floatingLyricsVisibleLinesInput?.addEventListener("input", () => {
  const lineCount = normalizeFloatingLyricsVisibleLineCount(
    floatingLyricsVisibleLinesInput.value,
  );
  updateFloatingLyricsSettings({ floatingLyricsVisibleLineCount: lineCount });
  window.electronAPI?.setFloatingLyricsVisibleLineCount?.(lineCount);
});
floatingLyricsVisibleLinesInput?.addEventListener("change", async () => {
  const lineCount = normalizeFloatingLyricsVisibleLineCount(
    floatingLyricsVisibleLinesInput.value,
  );
  try {
    const saved = await window.electronAPI?.saveSettings?.({
      floatingLyricsVisibleLineCount: lineCount,
    });
    if (saved) updateFloatingLyricsSettings(saved);
  } catch (error) {
    console.warn("Unable to save floating lyrics visible lines", error);
  }
});
document.addEventListener(
  "pointerdown",
  (event) => {
    if (
      settingsPopover?.classList.contains("open") &&
      !settingsPopover.contains(event.target) &&
      !btnSettings?.contains(event.target)
    ) {
      setSettingsPopover(false);
    }
    resetAutoFullscreenTimer();
  },
  true,
);
document.addEventListener("keydown", () => resetAutoFullscreenTimer(), true);
document.addEventListener("wheel", () => resetAutoFullscreenTimer(), {
  capture: true,
  passive: true,
});
document.addEventListener("input", () => resetAutoFullscreenTimer(), true);
let lastAutoFullscreenMousemove = 0;
document.addEventListener(
  "mousemove",
  () => {
    const now = Date.now();
    if (now - lastAutoFullscreenMousemove < 1000) return;
    lastAutoFullscreenMousemove = now;
    resetAutoFullscreenTimer();
  },
  { passive: true },
);
initSettingsVersion();
initUpdateButton();
document.querySelectorAll("[data-fullscreen-action]").forEach((button) =>
  button.addEventListener("click", () => {
    ({
      shuffle: btnShuffle,
      prev: btnPrev,
      play: btnPlay,
      next: btnNext,
      repeat: btnRepeat,
    })[button.dataset.fullscreenAction]?.click();
  }),
);
window.addEventListener("fullscreen-changed", (event) => {
  if (isTouchMode) {
    if (!event.detail) setTouchMode(false, false);
  } else applyFullscreenState(Boolean(event.detail));
});
btnMaximize.addEventListener("click", () =>
  window.electronAPI?.toggleMaximize(),
);
window.addEventListener("window-maximized-changed", (event) =>
  updateMaximizeButton(Boolean(event.detail)),
);

// Keep keyboard focus inside the visible secondary surface.
document.addEventListener("keydown", (event) => {
  if (event.key !== "Tab" || event.defaultPrevented) return;
  const container =
    document.querySelector(".confirmation-card") ||
    (!document.getElementById("youtube-modal").hidden
      ? document.getElementById("youtube-dialog")
      : null) ||
    (libraryModal.classList.contains("open")
      ? document.getElementById("library-dialog")
      : null) ||
    (settingsPopover.classList.contains("open") ? settingsPopover : null) ||
    (audioPopover.classList.contains("open") ? audioPopover : null);
  if (!container) return;
  const focusable = [
    ...container.querySelectorAll(
      'button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]',
    ),
  ].filter((el) => el.getClientRects().length);
  if (!focusable.length) return;
  const first = focusable[0],
    last = focusable[focusable.length - 1];
  if (
    event.shiftKey &&
    (document.activeElement === first ||
      !container.contains(document.activeElement))
  ) {
    event.preventDefault();
    last.focus();
  } else if (
    !event.shiftKey &&
    (document.activeElement === last ||
      !container.contains(document.activeElement))
  ) {
    event.preventDefault();
    first.focus();
  }
});

window.addEventListener("resize", () => {
  if (settingsPopover.classList.contains("open"))
    positionPopover(settingsPopover, btnSettings);
  if (audioPopover.classList.contains("open"))
    positionPopover(audioPopover, audioSettingsButton, true);
});
