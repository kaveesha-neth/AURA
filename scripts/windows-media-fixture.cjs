// Controlled sessions for UI testing; never controls the user's actual media apps.
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
require('./volume-fixture.cjs');
const { MasterVolume } = require('../src/core/master-volume.cjs');
const volumeStart = MasterVolume.prototype.start;
MasterVolume.prototype.start = function () {
  this.state.outputs = [
    { id: 'speakers', name: 'Speakers (Realtek Audio)', isDefault: true },
    { id: 'headphones', name: 'Studio Headphones (USB Audio)', isDefault: false },
    { id: 'display', name: 'Display Audio (HDMI)', isDefault: false },
    { id: 'bluetooth', name: 'Wireless Speaker', isDefault: false },
  ]; volumeStart.call(this);
};
MasterVolume.prototype.selectOutput = function (id) { this.state.outputs = this.state.outputs.map(output => ({ ...output, isDefault: output.id === id })); this.emit('change', this.state); return Promise.resolve(true); };
class MediaFixture extends EventEmitter {
  constructor() {
    super();
    const controls = { play: true, pause: true, next: true, previous: true, seek: true, shuffle: true, repeat: true };
    this.state = { available: true, current: 'spotify', sessions: [
      { id: 'spotify', source: 'Spotify.exe', appName: 'Spotify', title: 'A quiet kind of morning', artist: 'Serein', album: 'Still Life', thumbnail: '', playing: true, position: 74, start: 0, end: 234, updatedAt: Date.now(), shuffle: false, repeat: 0, controls },
      { id: 'browser', source: 'chrome.exe', appName: 'Google Chrome', title: 'The art of slowing down', artist: 'Sunday Studio · YouTube', thumbnail: '', playing: false, position: 182, start: 0, end: 1200, updatedAt: Date.now(), shuffle: false, repeat: 0, controls: { ...controls, shuffle: false, repeat: false, next: false } },
      { id: 'podcast', source: 'podcast.exe', appName: 'Podcasts', title: 'Notes from the creative process', artist: 'Episode 28 · The Open Studio', thumbnail: '', playing: false, position: 810, start: 0, end: 3100, updatedAt: Date.now(), controls },
      ...Array.from({ length: 5 }, (_, index) => ({ id: `other-${index}`, source: 'player.exe', appName: 'Media Player', title: `Listening session ${index + 1}`, artist: 'Your media library', thumbnail: '', playing: false, position: 0, start: 0, end: 180, updatedAt: Date.now(), controls })),
    ] };
    const covers = fs.readdirSync(path.join(__dirname, '../data/covers')).filter(file => file.endsWith('.jpg'));
    this.state.sessions.slice(0, 3).forEach((session, index) => { if (covers[index]) session.thumbnail = 'data:image/jpeg;base64,' + fs.readFileSync(path.join(__dirname, '../data/covers', covers[index])).toString('base64'); });
    global.__mediaFixture = this;
  }
  start() {}
  stop() {}
  command(command) {
    global.__mediaCommands ||= []; global.__mediaCommands.push(command);
    const session = this.state.sessions.find(item => item.id === command.sessionId);
    if (!session || !session.controls[command.action]) return Promise.resolve(false);
    if (command.action === 'play') session.playing = true;
    if (command.action === 'pause') session.playing = false;
    if (command.action === 'seek') session.position = command.value;
    if (command.action === 'shuffle') session.shuffle = !session.shuffle;
    if (command.action === 'repeat') session.repeat = ((session.repeat || 0) + 1) % 3;
    session.updatedAt = Date.now(); this.emit('change', this.state); return Promise.resolve(true);
  }
}
require('../src/core/windows-media.cjs');
require.cache[require.resolve('../src/core/windows-media.cjs')].exports = { WindowsMedia: MediaFixture };

// Deterministic LRCLIB responses exercise the real IPC/cache/parser without network.
const originalFetch = global.fetch;
global.__lyricsRequests = [];
global.fetch = async (url, options) => {
  if (!String(url).startsWith('https://lrclib.net/')) return originalFetch(url, options);
  const query = new URL(url);
  const title = query.searchParams.get('track_name') || query.searchParams.get('q') || '';
  global.__lyricsRequests.push(title);
  if (title.includes('Delayed track')) await new Promise(resolve => { global.__releaseLyrics = resolve; });
  if (title.includes('Failed track')) return { ok: false, status: 503 };
  if (title.includes('Missing track')) return query.pathname.endsWith('/search')
    ? { ok: true, json: async () => [] } : { ok: false, status: 404 };
  return { ok: true, json: async () => ({ instrumental: title.includes('Instrumental track'),
    syncedLyrics: '[00:00]Opening line\n[01:10]Previous line\n[01:15]Current line\n[01:20]Upcoming line\n[01:30]After the quiet\n[03:20]Final line' }) };
};
