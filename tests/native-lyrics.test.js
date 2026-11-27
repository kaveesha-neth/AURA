const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../src/renderer.js'), 'utf8');
const lyricsSource = source.slice(source.indexOf('function plainLyricsToTimedLines'), source.indexOf('// COVER'));

async function setup(getLyrics) {
  const domain = await import('../src/core/lyrics.mjs');
  const snapshots = [];
  const context = vm.createContext({
    console, parseLRC: domain.parseLRC,
    window: { AuraDomain: domain, electronAPI: { getLyrics }, auraLyricsRender: value => snapshots.push(value) },
  });
  vm.runInContext(`
    const state = { currentNode: { song: {filePath:'a'} }, lyrics: {requestId:0,lines:[],activeIndex:-1,type:'none'} };
    const audio = {currentTime:0,duration:30};
    const element = () => ({textContent:'',classList:{add(){},remove(){},toggle(){}}});
    const lyricsOverlay=element(),lyricsPrev=element(),lyricsCurrent=element(),lyricsNext=element(),lyricsStatus=element();
    const fullscreenLyrics=[];
    ${lyricsSource}
  `, context);
  return { run: code => vm.runInContext(code, context), snapshots };
}

test('native lyrics publish state, share lookup and ignore unchanged playback ticks', async () => {
  let calls = 0;
  const { run, snapshots } = await setup(async () => { calls++; return { syncedLyrics: '[00:00]First\n[00:10]Next' }; });
  await run(`loadLyricsForSong(state.currentNode.song)`);
  assert.equal(snapshots.at(-1).track, 'a');
  assert.equal(snapshots.at(-1).type, 'synced');
  assert.equal(snapshots.at(-1).activeIndex, 0);
  const count = snapshots.length;
  run(`updateLyricsOverlay(1);updateLyricsOverlay(2)`);
  assert.equal(snapshots.length, count);
  run(`updateLyricsOverlay(12)`);
  assert.equal(snapshots.at(-1).activeIndex, 1);
  run(`updateLyricsOverlay(0)`);
  assert.equal(snapshots.at(-1).activeIndex, 0);
  assert.equal(calls, 1);
});

test('late native lyrics cannot replace a new track or complete its loading state', async () => {
  const pending = [];
  const { run, snapshots } = await setup(() => new Promise(resolve => pending.push(resolve)));
  const first = run(`loadLyricsForSong(state.currentNode.song)`);
  const second = run(`state.currentNode={song:{filePath:'b'}};loadLyricsForSong(state.currentNode.song)`);
  pending[0]({ syncedLyrics: '[00:00]Old' });
  await first;
  assert.equal(run('state.lyrics.loading'), true);
  assert.equal(snapshots.at(-1).message, 'Finding lyrics…');
  pending[1]({ syncedLyrics: '[00:00]New' });
  await second;
  assert.equal(snapshots.at(-1).track, 'b');
  assert.equal(snapshots.at(-1).lines[0].text, 'New');
});

test('clearing playback invalidates a pending native lyrics response', async () => {
  let complete;
  const { run, snapshots } = await setup(() => new Promise(resolve => { complete = resolve; }));
  const request = run(`loadLyricsForSong(state.currentNode.song)`);
  run(`state.currentNode=null;resetLyricsOverlay()`);
  complete({ syncedLyrics: '[00:00]Too late' });
  await request;
  assert.equal(run('state.lyrics.lines.length'), 0);
  assert.equal(run('state.lyrics.loading'), false);
  assert.equal(snapshots.at(-1).track, '');
  assert.equal(snapshots.at(-1).message, 'No track selected');
});

test('native lyrics distinguish plain text, instrumentals, failures and missing results', async () => {
  for (const [payload, type, message] of [
    [{plainLyrics:'Untimed first\nUntimed second'}, 'plain', ''],
    [{instrumental:true}, 'none', 'Instrumental'],
    [{status:'error'}, 'none', 'Lyrics unavailable'],
    [{status:'not_found'}, 'none', 'No lyrics found'],
  ]) {
    const { run, snapshots } = await setup(async () => payload);
    await run(`loadLyricsForSong(state.currentNode.song)`);
    assert.equal(snapshots.at(-1).type, type);
    assert.equal(snapshots.at(-1).message, message);
    if (type === 'plain') assert.equal(snapshots.at(-1).activeIndex, -1);
  }
});
