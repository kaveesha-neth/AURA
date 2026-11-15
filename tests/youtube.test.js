const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createYouTubeService, runProcess, formatProcessFailure } = require('../youtube');
const id = 'abcDEF12_-3';

async function fixture(t, handler) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aura-test-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const calls = [];
  const service = createYouTubeService({ downloadDir: dir, resolveExecutable: async command => command, run: async (command, args, options) => {
    calls.push({ command, args });
    if (args.includes('--version') || args.includes('-version')) return 'version';
    return handler(command, args, options);
  } });
  return { dir, calls, service };
}
test('search is bounded, treats query as data, and filters invalid/live results', async t => {
  const { service, calls } = await fixture(t, async () => JSON.stringify({ entries: [
    { id, title: '<img onerror=bad>', uploader: 'Artist', duration: 180 }, { id: '--bad' }, { id, is_live: true },
  ] }));
  await assert.rejects(service.search(''), /Enter a song/);
  const results = await service.search('song & calc.exe');
  assert.equal(results.length, 1);
  assert.equal(results[0].title, '<img onerror=bad>');
  assert.deepEqual(calls.at(-1).args.slice(-2), ['--', 'ytsearch8:song & calc.exe']);
  assert.ok(calls.at(-1).args.includes('--ignore-config'));
});
test('YouTube Music searches the Songs catalog with an encoded query and bounded results', async t => {
  const { service, calls } = await fixture(t, async () => JSON.stringify({ entries: [{ id, title: 'Song' }] }));
  const result = await service.search('song & artist #1', 'music');
  assert.equal(result[0].title, 'Song');
  const args = calls.at(-1).args;
  assert.equal(args.at(-1), 'https://music.youtube.com/search?q=song%20%26%20artist%20%231#songs');
  assert.equal(args[args.indexOf('--playlist-end') + 1], '8');
  await assert.rejects(service.search('song', 'invalid'), /Choose YouTube/);
});
test('disk-full conversion errors explain how to recover without unrelated advice', () => {
  const error = formatProcessFailure('yt-dlp', 1, 'Error writing trailer: No space left on device\nERROR: Postprocessing: Conversion failed!');
  assert.match(error, /Not enough free disk space/);
  assert.match(error, /Free space/);
  assert.doesNotMatch(error, /Deno|Unknown encoder/);
});
test('download stages M4A with metadata and JPEG cover art, reports progress and reuses completed file', async t => {
  const { service, dir, calls } = await fixture(t, async (command, args, options) => {
    options.onLine('AURA: 45.2%');
    options.onLine('[ExtractAudio] Destination');
    options.onLine('[Metadata] Adding metadata');
    options.onLine('[EmbedThumbnail] Embedding thumbnail');
    await fs.writeFile(args[args.indexOf('--output') + 1].replace('%(ext)s', 'm4a'), 'audio fixture');
  });
  const progress = [];
  const destination = await service.download(id, value => progress.push(value));
  assert.equal(destination, path.join(dir, `${id}.m4a`));
  assert.ok(progress.includes('Downloading audio · 45%'));
  assert.ok(progress.includes('Converting audio…'));
  assert.ok(progress.includes('Embedding song metadata…'));
  assert.ok(progress.includes('Preparing and embedding cover art…'));
  const args = calls.find(call => call.args.includes('--output')).args;
  assert.equal(args[args.indexOf('-f') + 1], 'bestaudio');
  assert.ok(args.includes('--extract-audio'));
  assert.equal(args[args.indexOf('--audio-format') + 1], 'm4a');
  assert.equal(args[args.indexOf('--audio-quality') + 1], '0');
  assert.ok(args.includes('--embed-metadata'));
  assert.ok(args.includes('--embed-thumbnail'));
  assert.equal(args[args.indexOf('--convert-thumbnails') + 1], 'jpg');
  assert.equal(args.at(-1), `https://music.youtube.com/watch?v=${id}`);
  assert.deepEqual(await fs.readdir(dir), [`${id}.m4a`]);
  await service.download(id);
  assert.equal(calls.filter(call => call.args.includes('--output')).length, 1);
  await assert.rejects(service.download('https://example.com'), /valid YouTube result/);
});
test('failed download leaves no partial file and retry succeeds', async t => {
  let fail = true;
  const { service, dir } = await fixture(t, async (command, args) => {
    await fs.writeFile(args[args.indexOf('--output') + 1].replace('%(ext)s', 'm4a'), 'partial');
    if (fail) throw new Error('network failed');
  });
  await assert.rejects(service.download(id), /network failed/);
  assert.deepEqual(await fs.readdir(dir), []);
  fail = false;
  await service.download(id);
});
test('operations reject overlap and can be cancelled', async t => {
  const { service } = await fixture(t, async (command, args, { signal }) => {
    await new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true }));
  });
  const pending = service.search('song');
  await new Promise(resolve => setImmediate(resolve));
  await assert.rejects(service.search('other'), /already running/);
  service.cancel();
  await assert.rejects(pending, /cancelled/);
});
test('missing FFmpeg prevents starting a download', async () => {
  const service = createYouTubeService({ downloadDir: os.tmpdir(), resolveExecutable: async command => command, run: async command => {
    if (command === 'ffmpeg') throw new Error('ffmpeg was not found. Install it and restart AURA.');
    assert.equal(command, 'yt-dlp');
    return 'version';
  } });
  await assert.rejects(service.download(id), /ffmpeg was not found/);
});
test('malformed search and missing output fail clearly and release the operation', async t => {
  const { service, dir } = await fixture(t, async () => 'bad json');
  await assert.rejects(service.search('song'), /unreadable response/);
  await assert.rejects(service.download(id), /did not produce an M4A/);
  assert.deepEqual(await fs.readdir(dir), []);
});
test('real process wrapper handles missing tools, failure, timeout and cancellation', async () => {
  await assert.rejects(runProcess('aura-nonexistent-tool-12345', []), /not found.*PATH/);
  await assert.rejects(runProcess(process.execPath, ['-e', 'process.stderr.write("fixture error");process.exit(1)']), /fixture error/);
  await assert.rejects(runProcess(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { timeout: 50 }), /timed out/);
  const controller = new AbortController();
  const pending = runProcess(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, /cancelled/);
});

test('conversion errors preserve FFmpeg detail without unrelated runtime advice', () => {
  const error = formatProcessFailure('yt-dlp', 1, '[debug] ffmpeg command line: ffmpeg -i audio.webm\nUnknown encoder libmp3lame\nERROR: Postprocessing: Conversion failed!\nTraceback (most recent call last):\nnoisy stack');
  assert.match(error, /FFmpeg could not convert/);
  assert.match(error, /Unknown encoder libmp3lame/);
  assert.doesNotMatch(error, /noisy stack|install Deno|check your connection/);
});

test('tool checks verify AAC encoding for M4A and report individual failures', async () => {
  const service = createYouTubeService({ downloadDir: os.tmpdir(), resolveExecutable: async command => command,
    run: async (command, args) => {
      if (args.includes('aac')) throw new Error('Unknown encoder aac');
      return `${command} version test\nmore detail`;
    } });
  const tools = await service.checkTools();
  assert.equal(tools.length, 4);
  assert.equal(tools.find(tool => tool.name === 'ffmpeg').ok, false);
  assert.match(tools.find(tool => tool.name === 'ffmpeg').error, /Unknown encoder/);
  assert.equal(tools.find(tool => tool.name === 'yt-dlp').ok, true);
});

test('download explicitly selects the same FFmpeg directory that preflight checked', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aura-ffmpeg-test-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const executable = path.join(dir, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
  const calls = [];
  const service = createYouTubeService({ downloadDir: dir, resolveExecutable: async () => executable,
    run: async (command, args) => {
      calls.push({ command, args });
      if (args.includes('--output')) await fs.writeFile(args[args.indexOf('--output') + 1].replace('%(ext)s', 'm4a'), 'audio fixture');
      return 'version';
    } });
  await service.download(id);
  assert.ok(calls.some(call => call.command === executable && call.args.includes('-version')));
  const download = calls.find(call => call.args.includes('--output'));
  assert.equal(download.args[download.args.indexOf('--ffmpeg-location') + 1], dir);
  assert.ok(download.args.includes('--verbose'));
});
