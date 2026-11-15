const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { MasterVolume } = require('../src/core/master-volume.cjs');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function fixture(t) {
  const child = new EventEmitter();
  child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
  child.kill = () => { child.killed = true; };
  let commands = '';
  child.stdin.on('data', value => { commands += value; });
  const bridge = new MasterVolume({ platform: 'win32', launch: (exe, args, options) => {
    assert.equal(options.windowsHide, true);
    assert.ok(args.includes('-NoProfile'));
    assert.match(args.at(-1), /master-volume\.ps1$/);
    return child;
  } });
  bridge.start();
  t.after(() => bridge.stop());
  return { bridge, child, commands: () => commands, state: value => child.stdout.write(JSON.stringify(value) + '\n') };
}
test('master volume accepts validated native state and disables when unavailable', t => {
  const f = fixture(t);
  f.state({ available: true, volume: .42, muted: true });
  assert.deepEqual(f.bridge.state, { available: true, volume: .42, muted: true });
  f.child.stdout.write('invalid startup text\n');
  f.state({ available: true, volume: 7, muted: false });
  assert.equal(f.bridge.state.volume, .42);
  f.state({ available: false });
  assert.equal(f.bridge.state.available, false);
  f.bridge.setVolume(.3);
  assert.equal(f.commands(), '');
});
test('master volume coalesces slider movement, clamps values and orders mute', async t => {
  const f = fixture(t);
  f.state({ available: true, volume: .42, muted: false });
  f.bridge.setVolume(NaN); f.bridge.setVolume('0.5');
  f.bridge.setVolume(.1); f.bridge.setVolume(.2); f.bridge.setVolume(2);
  await delay(50);
  assert.equal(f.commands(), 'volume:1\n');
  f.bridge.setVolume(-1); f.bridge.toggleMute();
  assert.equal(f.commands(), 'volume:1\nvolume:0\nmute:toggle\n');
});
test('master volume stops its process and pending writes on shutdown', async t => {
  const f = fixture(t);
  f.state({ available: true, volume: .42, muted: false });
  f.bridge.setVolume(.9); f.bridge.stop();
  await delay(50);
  assert.equal(f.commands(), '');
  assert.equal(f.child.killed, true);
});
test('master volume helper is Windows only', () => {
  const bridge = new MasterVolume({ platform: 'linux', launch: () => { throw Error('Unexpected helper'); } });
  bridge.start(); assert.equal(bridge.state.available, false); bridge.stop();
});
test('audio output switching accepts discovered endpoints and confirms native state', async t => {
  const f = fixture(t);
  f.state({ available: true, volume: .42, muted: false, outputs: [{ id: 'device-a', name: 'Speakers', isDefault: false }] });
  assert.equal(await f.bridge.selectOutput('unknown'), false);
  assert.equal(await f.bridge.selectOutput('device-a\nvolume:1'), false);
  const selected = f.bridge.selectOutput('device-a');
  assert.equal(f.commands(), 'output:device-a\n');
  f.state({ available: true, volume: .42, muted: false, outputs: [{ id: 'device-a', name: 'Speakers', isDefault: true }] });
  assert.equal(await selected, true);
});
