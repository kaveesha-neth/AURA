'use strict';

// ═══════════════════════════════════════════════════════════════════════════════
// DOUBLY LINKED LIST  +  ID MAP
// ═══════════════════════════════════════════════════════════════════════════════
class MusicQueue {
  constructor() {
    this.head = null; this.tail = null; this.size = 0;
    this.map  = {};   this._seed = 0;
  }
  _node(song) { return { song, id:`n${++this._seed}`, prev:null, next:null }; }

  push(song) {
    const node = this._node(song);
    if (!this.tail) { this.head = this.tail = node; }
    else { node.prev = this.tail; this.tail.next = node; this.tail = node; }
    this.map[node.id] = node; this.size++; return node;
  }

  // Detach a node (keeps it in map, doesn't destroy)
  detach(node) {
    if (node.prev) node.prev.next = node.next; else this.head = node.next;
    if (node.next) node.next.prev = node.prev; else this.tail = node.prev;
    node.prev = null; node.next = null; this.size--;
  }

  // Full remove
  remove(node) { this.detach(node); delete this.map[node.id]; }

  // Insert node right after anchor
  insertAfter(anchor, node) {
    const after = anchor.next;
    node.prev = anchor; node.next = after;
    anchor.next = node;
    if (after) after.prev = node; else this.tail = node;
    this.map[node.id] = node; this.size++;
  }

  // Insert node right before target
  insertBefore(target, node) {
    const before = target.prev;
    node.next = target; node.prev = before;
    target.prev = node;
    if (before) before.next = node; else this.head = node;
    this.map[node.id] = node; this.size++;
  }

  // Append to end
  appendNode(node) {
    node.prev = this.tail; node.next = null;
    if (this.tail) this.tail.next = node; else this.head = node;
    this.tail = node; this.map[node.id] = node; this.size++;
  }

  // Move node before target  (O(1) pointer surgery)
  moveBefore(node, target) {
    if (node === target) return;
    this.detach(node);
    this.insertBefore(target, node);
  }

  // Move node to end  (O(1))
  moveToEnd(node) {
    if (node === this.tail) return;
    this.detach(node);
    this.appendNode(node);
  }

  toArray() {
    const a = []; let c = this.head; while(c){ a.push(c); c=c.next; } return a;
  }

  clear() { this.head=this.tail=null; this.map={}; this.size=0; }
}

// ═══════════════════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════════════════
const queue = new MusicQueue();
let isWindowFocused = document.hasFocus();
let isFullscreenMode = false;
let fullscreenLyricIndex = -1;
const state = {
  currentNode: null,
  isPlaying:   false,
  shuffle:     false,
  repeat:      0,
  volume:      0.8,
  seeking:     false,
  acx:         null,
  lyrics: {
    loading: false,
    type: 'none',
    status: 'idle',
    lines: [],
    activeIndex: -1,
    requestId: 0,
  },
};

// Shuffle is an ordering mode, not a random-song picker.  The linked list is
// always the order shown in the queue; these structures only remember where
// that order came from and how the user travelled through it.
const shuffleState = {
  originalOrder: [], // node ids, captured when shuffle is enabled
  history: [],       // nodes in the order they were played
  historyIndex: -1,
  remaining: new Set(), // ids left in the current shuffled cycle
};

// ═══════════════════════════════════════════════════════════════════════════════
// ELEMENTS
// ═══════════════════════════════════════════════════════════════════════════════
const audio        = document.getElementById('audio');
const coverImg     = document.getElementById('cover-img');
const coverPh      = document.getElementById('cover-placeholder');
const coverWrap    = document.getElementById('cover-wrap');
const coverCont    = document.getElementById('cover-container');
const coverGlow    = document.getElementById('cover-glow');
const lyricsOverlay = document.getElementById('lyrics-overlay');
const lyricsPrev    = document.getElementById('lyrics-prev');
const lyricsCurrent = document.getElementById('lyrics-current');
const lyricsNext    = document.getElementById('lyrics-next');
const lyricsStatus  = document.getElementById('lyrics-status');
const playerBg     = document.getElementById('player-bg');
const songTitle    = document.getElementById('song-title');
const songArtist   = document.getElementById('song-artist');
const songAlbum    = document.getElementById('song-album');
const fullscreenPlayer = document.getElementById('fullscreen-player');
const fullscreenBackground = document.getElementById('fullscreen-background');
const fullscreenCover = document.getElementById('fullscreen-cover');
const fullscreenTitle = document.getElementById('fullscreen-title');
const fullscreenArtist = document.getElementById('fullscreen-artist');
const fullscreenSeekTrack = document.getElementById('fullscreen-seek-track');
const fullscreenSeekFill = document.getElementById('fullscreen-seek-fill');
const fullscreenSeekThumb = document.getElementById('fullscreen-seek-thumb');
const fullscreenTimeCurrent = document.getElementById('fullscreen-time-current');
const fullscreenTimeTotal = document.getElementById('fullscreen-time-total');
const fullscreenLyrics = [...document.querySelectorAll('.fullscreen-lyric')];
const fullscreenIconPlay = document.getElementById('fullscreen-icon-play');
const fullscreenIconPause = document.getElementById('fullscreen-icon-pause');
const seekTrack    = document.getElementById('seek-track');
const seekFill     = document.getElementById('seek-fill');
const seekThumb    = document.getElementById('seek-thumb');
const timeCur      = document.getElementById('time-current');
const timeTot      = document.getElementById('time-total');
const btnPlay      = document.getElementById('btn-play');
const iconPlay     = document.getElementById('icon-play');
const iconPause    = document.getElementById('icon-pause');
const btnPrev      = document.getElementById('btn-prev');
const btnNext      = document.getElementById('btn-next');
const btnShuffle   = document.getElementById('btn-shuffle');
const btnRepeat    = document.getElementById('btn-repeat');
const iconRepAll   = document.getElementById('icon-repeat-all');
const iconRepOne   = document.getElementById('icon-repeat-one');
const volTrack     = document.getElementById('vol-track');
const volFill      = document.getElementById('vol-fill');
const volThumb     = document.getElementById('vol-thumb');
const volLabel     = document.getElementById('vol-label');
const queueList    = document.getElementById('queue-list');
const qCount       = document.getElementById('q-count');
const qSearch      = document.getElementById('queue-search');
const btnAddFiles  = document.getElementById('btn-add-files');
const btnAddFolder = document.getElementById('btn-add-folder');
const btnRescan    = document.getElementById('btn-rescan');
const btnClear     = document.getElementById('btn-clear-queue');
const playRipple   = document.getElementById('play-ripple');
const loadingOverlay = document.getElementById('loading-overlay');
const loadingText    = document.getElementById('loading-text');
const btnLibrary   = document.getElementById('btn-library');
const libraryModal = document.getElementById('library-modal');
const libraryBackdrop = document.getElementById('library-backdrop');
const libraryClose = document.getElementById('library-close');
const libraryContent = document.getElementById('library-content');
const librarySearchInput = document.getElementById('library-search');
const libraryFolderCount = document.getElementById('library-folder-count');
const libraryFileCount = document.getElementById('library-file-count');
const librarySongCount = document.getElementById('library-song-count');
const libraryAddFolderBtn = document.getElementById('library-add-folder');
const libraryAddFilesBtn = document.getElementById('library-add-files');
const libraryRescanBtn = document.getElementById('library-rescan');
const libraryClearBtn = document.getElementById('library-clear');

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════
const fmtTime = s => (!s||isNaN(s)||!isFinite(s)) ? '0:00' : `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;
const esc     = s => (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const toUrl   = fp => { if(!fp)return''; const n=fp.replace(/\\/g,'/'); return n.startsWith('/')?`file://${n}`:`file:///${n}`; };
const showLoading = t => { loadingText.textContent=t||'Loading…'; loadingOverlay.style.opacity='1'; loadingOverlay.style.pointerEvents='all'; };
const hideLoading = () => { loadingOverlay.style.opacity='0'; loadingOverlay.style.pointerEvents='none'; };

// ═══════════════════════════════════════════════════════════════════════════════
// TIMELINE
// ═══════════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════════
// SYNCHRONIZED LYRICS OVERLAY
// ═══════════════════════════════════════════════════════════════════════════════
function parseLRCTime(min, sec, fraction) {
  const m = parseInt(min, 10) || 0;
  const s = parseInt(sec, 10) || 0;
  const f = fraction ? Number(`0.${fraction}`) : 0;
  return m * 60 + s + f;
}

function parseLRC(text) {
  const out = [];
  const lines = String(text || '').split(/\r?\n/);

  for (const raw of lines) {
    const tags = [...raw.matchAll(/\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g)];
    if (!tags.length) continue;

    const lyric = raw.replace(/\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g, '').trim();
    if (!lyric) continue;

    for (const tag of tags) {
      out.push({ time: parseLRCTime(tag[1], tag[2], tag[3]), text: lyric });
    }
  }

  return out.sort((a, b) => a.time - b.time);
}

function plainLyricsToTimedLines(text, duration) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map(x => x.trim())
    .filter(Boolean);

  if (!lines.length) return [];

  const total = Number(duration || audio.duration || 0);
  const step = total > 15 ? total / Math.max(lines.length, 1) : 4;
  return lines.map((text, i) => ({ time: i * step, text }));
}

function setLyricsVisual(prev = '', cur = '', next = '', status = '') {
  if (!lyricsOverlay) return;
  lyricsPrev.textContent = prev;
  lyricsCurrent.textContent = cur;
  lyricsNext.textContent = next;
  lyricsStatus.textContent = status || '';
  updateFullscreenLyrics(cur);
}

function updateFullscreenLyrics(fallback = '') {
  if (!fullscreenLyrics.length) return;
  const lines = state.lyrics.lines;
  const activeIndex = state.lyrics.activeIndex < 0 ? 0 : state.lyrics.activeIndex;

  fullscreenLyrics.forEach(el => {
    const offset = Number(el.dataset.lyricOffset || 0);
    el.textContent = lines.length ? (lines[activeIndex + offset]?.text || '') : (offset === 0 ? fallback : '');
  });

  if (!lines.length) {
    fullscreenLyricIndex = -1;
    return;
  }

  if (fullscreenLyricIndex !== -1 && fullscreenLyricIndex !== activeIndex) {
    fullscreenLyrics[0]?.parentElement?.classList.remove('lyrics-stepping-up', 'lyrics-stepping-down');
    void fullscreenLyrics[0]?.parentElement?.offsetWidth;
    fullscreenLyrics[0]?.parentElement?.classList.add(activeIndex > fullscreenLyricIndex ? 'lyrics-stepping-up' : 'lyrics-stepping-down');
  }
  fullscreenLyricIndex = activeIndex;
}

function resetLyricsOverlay(message = '') {
  state.lyrics.lines = [];
  state.lyrics.activeIndex = -1;
  state.lyrics.type = 'none';
  state.lyrics.status = message ? 'message' : 'idle';
  setLyricsVisual('', message, '', '');
  lyricsOverlay?.classList.toggle('lyrics-hidden', !message);
  lyricsOverlay?.classList.remove('lyrics-has-lines', 'lyrics-loading');
}

function showLyricsLoading() {
  state.lyrics.loading = true;
  state.lyrics.lines = [];
  state.lyrics.activeIndex = -1;
  setLyricsVisual('', 'Finding lyrics…', '', '');
  lyricsOverlay?.classList.remove('lyrics-hidden', 'lyrics-has-lines');
  lyricsOverlay?.classList.add('lyrics-loading');
}

function setLyricsLines(lines, type, statusText = '') {
  state.lyrics.loading = false;
  state.lyrics.lines = Array.isArray(lines) ? lines : [];
  state.lyrics.activeIndex = -1;
  state.lyrics.type = type || 'none';
  state.lyrics.status = state.lyrics.lines.length ? 'ready' : 'missing';

  lyricsOverlay?.classList.remove('lyrics-loading');
  lyricsOverlay?.classList.toggle('lyrics-hidden', !state.lyrics.lines.length);
  lyricsOverlay?.classList.toggle('lyrics-has-lines', !!state.lyrics.lines.length);
  lyricsOverlay?.classList.toggle('lyrics-plain', type === 'plain');

  if (!state.lyrics.lines.length) {
    setLyricsVisual('', statusText || 'No lyrics found', '', '');
    return;
  }

  updateLyricsOverlay(audio.currentTime || 0, true);
}

function findActiveLyricIndex(time) {
  const lines = state.lyrics.lines;
  if (!lines.length) return -1;

  let lo = 0;
  let hi = lines.length - 1;
  let ans = -1;

  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].time <= time + 0.08) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  return ans < 0 ? 0 : ans;
}

function updateLyricsOverlay(time, force = false) {
  const lines = state.lyrics.lines;
  if (!lines.length || !lyricsOverlay) return;

  const idx = findActiveLyricIndex(time);
  if (!force && idx === state.lyrics.activeIndex) return;

  state.lyrics.activeIndex = idx;
  const prev = idx > 0 ? lines[idx - 1].text : '';
  const cur = lines[idx]?.text || '';
  const next = idx < lines.length - 1 ? lines[idx + 1].text : '';
  const status = state.lyrics.type === 'plain' ? 'Plain lyrics' : '';

  lyricsOverlay.classList.remove('lyrics-step');
  void lyricsOverlay.offsetWidth;
  lyricsOverlay.classList.add('lyrics-step');
  setLyricsVisual(prev, cur, next, status);
}

async function loadLyricsForSong(song, force = false) {
  const requestId = ++state.lyrics.requestId;
  showLyricsLoading();

  try {
    const payload = force
      ? await window.electronAPI?.refreshLyrics?.(song)
      : await window.electronAPI?.getLyrics?.(song);

    if (requestId !== state.lyrics.requestId) return;

    if (!payload || payload.status === 'loading') {
      resetLyricsOverlay('Lyrics downloading…');
      return;
    }

    if (payload.instrumental) {
      resetLyricsOverlay('Instrumental');
      return;
    }

    const synced = parseLRC(payload.syncedLyrics || '');
    if (synced.length) {
      setLyricsLines(synced, 'synced');
      return;
    }

    const plain = plainLyricsToTimedLines(payload.plainLyrics || '', song?.duration || audio.duration);
    if (plain.length) {
      setLyricsLines(plain, 'plain');
      return;
    }

    resetLyricsOverlay('No lyrics found');
  } catch (e) {
    if (requestId === state.lyrics.requestId) resetLyricsOverlay('Lyrics unavailable');
    console.warn('[loadLyricsForSong]', e);
  } finally {
    if (requestId === state.lyrics.requestId) state.lyrics.loading = false;
    lyricsOverlay?.classList.remove('lyrics-loading');
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// COVER
// ═══════════════════════════════════════════════════════════════════════════════
function extractAccent(img) {
  try {
    const c=document.createElement('canvas'); c.width=8; c.height=8;
    const cx=c.getContext('2d'); cx.drawImage(img,0,0,8,8);
    const d=cx.getImageData(0,0,8,8).data; let r=0,g=0,b=0;
    for(let i=0;i<d.length;i+=4){r+=d[i];g+=d[i+1];b+=d[i+2];}
    const n=d.length/4; r=Math.round(r/n); g=Math.round(g/n); b=Math.round(b/n);
    playerBg.style.background=`radial-gradient(ellipse 80% 70% at 50% 10%, rgba(${r},${g},${b},0.18) 0%, transparent 70%)`;
    coverGlow.style.background=`radial-gradient(circle, rgba(${r},${g},${b},0.35) 0%, transparent 65%)`;
  } catch {}
}
function setCover(cp) {
  if(cp){
    const url=toUrl(cp); coverImg.src=url; coverImg.style.display='block'; coverPh.style.display='none';
    fullscreenCover.src=url;
    fullscreenBackground.style.backgroundImage=`url("${url}")`;
    coverImg.onload=()=>extractAccent(coverImg);
    coverImg.onerror=()=>{coverImg.style.display='none';coverPh.style.display='flex';};
  } else {
    coverImg.style.display='none'; coverPh.style.display='flex';
    fullscreenCover.removeAttribute('src');
    fullscreenBackground.style.backgroundImage='none';
    playerBg.style.background='radial-gradient(ellipse 70% 60% at 50% 30%, rgba(167,139,250,0.06) 0%, transparent 70%)';
    coverGlow.style.background='radial-gradient(circle, rgba(167,139,250,0.25) 0%, transparent 65%)';
  }
}

function syncFullscreenTrack(song = state.currentNode?.song) {
  fullscreenTitle.textContent = song?.title || 'No track loaded';
  fullscreenArtist.textContent = song?.artist || 'Choose a song to get started';
}

// ═══════════════════════════════════════════════════════════════════════════════
// INFO ANIMATION
// ═══════════════════════════════════════════════════════════════════════════════
let infoTimer=null;
function animateInfo(song) {
  const el=document.getElementById('song-info');
  el.classList.remove('info-enter'); el.classList.add('info-exit');
  clearTimeout(infoTimer);
  infoTimer=setTimeout(()=>{
    el.classList.remove('info-exit');
    songTitle.textContent=song.title; songArtist.textContent=song.artist; songAlbum.textContent=song.album||'';
    el.classList.add('info-enter');
  },180);
}

// ═══════════════════════════════════════════════════════════════════════════════
// LOAD NODE
// ═══════════════════════════════════════════════════════════════════════════════
function updateMediaSession(song) {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title:  song.title,
    artist: song.artist,
    album:  song.album || '',
    artwork: song.coverPath ? [{ src: toUrl(song.coverPath), sizes: '512x512', type: 'image/jpeg' }] : []
  });
}

function updateMediaPosition() {
  if (!('mediaSession' in navigator) || !audio.duration) return;
  navigator.mediaSession.setPositionState({
    duration:     audio.duration,
    playbackRate: audio.playbackRate,
    position:     audio.currentTime,
  });
}

async function updateMediaSession(song) {
  if (!('mediaSession' in navigator)) return;
  let artwork = [];
  if (song.coverPath && window.electronAPI?.getCoverBase64) {
    const b64 = await window.electronAPI.getCoverBase64(song.coverPath);
    if (b64) artwork = [{ src: b64, sizes: '512x512', type: 'image/jpeg' }];
  }
  navigator.mediaSession.metadata = new MediaMetadata({
    title:  song.title,
    artist: song.artist,
    album:  song.album || '',
    artwork,
  });
}

function updateMediaPosition() {
  if (!('mediaSession' in navigator) || !audio.duration) return;
  navigator.mediaSession.setPositionState({
    duration:     audio.duration,
    playbackRate: audio.playbackRate,
    position:     audio.currentTime,
  });
}

async function loadNode(node, autoplay) {
  if(!node) return;
  state.currentNode=node;
  animateInfo(node.song); setCover(node.song.coverPath); coverWrap.classList.add('has-song');
  syncFullscreenTrack(node.song);
  updateMediaSession(node.song);
  loadLyricsForSong(node.song, false);
  coverCont.style.animation='none'; void coverCont.offsetHeight; coverCont.style.animation='';
  const url=toUrl(node.song.filePath);
  audio.src=url; audio.load();
  seekFill.style.width='0%'; seekThumb.style.left='0%'; timeCur.textContent='0:00'; timeTot.textContent='—';
  renderQueue();
  if(autoplay){
    try{await audio.play();state.isPlaying=true;}catch(e){console.error(e);state.isPlaying=false;}
    updatePlayBtn();
    updateQueuePlayingState();
    triggerRipple();
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PLAYBACK HELPERS
// ═══════════════════════════════════════════════════════════════════════════════
function updatePlayBtn() {
  iconPlay.style.display=state.isPlaying?'none':'block';
  iconPause.style.display=state.isPlaying?'block':'none';
  coverCont.classList.toggle('playing', state.isPlaying);
  coverCont.classList.toggle('spinning-paused', !state.isPlaying || !isWindowFocused);
  if (fullscreenIconPlay && fullscreenIconPause) {
    fullscreenIconPlay.hidden = state.isPlaying;
    fullscreenIconPause.hidden = !state.isPlaying;
  }
}
function updateQueuePlayingState() {
  const active = queueList.querySelector('.q-item.active');
  if (!active) return;

  active
    .querySelector('.q-now-playing-overlay')
    ?.classList.toggle('paused', !state.isPlaying);

  active
    .querySelector('.eq-anim')
    ?.classList.toggle('paused', !state.isPlaying);
}

function triggerRipple(){btnPlay.classList.remove('rippling');void btnPlay.offsetHeight;btnPlay.classList.add('rippling');setTimeout(()=>btnPlay.classList.remove('rippling'),500);}
function setVolume(v){
  state.volume=Math.max(0,Math.min(1,v));
  audio.volume=state.volume;
  const p=state.volume*100;
  if(volFill) volFill.style.width=p+'%';
  if(volThumb) volThumb.style.left=p+'%';
  if(volLabel) volLabel.textContent=Math.round(p);
}
function updateSeek(){if(!audio.duration||state.seeking)return;const p=audio.currentTime/audio.duration;seekFill.style.width=p*100+'%';seekThumb.style.left=p*100+'%';timeCur.textContent=fmtTime(audio.currentTime);fullscreenSeekFill.style.width=p*100+'%';fullscreenSeekThumb.style.left=p*100+'%';fullscreenTimeCurrent.textContent=fmtTime(audio.currentTime);updateMediaPosition();updateLyricsOverlay(audio.currentTime);}

// ═══════════════════════════════════════════════════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════════════════════════════════════════════════
function rebuildQueue(nodes) {
  queue.head = null; queue.tail = null; queue.size = 0; queue.map = {};
  nodes.forEach(node => {
    node.prev = null; node.next = null;
    queue.appendNode(node);
  });
}

function rotateQueueTo(node) {
  const nodes = queue.toArray();
  const index = nodes.indexOf(node);
  if (index > 0) rebuildQueue(nodes.slice(index).concat(nodes.slice(0, index)));
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
  shuffleState.remaining = new Set(queue.toArray().filter(node => node !== current).map(node => node.id));
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
  for (let count = 0; count < queue.size; count++, node = node.next || queue.head) {
    if (shuffleState.remaining.has(node.id)) return node;
  }
  return null;
}

function getNextNode(){
  if(!state.currentNode) return queue.head;
  if (!state.shuffle) {
    if(state.currentNode.next) return state.currentNode.next;
    return state.repeat===1 ? queue.head : null;
  }

  // After Previous, Next first walks forward through the real play history.
  if (shuffleState.historyIndex < shuffleState.history.length - 1) {
    return shuffleState.history[shuffleState.historyIndex + 1];
  }

  let next = findUpcomingShuffleNode();
  if (next) return next;

  // Repeat all begins a new pass through the same established queue order.
  if (state.repeat === 1 && queue.size > 1) {
    shuffleState.remaining = new Set(queue.toArray()
      .filter(node => node !== state.currentNode)
      .map(node => node.id));
    next = findUpcomingShuffleNode();
  }
  return next;
}

function getPrevNode(){
  if(audio.currentTime>3) return state.currentNode;
  if(!state.currentNode)  return queue.tail;
  if (!state.shuffle) {
    if(state.currentNode.prev) return state.currentNode.prev;
    return state.repeat===1 ? queue.tail : state.currentNode;
  }
  return shuffleState.historyIndex > 0
    ? shuffleState.history[shuffleState.historyIndex - 1]
    : state.currentNode;
}

function playNext(autoplay) {
  const node = getNextNode();
  if (!node) return false;

  if (state.shuffle) {
    const fromHistory = shuffleState.history[shuffleState.historyIndex + 1] === node;
    if (fromHistory) shuffleState.historyIndex++;
    else recordShuffleVisit(node);
    rotateQueueTo(node);
  }
  loadNode(node, autoplay);
  return true;
}

function playPrevious(autoplay) {
  const node = getPrevNode();
  if (!node) return false;

  if (state.shuffle && node !== state.currentNode) {
    shuffleState.historyIndex--;
    rotateQueueTo(node);
  }
  loadNode(node, autoplay);
  return true;
}

function playSpecificNode(node, autoplay) {
  if (!node) return false;
  if (state.shuffle && node !== state.currentNode) {
    const historyPosition = shuffleState.history.lastIndexOf(node);
    if (historyPosition !== -1) shuffleState.historyIndex = historyPosition;
    else recordShuffleVisit(node);
    rotateQueueTo(node);
  }
  loadNode(node, autoplay);
  return true;
}

function enableShuffle() {
  if (!queue.size) return;
  const current = state.currentNode || queue.head;
  const nodes = queue.toArray();
  shuffleState.originalOrder = nodes.map(node => node.id);
  rebuildQueue([current, ...fisherYates(nodes.filter(node => node !== current))]);
  state.currentNode = current;
  state.shuffle = true;
  rememberShuffleStart(current);
  renderQueue();
}

function reshuffleUpcoming() {
  if (!state.shuffle || !state.currentNode) return;
  const current = state.currentNode;
  const nodes = queue.toArray();
  const upcoming = nodes.filter(node => node !== current && shuffleState.remaining.has(node.id));
  const played = nodes.filter(node => node !== current && !shuffleState.remaining.has(node.id));
  rebuildQueue([current, ...fisherYates(upcoming), ...played]);
  renderQueue();
}

function disableShuffle() {
  if (!state.shuffle) return;
  const byId = queue.map;
  const restored = shuffleState.originalOrder.map(id => byId[id]).filter(Boolean);
  // Anything added while shuffled was not part of the original snapshot.
  queue.toArray().forEach(node => { if (!restored.includes(node)) restored.push(node); });
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

// ═══════════════════════════════════════════════════════════════════════════════
// REMOVE NODE
// ═══════════════════════════════════════════════════════════════════════════════
function removeNode(node) {
  if(!node) return;
  const wasCurrent = node===state.currentNode;
  const fallback   = node.next || node.prev;
  queue.remove(node);
  if (state.shuffle) {
    shuffleState.originalOrder = shuffleState.originalOrder.filter(id => id !== node.id);
    shuffleState.remaining.delete(node.id);
    const oldHistoryIndex = shuffleState.historyIndex;
    shuffleState.history = shuffleState.history.filter(item => item !== node);
    shuffleState.historyIndex = Math.min(oldHistoryIndex, shuffleState.history.length - 1);
  }
  if(wasCurrent){
    if(!queue.size){
      audio.pause(); audio.src=''; state.isPlaying=false; state.currentNode=null;
      songTitle.textContent='No track loaded'; songArtist.textContent='Add songs to get started';
      songAlbum.textContent=''; setCover(null); coverWrap.classList.remove('has-song'); resetLyricsOverlay(); updatePlayBtn();
    } else {
      if (state.shuffle) {
        rotateQueueTo(fallback);
        rememberShuffleStart(fallback);
      }
      loadNode(fallback, state.isPlaying);
    }
  }
  renderQueue();
}

// ═══════════════════════════════════════════════════════════════════════════════
// QUEUE SORT
// ═══════════════════════════════════════════════════════════════════════════════
// sortKeys: ordered array of active sort keys, e.g. ['artist','album']
// dateDir: 1 = ascending (oldest first), -1 = descending (newest first)
let sortKeys    = [];
let dateDir     = 1;
let dateFlipped = false; // true after 2nd click (direction toggled); 3rd click removes
let _origSeed   = 0;

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
    nodes.sort((a, b) => (a.song._origIndex||0) - (b.song._origIndex||0));
  } else {
    nodes.sort((a, b) => {
      for (const key of sortKeys) {
        let av = '', bv = '';
        if (key === 'artist') {
          av = (a.song.artist || '').toLowerCase();
          bv = (b.song.artist || '').toLowerCase();
        } else if (key === 'album') {
          av = (a.song.album || '').toLowerCase();
          bv = (b.song.album || '').toLowerCase();
        } else if (key === 'date') {
          // Use _origIndex as proxy for "date added" order
          const diff = ((a.song._origIndex||0) - (b.song._origIndex||0)) * dateDir;
          if (diff !== 0) return diff;
          continue;
        }
        if (av < bv) return -1;
        if (av > bv) return  1;
      }
      // Stable tie-break: original order
      return (a.song._origIndex||0) - (b.song._origIndex||0);
    });
  }

  // Rebuild the linked list in sorted order
  queue.head = null; queue.tail = null; queue.size = 0;
  nodes.forEach(n => { n.prev = null; n.next = null; queue.appendNode(n); });
}

function toggleSortKey(key) {
  const idx = sortKeys.indexOf(key);
  if (key === 'date' && idx !== -1) {
    if (!dateFlipped) {
      // 2nd click: flip direction
      dateDir = -1;
      dateFlipped = true;
      document.getElementById('sort-date-dir').textContent = '↓';
    } else {
      // 3rd click: remove
      sortKeys.splice(idx, 1);
      dateDir = 1;
      dateFlipped = false;
      document.getElementById('sort-date-dir').textContent = '↑';
    }
  } else if (idx !== -1) {
    // Remove key
    sortKeys.splice(idx, 1);
  } else {
    // Add key (1st click for date resets direction)
    if (key === 'date') { dateDir = 1; dateFlipped = false; document.getElementById('sort-date-dir').textContent = '↑'; }
    sortKeys.push(key);
  }
  updateSortUI();
  applySort();
  renderQueue();
}

function updateSortUI() {
  ['artist','album','date'].forEach(key => {
    const btn = document.getElementById(`sort-${key}`);
    if (!btn) return;
    btn.classList.toggle('active', sortKeys.includes(key));
    if (key !== 'date') return;
    const dir = document.getElementById('sort-date-dir');
    if (dir) dir.style.display = sortKeys.includes('date') ? '' : 'none';
  });
  // Show priority badges on pills when more than one active
  document.querySelectorAll('.sort-pill').forEach(btn => {
    btn.querySelector('.sort-priority')?.remove();
    const key = btn.dataset.key;
    const pos = sortKeys.indexOf(key);
    if (pos !== -1 && sortKeys.length > 1) {
      const badge = document.createElement('span');
      badge.className = 'sort-priority';
      badge.textContent = pos + 1;
      btn.appendChild(badge);
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// RENDER QUEUE
// ═══════════════════════════════════════════════════════════════════════════════
let searchQuery='';
function renderQueue() {
  qCount.textContent=queue.size;
  if(!queue.size){
    queueList.innerHTML=`<div class="q-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>Choose one or more music folders<br>using <strong>+ Folder</strong> — or add files directly</div>`;
    return;
  }
  const nodes=queue.toArray();
  const filtered=nodes.filter(n=>!searchQuery||n.song.title.toLowerCase().includes(searchQuery)||n.song.artist.toLowerCase().includes(searchQuery)||(n.song.album||'').toLowerCase().includes(searchQuery));
  if(!filtered.length){queueList.innerHTML=`<div class="q-empty">No results for "${esc(searchQuery)}"</div>`;return;}

  queueList.innerHTML=filtered.map((n,li)=>`
    <div class="q-item${n===state.currentNode?' active':''}" data-id="${n.id}" style="animation-delay:${Math.min(li*0.02,0.25)}s">
      <div class="q-drag-handle">
        <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
          <line x1="3" y1="4" x2="11" y2="4"/><line x1="3" y1="7" x2="11" y2="7"/><line x1="3" y1="10" x2="11" y2="10"/>
        </svg>
      </div>
      <div class="q-art">
        ${n.song.coverPath?`<img src="${esc(toUrl(n.song.coverPath))}" alt="" loading="lazy">`:'<span>♪</span>'}
        ${n===state.currentNode?`<div class="q-now-playing-overlay${state.isPlaying?'':' paused'}"><div class="eq-anim${state.isPlaying?'':' paused'}"><span></span><span></span><span></span></div></div>`:''}
      </div>
      <div class="q-meta">
        <div class="q-title">${esc(n.song.title)}</div>
        <div class="q-artist">${esc(n.song.artist)}${n.song.album&&n.song.album!=='Unknown Album'?` · ${esc(n.song.album)}`:''}</div>
      </div>
      <div class="q-actions">
        <button class="q-btn q-play-next" data-id="${n.id}" title="Play next">
          <svg viewBox="0 0 16 16" fill="currentColor"><polygon points="2,2 10,8 2,14"/><rect x="12" y="2" width="2" height="12" rx="1"/></svg>
        </button>
        <button class="q-btn q-remove" data-id="${n.id}" title="Remove">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><line x1="3" y1="3" x2="13" y2="13"/><line x1="13" y1="3" x2="3" y2="13"/></svg>
        </button>
      </div>
    </div>
  `).join('');

  // click to play
  queueList.querySelectorAll('.q-item').forEach(el=>{
    el.addEventListener('click', e=>{
      if(e.target.closest('.q-actions')||e.target.closest('.q-drag-handle')) return;
      const node=queue.map[el.dataset.id];
      if(node){playSpecificNode(node,true);state.isPlaying=true;updatePlayBtn();}
    });
  });

  // play next
  queueList.querySelectorAll('.q-play-next').forEach(btn=>{
    btn.addEventListener('click', e=>{
      e.stopPropagation();
      const node=queue.map[btn.dataset.id];
      if(!node||node===state.currentNode) return;
      queue.detach(node);
      if(state.currentNode) queue.insertAfter(state.currentNode, node);
      else { node.next=queue.head; if(queue.head)queue.head.prev=node;else queue.tail=node; queue.head=node; queue.map[node.id]=node; queue.size++; }
      if (state.shuffle && state.currentNode) rotateQueueTo(state.currentNode);
      renderQueue();
      requestAnimationFrame(()=>{
        const el=queueList.querySelector(`[data-id="${node.id}"]`);
        if(el){el.classList.add('q-flash');setTimeout(()=>el.classList.remove('q-flash'),700);}
      });
    });
  });

  // remove
  queueList.querySelectorAll('.q-remove').forEach(btn=>{
    btn.addEventListener('click',e=>{e.stopPropagation();removeNode(queue.map[btn.dataset.id]);});
  });

  const active = queueList.querySelector('.q-item.active');

  if (active && queueVisible && !root.classList.contains('queue-collapsed')) {
    active.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
      behavior: 'smooth'
    });
  }

  setupDragReorder();
}

// ═══════════════════════════════════════════════════════════════════════════════
// DRAG TO REORDER
// ═══════════════════════════════════════════════════════════════════════════════
function setupDragReorder() {
  const items = [...queueList.querySelectorAll('.q-item')];
  if(items.length < 2) return;

  let dragEl   = null;
  let dragNode = null;
  let ghost    = null;
  let startY   = 0;
  let itemH    = 0;
  let insertBeforeId = null;

  function clearShifts() {
    items.forEach(el => { el.style.transform = ''; el.style.transition = ''; });
  }

  function updateShifts(mouseY) {
    // Find where to insert: first item whose midpoint is below the ghost center
    insertBeforeId = null;
    for(let i = 0; i < items.length; i++) {
      if(items[i] === dragEl) continue;
      const rect = items[i].getBoundingClientRect();
      if(mouseY < rect.top + rect.height / 2) {
        insertBeforeId = items[i].dataset.id;
        break;
      }
    }

    // Shift items to make a visual gap
    const dragOrigIdx = items.indexOf(dragEl);
    let insertIdx = items.length; // default: end
    if(insertBeforeId) {
      insertIdx = items.findIndex(el => el.dataset.id === insertBeforeId);
    }

    items.forEach((el, i) => {
      if(el === dragEl) return;
      el.style.transition = 'transform 0.15s cubic-bezier(0.16,1,0.3,1)';
      // Items between drag origin and insert position shift by one slot
      if(dragOrigIdx < insertIdx) {
        // dragging downward: items from dragOrig+1 to insertIdx-1 shift up
        el.style.transform = (i > dragOrigIdx && i < insertIdx) ? `translateY(${-itemH}px)` : '';
      } else {
        // dragging upward: items from insertIdx to dragOrig-1 shift down
        el.style.transform = (i >= insertIdx && i < dragOrigIdx) ? `translateY(${itemH}px)` : '';
      }
    });
  }

  items.forEach(el => {
    const handle = el.querySelector('.q-drag-handle');
    if(!handle) return;

    handle.addEventListener('mousedown', e => {
      if(e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();

      dragEl   = el;
      dragNode = queue.map[el.dataset.id];
      if(!dragNode) return;

      itemH  = el.offsetHeight;
      startY = e.clientY;

      const rect = el.getBoundingClientRect();
      ghost = el.cloneNode(true);
      ghost.style.cssText = `
        position:fixed;z-index:9999;pointer-events:none;
        left:${rect.left}px;top:${rect.top}px;
        width:${rect.width}px;height:${rect.height}px;
        opacity:0.85;border-radius:8px;
        background:var(--surface3);
        box-shadow:0 8px 32px rgba(0,0,0,0.5);
        border:0.5px solid rgba(167,139,250,0.35);
        transition:none;
      `;
      document.body.appendChild(ghost);
      el.style.opacity = '0.25';
      el.style.transition = 'opacity 0.1s';

      const onMove = e => {
        ghost.style.top = (rect.top + e.clientY - startY) + 'px';
        updateShifts(e.clientY);
      };

      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup',   onUp);

        ghost?.remove(); ghost = null;
        dragEl.style.opacity = '';
        dragEl.style.transition = '';
        clearShifts();

        if(insertBeforeId) {
          const target = queue.map[insertBeforeId];
          if(target && target !== dragNode) queue.moveBefore(dragNode, target);
        } else {
          if(dragNode !== queue.tail) queue.moveToEnd(dragNode);
        }

        // Shuffle always presents the current song at the top, while retaining
        // the user's newly established order for the remaining entries.
        if (state.shuffle && state.currentNode) rotateQueueTo(state.currentNode);

        dragEl = null; dragNode = null; insertBeforeId = null;
        renderQueue();
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup',   onUp);
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// LIBRARY MANAGER MODAL
// ═══════════════════════════════════════════════════════════════════════════════
let libraryState = { songs: [], folders: [], files: [] };
let libraryTab = 'folders';
let librarySearch = '';

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
  if(!libraryModal) return;
  libraryModal.classList.toggle('open', open);
  libraryModal.setAttribute('aria-hidden', open ? 'false' : 'true');
  if(open) {
    librarySearchInput.value = librarySearch;
    setTimeout(() => librarySearchInput?.focus(), 80);
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
  } catch(e) {
    console.error(e);
  }
}

function setLibraryTab(tab) {
  libraryTab = tab;
  document.querySelectorAll('.library-tab').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tab));
  renderLibraryManager();
}

function renderSourceRows(items, type) {
  const q = librarySearch.toLowerCase();
  const filtered = items.filter(item => !q || item.toLowerCase().includes(q));

  if(!filtered.length) {
    return `<div class="library-empty">${items.length ? 'No matches found.' : type === 'folder' ? 'No folders added yet.' : 'No loose files added yet.'}</div>`;
  }

  return filtered.map(src => `
    <div class="library-row source-row">
      <div class="library-row-icon">${type === 'folder' ? '▣' : '♪'}</div>
      <div class="library-row-main">
        <div class="library-row-title">${esc(src.split(/[\\/]/).filter(Boolean).pop() || src)}</div>
        <div class="library-row-path" title="${esc(src)}">${esc(src)}</div>
      </div>
      <button class="library-remove" data-type="${type}" data-path="${esc(src)}" title="Remove from Aura">Remove</button>
    </div>
  `).join('');
}

function renderSongRows(songs) {
  const q = librarySearch.toLowerCase();
  const filtered = songs.filter(song => {
    if(!q) return true;
    return (song.title || '').toLowerCase().includes(q) ||
      (song.artist || '').toLowerCase().includes(q) ||
      (song.album || '').toLowerCase().includes(q) ||
      (song.filePath || '').toLowerCase().includes(q);
  });

  if(!filtered.length) {
    return `<div class="library-empty">${songs.length ? 'No matching scanned songs.' : 'No scanned songs yet.'}</div>`;
  }

  const visible = filtered.slice(0, 700);
  const more = filtered.length > visible.length ? `<div class="library-empty small">Showing first ${visible.length} of ${filtered.length} matches. Use search to narrow it down.</div>` : '';

  return visible.map(song => `
    <div class="library-row song-row">
      <div class="library-song-art">${song.coverPath ? `<img src="${esc(toUrl(song.coverPath))}" alt="">` : '<span>♪</span>'}</div>
      <div class="library-row-main">
        <div class="library-row-title">${esc(song.title || song.fileName || 'Unknown title')}</div>
        <div class="library-row-sub">${esc(song.artist || 'Unknown Artist')}${song.album && song.album !== 'Unknown Album' ? ` · ${esc(song.album)}` : ''}</div>
        <div class="library-row-path" title="${esc(song.filePath || '')}">${esc(song.filePath || '')}</div>
      </div>
      <div class="library-song-extra">${song.ext ? esc(song.ext.toUpperCase()) : ''}</div>
    </div>
  `).join('') + more;
}

function renderLibraryManager() {
  if(!libraryContent) return;

  libraryFolderCount.textContent = libraryState.folders.length;
  libraryFileCount.textContent = libraryState.files.length;
  librarySongCount.textContent = libraryState.songs.length;

  if(libraryTab === 'folders') {
    libraryContent.innerHTML = renderSourceRows(libraryState.folders, 'folder');
  } else if(libraryTab === 'files') {
    libraryContent.innerHTML = renderSourceRows(libraryState.files, 'file');
  } else {
    libraryContent.innerHTML = renderSongRows(libraryState.songs);
  }

  libraryContent.querySelectorAll('.library-remove').forEach(btn => {
    btn.addEventListener('click', async () => {
      const type = btn.dataset.type;
      const src = btn.dataset.path;
      btn.disabled = true;
      btn.textContent = 'Removing…';
      try {
        const payload = type === 'folder'
          ? await window.electronAPI.removeLibraryFolder(src)
          : await window.electronAPI.removeLibraryFile(src);
        applyLibraryPayload(payload);
      } catch(e) {
        console.error(e);
        btn.disabled = false;
        btn.textContent = 'Remove';
      }
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// LIBRARY LOADING
// ═══════════════════════════════════════════════════════════════════════════════
async function initLibrary() {
  showLoading('Loading music library…');
  try {
    const payload = await window.electronAPI.scanLibrary();
    libraryState = {
      songs: Array.isArray(payload?.songs) ? payload.songs : [],
      folders: Array.isArray(payload?.folders) ? payload.folders : [],
      files: Array.isArray(payload?.files) ? payload.files : [],
    };
    replaceQueueWithSongs(libraryState.songs);
    hideLoading(); console.log(`Loaded ${queue.size} songs from ${libraryState.folders.length} folder(s) and ${libraryState.files.length} file(s)`);
  } catch(e){console.error(e);hideLoading();renderQueue();}
}

async function doRescan() {
  showLoading('Rescanning…');
  try {
    const payload=await window.electronAPI.rescanLibrary();
    libraryState = {
      songs: Array.isArray(payload?.songs) ? payload.songs : [],
      folders: Array.isArray(payload?.folders) ? payload.folders : [],
      files: Array.isArray(payload?.files) ? payload.files : [],
    };
    replaceQueueWithSongs(libraryState.songs);
    renderLibraryManager(); hideLoading();
  } catch(e){console.error(e);hideLoading();}
}

function replaceQueueWithSongs(songs) {
  const oldNodes = queue.toArray();
  const currentPath = state.currentNode?.song?.filePath;
  const songByPath = new Map();
  (songs || []).forEach(song => {
    const key = song.filePath;
    if (key && !songByPath.has(key)) songByPath.set(key, song);
  });
  const incomingPaths = [...songByPath.keys()];

  if (state.shuffle) {
    const oldById = new Map(oldNodes.map(node => [node.id, node]));
    const pathForId = id => oldById.get(id)?.song.filePath;
    const uniqueExisting = paths => [...new Set(paths.filter(path => songByPath.has(path)))];
    const originalPaths = uniqueExisting(shuffleState.originalOrder.map(pathForId));
    const visiblePaths = uniqueExisting(oldNodes.map(node => node.song.filePath));
    const historyPaths = shuffleState.history.map(node => node.song.filePath);
    const remainingPaths = [...shuffleState.remaining].map(pathForId);

    // New library entries become upcoming tracks, and removed entries simply
    // disappear from every shuffle structure.
    incomingPaths.forEach(path => {
      if (!originalPaths.includes(path)) originalPaths.push(path);
      if (!visiblePaths.includes(path)) visiblePaths.push(path);
    });

    const newNodes = new Map();
    _origSeed = 0;
    queue.clear();
    visiblePaths.forEach(path => {
      const song = songByPath.get(path);
      stampOrig(song);
      newNodes.set(path, queue.push(song));
    });

    const current = newNodes.get(currentPath) || queue.head;
    state.currentNode = current || null;
    if (current) rotateQueueTo(current);

    shuffleState.originalOrder = originalPaths.map(path => newNodes.get(path)?.id).filter(Boolean);
    shuffleState.history = historyPaths.map(path => newNodes.get(path)).filter(Boolean);
    shuffleState.historyIndex = shuffleState.history.lastIndexOf(current);
    if (shuffleState.historyIndex < 0 && current) {
      shuffleState.history = [current];
      shuffleState.historyIndex = 0;
    }
    shuffleState.remaining = new Set(remainingPaths.map(path => newNodes.get(path)?.id).filter(Boolean));
    incomingPaths.forEach(path => {
      const node = newNodes.get(path);
      if (node && node !== current && !shuffleState.history.includes(node)) shuffleState.remaining.add(node.id);
    });
  } else {
    queue.clear(); state.currentNode = null; _origSeed = 0;
    (songs || []).forEach(song => {
      if (!song.filePath || songByPath.get(song.filePath) !== song) return;
      stampOrig(song);
      queue.push(song);
    });
    if (currentPath) state.currentNode = queue.toArray().find(node => node.song.filePath === currentPath) || null;
  }

  renderQueue();
  if(!queue.size) {
    audio.pause(); audio.src=''; state.isPlaying=false;
    songTitle.textContent='No track loaded'; songArtist.textContent='Add songs to get started'; songAlbum.textContent='';
    setCover(null); coverWrap.classList.remove('has-song'); resetLyricsOverlay(); updatePlayBtn();
    seekFill.style.width='0%'; seekThumb.style.left='0%'; timeCur.textContent='0:00'; timeTot.textContent='0:00';
    fullscreenSeekFill.style.width='0%'; fullscreenSeekThumb.style.left='0%'; fullscreenTimeCurrent.textContent='0:00'; fullscreenTimeTotal.textContent='0:00'; syncFullscreenTrack();
    return;
  }
  if(!state.currentNode&&queue.head) loadNode(queue.head,false);
}

async function addFiles(){
  showLoading('Scanning files…');
  try{const payload=await window.electronAPI.openAndScan();applyLibraryPayload(payload);}catch(e){console.error(e);}
  hideLoading();
}
async function addFolder(){
  showLoading('Scanning folder…');
  try{const payload=await window.electronAPI.openFolder();applyLibraryPayload(payload);}catch(e){console.error(e);}
  hideLoading();
}

// File drop onto window
document.addEventListener('dragover',e=>{if(e.dataTransfer.types.includes('Files')){e.preventDefault();e.stopPropagation();}});
document.addEventListener('drop',async e=>{
  if(!e.dataTransfer.files.length) return;
  e.preventDefault();
  const paths=[...e.dataTransfer.files].map(f=>f.path).filter(Boolean);
  if(!paths.length) return;
  showLoading(`Scanning ${paths.length} file${paths.length>1?'s':''}…`);
  try{const payload=await window.electronAPI.addPaths(paths);applyLibraryPayload(payload);}catch(e){console.error(e);}
  hideLoading();
});

// ═══════════════════════════════════════════════════════════════════════════════
// CONTROLS
// ═══════════════════════════════════════════════════════════════════════════════
btnPlay.addEventListener('click',async()=>{
  if(!queue.size) return;
  if(!state.currentNode){await loadNode(queue.head,true);return;}

  if(state.isPlaying){
    audio.pause();
    state.isPlaying=false;
  } else {
    try{
      await audio.play();
      state.isPlaying=true;
      triggerRipple();
    } catch {}
  }

  updatePlayBtn();
  updateQueuePlayingState();
});

btnPrev.addEventListener('click',()=>{ playPrevious(state.isPlaying); });
btnNext.addEventListener('click',()=>{ playNext(state.isPlaying); });
btnShuffle.addEventListener('click',()=>{
  if (state.shuffle) disableShuffle();
  else enableShuffle();
  btnShuffle.classList.toggle('active', state.shuffle);
  btnShuffle.title = state.shuffle ? 'Disable shuffle' : 'Enable shuffle';
});
btnShuffle.addEventListener('contextmenu', event => {
  event.preventDefault();
  if (!state.shuffle) return;
  reshuffleUpcoming();
  btnShuffle.classList.add('active');
});
btnRepeat.addEventListener('click',()=>{
  state.repeat=(state.repeat+1)%3;
  btnRepeat.classList.toggle('active',state.repeat>0);
  iconRepAll.style.display=state.repeat===2?'none':'block';
  iconRepOne.style.display=state.repeat===2?'block':'none';
  btnRepeat.title=['Repeat off','Repeat all','Repeat one'][state.repeat];
});

function seekTo(e){if(!audio.duration)return;const r=seekTrack.getBoundingClientRect();const p=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width));audio.currentTime=p*audio.duration;seekFill.style.width=p*100+'%';seekThumb.style.left=p*100+'%';fullscreenSeekFill.style.width=p*100+'%';fullscreenSeekThumb.style.left=p*100+'%';}
seekTrack.addEventListener('mousedown',e=>{state.seeking=true;seekTo(e);const up=()=>{state.seeking=false;window.removeEventListener('mousemove',seekTo);window.removeEventListener('mouseup',up);};window.addEventListener('mousemove',seekTo);window.addEventListener('mouseup',up);});
fullscreenSeekTrack.addEventListener('mousedown', e => {
  state.seeking = true;
  const seekFromFullscreen = event => {
    if (!audio.duration) return;
    const r = fullscreenSeekTrack.getBoundingClientRect();
    const p = Math.max(0, Math.min(1, (event.clientX - r.left) / r.width));
    audio.currentTime = p * audio.duration;
    seekFill.style.width = fullscreenSeekFill.style.width = `${p * 100}%`;
    seekThumb.style.left = fullscreenSeekThumb.style.left = `${p * 100}%`;
  };
  seekFromFullscreen(e);
  const up = () => { state.seeking = false; window.removeEventListener('mousemove', seekFromFullscreen); window.removeEventListener('mouseup', up); };
  window.addEventListener('mousemove', seekFromFullscreen);
  window.addEventListener('mouseup', up);
});

function setVolFromEvent(e){
  if(!volTrack) return;
  const r=volTrack.getBoundingClientRect();
  setVolume(Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)));
}
if(volTrack){
  volTrack.addEventListener('mousedown',e=>{
    setVolFromEvent(e);
    const up=()=>{window.removeEventListener('mousemove',setVolFromEvent);window.removeEventListener('mouseup',up);};
    window.addEventListener('mousemove',setVolFromEvent);
    window.addEventListener('mouseup',up);
  });
}
const volIcon = document.getElementById('vol-icon');
if(volIcon){
  volIcon.addEventListener('click',()=>{
    if(state.volume>0){state._vol=state.volume;setVolume(0);}
    else setVolume(state._vol||0.8);
  });
}
coverWrap?.addEventListener('dblclick',()=>{if(state.currentNode?.song)loadLyricsForSong(state.currentNode.song,true);});

btnAddFiles.addEventListener('click',addFiles); btnAddFolder.addEventListener('click',addFolder); btnRescan.addEventListener('click',doRescan);
btnLibrary?.addEventListener('click', openLibraryManager);
libraryBackdrop?.addEventListener('click', () => setLibraryModal(false));
libraryClose?.addEventListener('click', () => setLibraryModal(false));
document.querySelectorAll('.library-tab').forEach(btn => btn.addEventListener('click', () => setLibraryTab(btn.dataset.tab)));
librarySearchInput?.addEventListener('input', () => { librarySearch = librarySearchInput.value.trim(); renderLibraryManager(); });
libraryAddFolderBtn?.addEventListener('click', addFolder);
libraryAddFilesBtn?.addEventListener('click', addFiles);
libraryRescanBtn?.addEventListener('click', doRescan);
libraryClearBtn?.addEventListener('click', async () => {
  if(!confirm('Remove all saved folders and loose files from Aura? Your actual music files will not be deleted.')) return;
  try {
    const payload = await window.electronAPI.clearLibrary();
    applyLibraryPayload(payload);
  } catch(e) { console.error(e); }
});
btnClear.addEventListener('click',()=>{
  audio.pause();audio.src='';state.isPlaying=false;state.currentNode=null;queue.clear();
  state.shuffle=false; btnShuffle.classList.remove('active'); btnShuffle.title='Enable shuffle';
  shuffleState.originalOrder=[]; shuffleState.history=[]; shuffleState.historyIndex=-1; shuffleState.remaining.clear();
  songTitle.textContent='No track loaded';songArtist.textContent='Add songs to get started';songAlbum.textContent='';
  setCover(null);coverWrap.classList.remove('has-song');resetLyricsOverlay();updatePlayBtn();renderQueue();
  seekFill.style.width='0%';seekThumb.style.left='0%';timeCur.textContent='0:00';timeTot.textContent='0:00';
  fullscreenSeekFill.style.width='0%';fullscreenSeekThumb.style.left='0%';fullscreenTimeCurrent.textContent='0:00';fullscreenTimeTotal.textContent='0:00';syncFullscreenTrack();
});
qSearch.addEventListener('input',()=>{searchQuery=qSearch.value.toLowerCase().trim();renderQueue();});
document.getElementById('sort-artist')?.addEventListener('click', () => toggleSortKey('artist'));
document.getElementById('sort-album')?.addEventListener('click',  () => toggleSortKey('album'));
document.getElementById('sort-date')?.addEventListener('click',   () => toggleSortKey('date'));
// Init: hide date direction arrow since sort is off by default
document.addEventListener('DOMContentLoaded', updateSortUI);
document.getElementById('btn-min').addEventListener('click',()=>window.electronAPI?.minimize());
document.getElementById('btn-close').addEventListener('click',()=>window.electronAPI?.close());

// ── Queue collapse / expand ────────────────────────────────────────────────────
const PANEL_W      = 450;
let queueVisible   = true;
const root         = document.getElementById('root');
const iconCompress = document.getElementById('icon-compress');
const iconExpand   = document.getElementById('icon-expand');
const btnQueueToggle = document.getElementById('btn-queue-toggle');
const btnFullscreen = document.getElementById('btn-fullscreen');
const btnExitFullscreen = document.getElementById('btn-exit-fullscreen');
const btnMaximize = document.getElementById('btn-maximize');
const iconMaximize = document.getElementById('icon-maximize');
const iconRestore = document.getElementById('icon-restore');

function updateMaximizeButton(isMaximized) {
  iconMaximize.style.display = isMaximized ? 'none' : 'block';
  iconRestore.style.display = isMaximized ? 'block' : 'none';
  btnMaximize.title = isMaximized ? 'Restore' : 'Maximize';
  btnMaximize.setAttribute('aria-label', btnMaximize.title);
}

function applyFullscreenState(enabled) {
  isFullscreenMode = enabled;
  root.classList.toggle('fullscreen-mode', enabled);
  fullscreenPlayer.setAttribute('aria-hidden', String(!enabled));
  if (enabled) {
    syncFullscreenTrack();
    updateFullscreenLyrics(lyricsCurrent.textContent);
    fullscreenSeekFill.style.width = seekFill.style.width;
    fullscreenSeekThumb.style.left = seekThumb.style.left;
    fullscreenTimeCurrent.textContent = timeCur.textContent;
    fullscreenTimeTotal.textContent = timeTot.textContent;
    updatePlayBtn();
  }
}

function setFullscreenMode(enabled) {
  applyFullscreenState(enabled);
  window.electronAPI?.setFullscreen(enabled);
}

function setQueueVisible(visible, animate = true) {
  queueVisible = visible;
  root.classList.toggle('queue-collapsed', !visible);
  iconCompress.style.display = visible  ? 'block' : 'none';
  iconExpand.style.display   = !visible ? 'block' : 'none';
  btnQueueToggle.title = visible ? 'Collapse queue' : 'Expand queue';
  // Resize the actual Electron window
  const targetW = visible ? PANEL_W * 2 : PANEL_W;
  window.electronAPI?.setWidth(targetW);
}

btnQueueToggle.addEventListener('click', () => setQueueVisible(!queueVisible));

// ═══════════════════════════════════════════════════════════════════════════════
// AUDIO EVENTS
// ═══════════════════════════════════════════════════════════════════════════════
audio.addEventListener('timeupdate',updateSeek);
audio.addEventListener('loadedmetadata',()=>{timeTot.textContent=fmtTime(audio.duration);fullscreenTimeTotal.textContent=fmtTime(audio.duration);});
audio.addEventListener('ended',()=>{
  if(state.repeat===2){audio.currentTime=0;audio.play();return;}

  if(playNext(true)){
    // The queue itself was rotated by playNext, so this was a sequential advance.
  } else {
    state.isPlaying=false;
    updatePlayBtn();
    updateQueuePlayingState();
  }
});
audio.addEventListener('error',e=>{console.warn(e);const n=getNextNode();if(n&&n!==state.currentNode)playNext(state.isPlaying);});

// ═══════════════════════════════════════════════════════════════════════════════
// KEYBOARD
// ═══════════════════════════════════════════════════════════════════════════════
document.addEventListener('keydown',e=>{
  if(e.code === 'Escape' && isFullscreenMode) { e.preventDefault(); setFullscreenMode(false); return; }
  if(e.code === 'Escape' && libraryModal?.classList.contains('open')) { setLibraryModal(false); return; }
  if(e.target.tagName==='INPUT') return;
  switch(e.code){
    case 'Space':      e.preventDefault();btnPlay.click();break;
    case 'ArrowRight': e.altKey?btnNext.click():audio.duration&&(audio.currentTime=Math.min(audio.duration,audio.currentTime+5));break;
    case 'ArrowLeft':  e.altKey?btnPrev.click():audio.duration&&(audio.currentTime=Math.max(0,audio.currentTime-5));break;
    case 'ArrowUp':    e.preventDefault();setVolume(state.volume+0.05);break;
    case 'ArrowDown':  e.preventDefault();setVolume(state.volume-0.05);break;
    case 'KeyS':
      if (e.shiftKey && state.shuffle) reshuffleUpcoming();
      else btnShuffle.click();
      break;
    case 'KeyR':       btnRepeat.click();break;
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// EQUALIZER  (unchanged)
// ═══════════════════════════════════════════════════════════════════════════════
const EQ_FREQS=['60','250','1k','4k','12k'].map((_,i)=>[60,250,1000,4000,12000][i]);
const EQ_TYPES=['lowshelf','peaking','peaking','peaking','highshelf'];
const EQ_MIN=-12,EQ_MAX=12;
let eqFilters=[],eqEnabled=true,eqConnected=false;
const eqValues=[0,0,0,0,0];
function initEQ(){if(eqConnected)return;if(!state.acx)state.acx=new(window.AudioContext||window.webkitAudioContext)();const acx=state.acx;eqFilters=EQ_FREQS.map((freq,i)=>{const f=acx.createBiquadFilter();f.type=EQ_TYPES[i];f.frequency.value=freq;f.gain.value=0;f.Q.value=1.0;return f;});eqFilters.reduce((a,b)=>{a.connect(b);return b;});eqFilters[eqFilters.length-1].connect(acx.destination);acx.createMediaElementSource(audio).connect(eqFilters[0]);eqConnected=true;}
function applyEQBand(i,g){eqValues[i]=g;if(!eqConnected)initEQ();if(eqFilters[i])eqFilters[i].gain.value=eqEnabled?g:0;}
function setEQEnabled(on){eqEnabled=on;if(eqConnected)eqFilters.forEach((f,i)=>{f.gain.value=on?eqValues[i]:0;});document.getElementById('eq-panel').classList.toggle('eq-disabled',!on);}
function updateBandUI(wrap,g){const handle=wrap.querySelector('.eq-handle'),fill=wrap.querySelector('.eq-track-fill');const trackH=wrap.clientHeight-8,pct=(EQ_MAX-g)/(EQ_MAX-EQ_MIN);const handleH=handle.offsetHeight||36,usable=trackH-handleH;handle.style.top=(4+pct*usable)+'px';const pos=(1-pct)*100;if(pos>=50){fill.style.bottom='50%';fill.style.top=(100-pos)+'%';}else{fill.style.bottom=pos+'%';fill.style.top='50%';}}
function setupEQ(){
  audio.addEventListener('play',()=>{if(!eqConnected)initEQ();},{once:true});
  const bands=document.querySelectorAll('.eq-band');
  bands.forEach((band,i)=>{
    const wrap=band.querySelector('.eq-slider-wrap');
    requestAnimationFrame(()=>updateBandUI(wrap,0));
    let dragging=false,startY=0,startGain=0;
    wrap.addEventListener('mousedown',e=>{e.preventDefault();dragging=true;startY=e.clientY;startGain=eqValues[i];wrap.classList.add('dragging');if(!eqConnected)initEQ();
      const onMove=e=>{if(!dragging)return;const usable=wrap.clientHeight-8-36;const delta=(e.clientY-startY)/(usable/(EQ_MAX-EQ_MIN));applyEQBand(i,Math.max(EQ_MIN,Math.min(EQ_MAX,Math.round((startGain-delta)*2)/2)));updateBandUI(wrap,eqValues[i]);};
      const onUp=()=>{dragging=false;wrap.classList.remove('dragging');window.removeEventListener('mousemove',onMove);window.removeEventListener('mouseup',onUp);};
      window.addEventListener('mousemove',onMove);window.addEventListener('mouseup',onUp);});
    wrap.addEventListener('dblclick',()=>{applyEQBand(i,0);updateBandUI(wrap,0);});
  });
  document.getElementById('eq-toggle').addEventListener('change',e=>setEQEnabled(e.target.checked));
  document.getElementById('eq-reset').addEventListener('click',()=>{bands.forEach((band,i)=>{applyEQBand(i,0);updateBandUI(band.querySelector('.eq-slider-wrap'),0);});});
  window.addEventListener('resize',()=>{bands.forEach((band,i)=>updateBandUI(band.querySelector('.eq-slider-wrap'),eqValues[i]));});
}
setupEQ();

// ═══════════════════════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════════════════════
setVolume(0.8); renderQueue(); updateSortUI();
if(window.electronAPI) initLibrary();
else{hideLoading();console.warn('No electronAPI');}
window.addEventListener('media-play-pause',()=>btnPlay.click());
window.addEventListener('media-next',()=>btnNext.click());
window.addEventListener('media-prev',()=>btnPrev.click());
window.addEventListener('window-focus-changed', event => {
  isWindowFocused = Boolean(event.detail);
  updatePlayBtn();
});
btnFullscreen.addEventListener('click', () => setFullscreenMode(true));
btnExitFullscreen.addEventListener('click', () => setFullscreenMode(false));
document.querySelectorAll('[data-fullscreen-action]').forEach(button => button.addEventListener('click', () => {
  ({ shuffle: btnShuffle, prev: btnPrev, play: btnPlay, next: btnNext, repeat: btnRepeat }[button.dataset.fullscreenAction])?.click();
}));
window.addEventListener('fullscreen-changed', event => applyFullscreenState(Boolean(event.detail)));
btnMaximize.addEventListener('click', () => window.electronAPI?.toggleMaximize());
window.addEventListener('window-maximized-changed', event => updateMaximizeButton(Boolean(event.detail)));
