const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { WindowsMedia } = require('../src/core/windows-media.cjs');
function fixture(t) {
  const child = new EventEmitter(); child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.kill = () => {};
  let text = ''; child.stdin.on('data', value => { text += value; });
  const service = new WindowsMedia({ platform: 'win32', launch: (exe, args, options) => { assert.match(exe, /AuraMediaBridge\.exe$/); assert.deepEqual(args, []); assert.equal(options.windowsHide, true); return child; } });
  service.start(); t.after(() => service.stop());
  return { service, child, send: value => child.stdout.write(JSON.stringify(value) + '\n'), commands: () => text.trim() ? text.trim().split('\n').map(JSON.parse) : [] };
}
const session = { id: 'session-a', appName: 'Player', title: 'Song', start: 0, end: 100, controls: { play: true, pause: true, seek: true, next: false } };
test('Windows sessions are validated and commands target the chosen session', async t => {
  const f = fixture(t);
  f.send({ available: true, current: 'session-a', sessions: [session, { id: 'invalid' }] });
  assert.equal(f.service.state.sessions.length, 1);
  assert.equal(await f.service.command({ sessionId: 'session-a', action: 'next' }), false);
  assert.equal(await f.service.command({ sessionId: 'missing', action: 'play' }), false);
  assert.equal(await f.service.command({ sessionId: 'session-a', action: 'seek', value: 101 }), false);
  assert.equal(await f.service.command({ sessionId: 'session-a', action: 'seek', value: NaN }), false);
  const response = f.service.command({ sessionId: 'session-a', action: 'seek', value: 40 });
  const command = f.commands()[0];
  assert.equal(command.sessionId, 'session-a'); assert.equal(command.value, 40);
  f.send({ reply: command.requestId, ok: true }); assert.equal(await response, true);
});
test('Closed sessions cannot receive controls; pending controls resolve on shutdown', async t => {
  const f = fixture(t); f.send({ available: true, current: '', sessions: [session] });
  const response = f.service.command({ sessionId: 'session-a', action: 'play' });
  f.service.stop(); assert.equal(await response, false);
});
test('Windows media is unavailable on other operating systems', () => {
  const service = new WindowsMedia({ platform: 'linux', launch: () => { throw Error('Unexpected process'); } });
  service.start(); assert.equal(service.state.available, false); service.stop();
});
test('Native bridge diagnostics retain the actual failure and missing helper state', t => {
  const f = fixture(t); const diagnostics = [];
  f.service.on('diagnostic', message => diagnostics.push(message));
  f.child.stderr.write('Connect Windows media: UnauthorizedAccessException (0x80070005)\n');
  assert.match(diagnostics[0], /0x80070005/);
  const error = Object.assign(new Error('Helper file missing'), { code: 'ENOENT' });
  f.child.emit('error', error);
  assert.equal(f.service.state.error, 'bridge-missing');
  assert.match(f.service.state.diagnostic, /ENOENT/);
});
