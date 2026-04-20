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

  randomExcept(exclude) {
    const arr = this.toArray().filter(n => n !== exclude);
    return arr.length ? arr[Math.floor(Math.random() * arr.length)] : exclude;
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
const state = {
  currentNode: null,
  isPlaying:   false,
  shuffle:     false,
  repeat:      0,
  volume:      0.8,
  seeking:     false,
  waveData:    [],
  acx:         null,
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
const playerBg     = document.getElementById('player-bg');
const songTitle    = document.getElementById('song-title');
const songArtist   = document.getElementById('song-artist');
const songAlbum    = document.getElementById('song-album');
const waveCanvas   = document.getElementById('waveform-canvas');
const waveCtx      = waveCanvas.getContext('2d');
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

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════
const fmtTime = s => (!s||isNaN(s)||!isFinite(s)) ? '0:00' : `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;
const esc     = s => (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const toUrl   = fp => { if(!fp)return''; const n=fp.replace(/\\/g,'/'); return n.startsWith('/')?`file://${n}`:`file:///${n}`; };
const showLoading = t => { loadingText.textContent=t||'Loading…'; loadingOverlay.style.opacity='1'; loadingOverlay.style.pointerEvents='all'; };
const hideLoading = () => { loadingOverlay.style.opacity='0'; loadingOverlay.style.pointerEvents='none'; };

// ═══════════════════════════════════════════════════════════════════════════════
// WAVEFORM
// ═══════════════════════════════════════════════════════════════════════════════
function resizeCanvas() {
  waveCanvas.width  = waveCanvas.offsetWidth  * (window.devicePixelRatio||1);
  waveCanvas.height = waveCanvas.offsetHeight * (window.devicePixelRatio||1);
  drawWave(audio.duration ? audio.currentTime/audio.duration : 0);
}
function drawWave(p) {
  const dpr=window.devicePixelRatio||1, W=waveCanvas.width, H=waveCanvas.height;
  waveCtx.clearRect(0,0,W,H);
  const bars=Math.floor(W/dpr/3.5), bW=2*dpr, gap=1.5*dpr;
  for(let i=0;i<bars;i++){
    const pct=i/bars;
    const amp=state.waveData.length?(state.waveData[Math.floor(pct*state.waveData.length)]||0):0.2+0.4*Math.abs(Math.sin(i*0.37+i*i*0.003));
    const bH=Math.max(2*dpr,amp*H*0.78), x=i*(bW+gap), y=(H-bH)/2;
    waveCtx.fillStyle=pct<=p?`rgba(167,139,250,${0.55+pct*0.45})`:`rgba(255,255,255,${0.06+amp*0.08})`;
    waveCtx.beginPath(); waveCtx.roundRect(x,y,bW,bH,bW/2); waveCtx.fill();
  }
}
async function extractWaveform(url) {
  state.waveData=[];
  try {
    if(!state.acx) state.acx=new(window.AudioContext||window.webkitAudioContext)();
    const buf=await(await fetch(url)).arrayBuffer();
    const decoded=await state.acx.decodeAudioData(buf);
    const raw=decoded.getChannelData(0), samples=140, step=Math.floor(raw.length/samples);
    state.waveData=Array.from({length:samples},(_,i)=>{let s=0;for(let j=0;j<step;j++)s+=Math.abs(raw[i*step+j]||0);return Math.min(1,(s/step)*5.5);});
    drawWave(audio.duration?audio.currentTime/audio.duration:0);
  } catch {
    state.waveData=Array.from({length:140},(_,i)=>0.15+0.55*Math.abs(Math.sin(i*0.41+Math.sin(i*0.13)*2)));
    drawWave(audio.duration?audio.currentTime/audio.duration:0);
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
    coverImg.onload=()=>extractAccent(coverImg);
    coverImg.onerror=()=>{coverImg.style.display='none';coverPh.style.display='flex';};
  } else {
    coverImg.style.display='none'; coverPh.style.display='flex';
    playerBg.style.background='radial-gradient(ellipse 70% 60% at 50% 30%, rgba(167,139,250,0.06) 0%, transparent 70%)';
    coverGlow.style.background='radial-gradient(circle, rgba(167,139,250,0.25) 0%, transparent 65%)';
  }
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
  state.currentNode=node; state.waveData=[]; drawWave(0);
  animateInfo(node.song); setCover(node.song.coverPath); coverWrap.classList.add('has-song');updateMediaSession(node.song);
  updateMediaSession(node.song);
  coverCont.style.animation='none'; void coverCont.offsetHeight; coverCont.style.animation='';
  const url=toUrl(node.song.filePath);
  audio.src=url; audio.load();
  seekFill.style.width='0%'; seekThumb.style.left='0%'; timeCur.textContent='0:00'; timeTot.textContent='—';
  renderQueue();
  if(autoplay){
    try{await audio.play();state.isPlaying=true;}catch(e){console.error(e);state.isPlaying=false;}
    updatePlayBtn(); triggerRipple();
  }
  extractWaveform(url);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PLAYBACK HELPERS
// ═══════════════════════════════════════════════════════════════════════════════
function updatePlayBtn() {
  iconPlay.style.display=state.isPlaying?'none':'block';
  iconPause.style.display=state.isPlaying?'block':'none';
  if(state.isPlaying){coverCont.classList.remove('spinning-paused');coverCont.classList.add('playing');}
  else{coverCont.classList.remove('playing');coverCont.classList.add('spinning-paused');}
}
function triggerRipple(){btnPlay.classList.remove('rippling');void btnPlay.offsetHeight;btnPlay.classList.add('rippling');setTimeout(()=>btnPlay.classList.remove('rippling'),500);}
function setVolume(v){state.volume=Math.max(0,Math.min(1,v));audio.volume=state.volume;const p=v*100;volFill.style.width=p+'%';volThumb.style.left=p+'%';volLabel.textContent=Math.round(p);}
function updateSeek(){if(!audio.duration||state.seeking)return;const p=audio.currentTime/audio.duration;seekFill.style.width=p*100+'%';seekThumb.style.left=p*100+'%';timeCur.textContent=fmtTime(audio.currentTime);drawWave(p);updateMediaPosition();updateMediaPosition();}

// ═══════════════════════════════════════════════════════════════════════════════
// NAVIGATION  — pure pointer traversal, zero index arithmetic
// ═══════════════════════════════════════════════════════════════════════════════
function getNextNode(){
  if(!state.currentNode) return queue.head;
  if(state.shuffle)      return queue.randomExcept(state.currentNode);
  if(state.currentNode.next) return state.currentNode.next;
  return state.repeat===1 ? queue.head : null;
}
function getPrevNode(){
  if(audio.currentTime>3) return state.currentNode;
  if(!state.currentNode)  return queue.tail;
  if(state.shuffle)       return queue.randomExcept(state.currentNode);
  if(state.currentNode.prev) return state.currentNode.prev;
  return state.repeat===1 ? queue.tail : state.currentNode;
}

// ═══════════════════════════════════════════════════════════════════════════════
// REMOVE NODE
// ═══════════════════════════════════════════════════════════════════════════════
function removeNode(node) {
  if(!node) return;
  const wasCurrent = node===state.currentNode;
  const fallback   = node.next || node.prev;
  queue.remove(node);
  if(wasCurrent){
    if(!queue.size){
      audio.pause(); audio.src=''; state.isPlaying=false; state.currentNode=null;
      songTitle.textContent='No track loaded'; songArtist.textContent='Add songs to get started';
      songAlbum.textContent=''; setCover(null); coverWrap.classList.remove('has-song'); updatePlayBtn();
    } else loadNode(fallback, state.isPlaying);
  }
  renderQueue();
}

// ═══════════════════════════════════════════════════════════════════════════════
// RENDER QUEUE
// ═══════════════════════════════════════════════════════════════════════════════
let searchQuery='';
function renderQueue() {
  qCount.textContent=queue.size;
  if(!queue.size){
    queueList.innerHTML=`<div class="q-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>Drop songs into the <strong>songs/</strong> folder<br>then click Rescan — or use + Files / + Folder</div>`;
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
      if(node){loadNode(node,true);state.isPlaying=true;updatePlayBtn();}
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

  const active=queueList.querySelector('.q-item.active');
  if(active) active.scrollIntoView({block:'nearest',behavior:'smooth'});

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

        dragEl = null; dragNode = null; insertBeforeId = null;
        renderQueue();
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup',   onUp);
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// LIBRARY LOADING
// ═══════════════════════════════════════════════════════════════════════════════
async function initLibrary() {
  showLoading('Scanning songs folder…');
  try {
    const {songs,songsDir}=await window.electronAPI.scanLibrary();
    (songs||[]).forEach(s=>queue.push(s));
    renderQueue();
    if(queue.head) loadNode(queue.head,false);
    hideLoading(); console.log(`Loaded ${queue.size} songs from ${songsDir}`);
  } catch(e){console.error(e);hideLoading();renderQueue();}
}

async function doRescan() {
  showLoading('Rescanning…');
  try {
    const prevPath=state.currentNode?.song?.filePath;
    const {songs}=await window.electronAPI.rescanLibrary();
    queue.clear(); state.currentNode=null;
    (songs||[]).forEach(s=>queue.push(s));
    if(prevPath){ const r=queue.toArray().find(n=>n.song.filePath===prevPath); if(r) state.currentNode=r; }
    renderQueue(); hideLoading();
  } catch(e){console.error(e);hideLoading();}
}

async function addSongs(arr) {
  if(!arr?.length) return;
  const wasEmpty=queue.size===0;
  arr.forEach(s=>queue.push(s));
  renderQueue();
  if(wasEmpty&&queue.head) loadNode(queue.head,false);
}

async function addFiles(){showLoading('Scanning…');try{await addSongs(await window.electronAPI.openAndScan());}catch(e){console.error(e);}hideLoading();}
async function addFolder(){showLoading('Scanning folder…');try{await addSongs(await window.electronAPI.openFolder());}catch(e){console.error(e);}hideLoading();}

// File drop onto window
document.addEventListener('dragover',e=>{if(e.dataTransfer.types.includes('Files')){e.preventDefault();e.stopPropagation();}});
document.addEventListener('drop',async e=>{
  if(!e.dataTransfer.files.length) return;
  e.preventDefault();
  const paths=[...e.dataTransfer.files].map(f=>f.path).filter(Boolean);
  if(!paths.length) return;
  showLoading(`Scanning ${paths.length} file${paths.length>1?'s':''}…`);
  try{await addSongs(await window.electronAPI.addPaths(paths));}catch(e){console.error(e);}
  hideLoading();
});

// ═══════════════════════════════════════════════════════════════════════════════
// CONTROLS
// ═══════════════════════════════════════════════════════════════════════════════
btnPlay.addEventListener('click',async()=>{
  if(!queue.size) return;
  if(!state.currentNode){await loadNode(queue.head,true);return;}
  if(state.isPlaying){audio.pause();state.isPlaying=false;}
  else{try{await audio.play();state.isPlaying=true;triggerRipple();}catch{}}
  updatePlayBtn(); renderQueue();
});
btnPrev.addEventListener('click',()=>{const n=getPrevNode();if(n)loadNode(n,state.isPlaying);});
btnNext.addEventListener('click',()=>{const n=getNextNode();if(n)loadNode(n,state.isPlaying);});
btnShuffle.addEventListener('click',()=>{state.shuffle=!state.shuffle;btnShuffle.classList.toggle('active',state.shuffle);});
btnRepeat.addEventListener('click',()=>{
  state.repeat=(state.repeat+1)%3;
  btnRepeat.classList.toggle('active',state.repeat>0);
  iconRepAll.style.display=state.repeat===2?'none':'block';
  iconRepOne.style.display=state.repeat===2?'block':'none';
  btnRepeat.title=['Repeat off','Repeat all','Repeat one'][state.repeat];
});

function seekTo(e){if(!audio.duration)return;const r=seekTrack.getBoundingClientRect();const p=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width));audio.currentTime=p*audio.duration;seekFill.style.width=p*100+'%';seekThumb.style.left=p*100+'%';drawWave(p);}
seekTrack.addEventListener('mousedown',e=>{state.seeking=true;seekTo(e);const up=()=>{state.seeking=false;window.removeEventListener('mousemove',seekTo);window.removeEventListener('mouseup',up);};window.addEventListener('mousemove',seekTo);window.addEventListener('mouseup',up);});
waveCanvas.addEventListener('click',e=>{if(!audio.duration)return;const r=waveCanvas.getBoundingClientRect();const p=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width));audio.currentTime=p*audio.duration;drawWave(p);});

function setVolFromEvent(e){const r=volTrack.getBoundingClientRect();setVolume(Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)));}
volTrack.addEventListener('mousedown',e=>{setVolFromEvent(e);const up=()=>{window.removeEventListener('mousemove',setVolFromEvent);window.removeEventListener('mouseup',up);};window.addEventListener('mousemove',setVolFromEvent);window.addEventListener('mouseup',up);});
document.getElementById('vol-icon').addEventListener('click',()=>{if(state.volume>0){state._vol=state.volume;setVolume(0);}else setVolume(state._vol||0.8);});

btnAddFiles.addEventListener('click',addFiles); btnAddFolder.addEventListener('click',addFolder); btnRescan.addEventListener('click',doRescan);
btnClear.addEventListener('click',()=>{
  audio.pause();audio.src='';state.isPlaying=false;state.currentNode=null;queue.clear();
  songTitle.textContent='No track loaded';songArtist.textContent='Add songs to get started';songAlbum.textContent='';
  setCover(null);coverWrap.classList.remove('has-song');updatePlayBtn();renderQueue();
  seekFill.style.width='0%';seekThumb.style.left='0%';timeCur.textContent='0:00';timeTot.textContent='0:00';drawWave(0);
});
qSearch.addEventListener('input',()=>{searchQuery=qSearch.value.toLowerCase().trim();renderQueue();});
document.getElementById('btn-min').addEventListener('click',()=>window.electronAPI?.minimize());
document.getElementById('btn-close').addEventListener('click',()=>window.electronAPI?.close());

// ── Queue collapse / expand ────────────────────────────────────────────────────
const PANEL_W      = 450;
let queueVisible   = true;
const root         = document.getElementById('root');
const iconCompress = document.getElementById('icon-compress');
const iconExpand   = document.getElementById('icon-expand');
const btnQueueToggle = document.getElementById('btn-queue-toggle');

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
audio.addEventListener('loadedmetadata',()=>{timeTot.textContent=fmtTime(audio.duration);});
audio.addEventListener('ended',()=>{
  if(state.repeat===2){audio.currentTime=0;audio.play();return;}
  const n=getNextNode(); if(n)loadNode(n,true); else{state.isPlaying=false;updatePlayBtn();renderQueue();}
});
audio.addEventListener('error',e=>{console.warn(e);const n=getNextNode();if(n&&n!==state.currentNode)loadNode(n,state.isPlaying);});

// ═══════════════════════════════════════════════════════════════════════════════
// KEYBOARD
// ═══════════════════════════════════════════════════════════════════════════════
document.addEventListener('keydown',e=>{
  if(e.target.tagName==='INPUT') return;
  switch(e.code){
    case 'Space':      e.preventDefault();btnPlay.click();break;
    case 'ArrowRight': e.altKey?btnNext.click():audio.duration&&(audio.currentTime=Math.min(audio.duration,audio.currentTime+5));break;
    case 'ArrowLeft':  e.altKey?btnPrev.click():audio.duration&&(audio.currentTime=Math.max(0,audio.currentTime-5));break;
    case 'ArrowUp':    e.preventDefault();setVolume(state.volume+0.05);break;
    case 'ArrowDown':  e.preventDefault();setVolume(state.volume-0.05);break;
    case 'KeyS':       btnShuffle.click();break;
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
window.addEventListener('resize',resizeCanvas);
setTimeout(resizeCanvas,80);
setVolume(0.8); drawWave(0); renderQueue();
if(window.electronAPI) initLibrary();
else{hideLoading();console.warn('No electronAPI');}
window.addEventListener('media-play-pause',()=>btnPlay.click());
window.addEventListener('media-next',()=>btnNext.click());
window.addEventListener('media-prev',()=>btnPrev.click());
