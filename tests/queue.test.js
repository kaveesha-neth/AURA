const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../src/renderer.js'), 'utf8');
function setup() {
  const context = vm.createContext({});
  const queueClass = source.slice(source.indexOf('class MusicQueue'), source.indexOf('const queue ='));
  const functions = source.slice(source.indexOf('function queueNodeNext'), source.indexOf('function getPrevNode'));
  const navigation = source.slice(source.indexOf('function findUpcomingShuffleNode'), source.indexOf('function queueNodeNext'));
  vm.runInContext(`${queueClass}
    const queue = new MusicQueue();
    const state = { currentNode: null, shuffle: false, repeat: 0, isPlaying: true };
    const shuffleState = { originalOrder: [], history: [], historyIndex: -1, remaining: new Set() };
    let libraryState, loads = 0;
    function stampOrig() {} function renderQueue() {} function renderLibraryManager() {}
    function loadNode(node, autoplay) { loads++; state.currentNode = node; }
    ${navigation}\n${functions}
    const a = queue.push({filePath:'a'}), b = queue.push({filePath:'b'});
    state.currentNode = a;
  `, context);
  return code => vm.runInContext(code, context);
}
test('Play Next preserves current playback, node identity and edited queue', () => {
  const run = setup();
  run(`queue.remove(b); addDownloadedSong({filePath:'download'}, {songs:[]}, true);`);
  assert.equal(run('state.currentNode === a && state.isPlaying && loads === 0'), true);
  assert.equal(run('queue.size'), 2);
  assert.equal(run('getNextNode().song.filePath'), 'download');
  run(`addDownloadedSong({filePath:'download'}, {songs:[]}, true);`);
  assert.equal(run('queue.size'), 2);
});
test('shuffle Play Next overrides forward history and preserves original order', () => {
  const run = setup();
  run(`state.shuffle = true; shuffleState.originalOrder = [a.id,b.id];
    shuffleState.history = [a,b]; shuffleState.historyIndex = 0;
    addDownloadedSong({filePath:'download'}, {songs:[]}, true);`);
  assert.equal(run('getNextNode().song.filePath'), 'download');
  assert.equal(run('shuffleState.originalOrder.length'), 3);
  assert.equal(run('shuffleState.history[0] === a'), true);
});
test('append respects queue order; empty queue loads paused', () => {
  const run = setup();
  run(`addDownloadedSong({filePath:'download'}, {songs:[]}, false);`);
  assert.equal(run('queue.tail.song.filePath'), 'download');
  assert.equal(run('getNextNode() === b'), true);
  run(`queue.clear(); state.currentNode = null; addDownloadedSong({filePath:'new'}, {songs:[]}, true);`);
  assert.equal(run('queue.size === 1 && loads === 1'), true);
});
