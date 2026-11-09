'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');

// No shell, user-controlled flags, URLs, or output paths cross this boundary.
function createYouTubeService({ downloadDir, run = runProcess, resolveExecutable = findExecutable }) {
  let busy = false;
  let controller;
  const base = ['--ignore-config', '--no-playlist', '--no-colors', '--socket-timeout', '20', '--retries', '2'];
  async function exclusive(task) {
    if (busy) throw new Error('A YouTube operation is already running. Wait or cancel it first.');
    busy = true;
    controller = new AbortController();
    try { return await task(controller.signal); }
    finally { busy = false; controller = null; }
  }
  async function check(signal, audio) {
    await run('yt-dlp', ['--ignore-config', '--version'], { signal, timeout: 15000 });
    if (audio) {
      const ffmpeg = await resolveExecutable('ffmpeg');
      const ffprobe = path.isAbsolute(ffmpeg) ? path.join(path.dirname(ffmpeg), process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe') : 'ffprobe';
      await run(ffmpeg, ['-version'], { signal, timeout: 15000 });
      await run(ffprobe, ['-version'], { signal, timeout: 15000 });
      return ffmpeg;
    }
  }
  return {
    cancel() { controller?.abort(); },
    checkTools() {
      return exclusive(async signal => {
        const tools = [];
        for (const name of ['yt-dlp', 'ffmpeg', 'ffprobe', 'deno']) {
          const executable = await resolveExecutable(name);
          try {
            const version = await run(executable, [name === 'ffmpeg' || name === 'ffprobe' ? '-version' : '--version'], { signal, timeout: 15000 });
            if (name === 'ffmpeg') {
              await run(executable, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-t', '0.1', '-c:a', 'aac', '-f', 'null', '-'], { signal, timeout: 15000 });
            }
            tools.push({ name, path: executable, ok: true, version: version.split(/\r?\n/)[0], checked: name === 'ffmpeg' ? 'AAC encoding for M4A passed' : '' });
          } catch (error) {
            if (signal.aborted) throw error;
            tools.push({ name, path: executable, ok: false, error: error.message });
          }
        }
        return tools;
      });
    },
    search(query, source = 'youtube') {
      return exclusive(async signal => {
        if (typeof query !== 'string' || !query.trim() || query.length > 200) {
          throw new Error('Enter a song or artist (up to 200 characters).');
        }
        if (!['youtube', 'music'].includes(source)) throw new Error('Choose YouTube or YouTube Music.');
        await check(signal, false);
        const target = source === 'music'
          ? `https://music.youtube.com/search?q=${encodeURIComponent(query.trim())}#songs`
          : `ytsearch8:${query.trim()}`;
        const output = await run('yt-dlp', [...base, '--playlist-end', '8', '--flat-playlist', '--dump-single-json', '--skip-download', '--', target], { signal, timeout: 60000 });
        let data;
        try { data = JSON.parse(output); } catch { throw new Error('YouTube returned an unreadable response. Update yt-dlp and try again.'); }
        return (data.entries || []).filter(e => e && /^[A-Za-z0-9_-]{11}$/.test(e.id) && !e.is_live).slice(0, 8).map(e => ({
          id: e.id, title: String(e.title || 'Untitled').slice(0, 500),
          artist: String(e.uploader || e.channel || 'YouTube').slice(0, 200),
          duration: Number.isFinite(e.duration) ? e.duration : null,
        }));
      });
    },
    download(id, onProgress = () => {}) {
      return exclusive(async signal => {
        if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{11}$/.test(id)) throw new Error('Choose a valid YouTube result.');
        const ffmpeg = await check(signal, true);
        await fs.mkdir(downloadDir, { recursive: true });
        const destination = path.join(downloadDir, `${id}.m4a`);
        try { if ((await fs.stat(destination)).size > 0) return destination; } catch (error) { if (error.code !== 'ENOENT') throw error; }
        const staging = await fs.mkdtemp(path.join(downloadDir, '.aura-download-'));
        try {
          onProgress('Downloading audio…');
          await run('yt-dlp', [...base, '--verbose', '--newline', '--progress', '--progress-template', 'download:AURA:%(progress._percent_str)s',
            ...(path.isAbsolute(ffmpeg) ? ['--ffmpeg-location', path.dirname(ffmpeg)] : []),
            '-f', 'bestaudio', '--extract-audio', '--audio-format', 'm4a', '--audio-quality', '0', '--embed-metadata',
            '--embed-thumbnail', '--convert-thumbnails', 'jpg',
            '--output', path.join(staging, `${id}.%(ext)s`), '--', `https://music.youtube.com/watch?v=${id}`], {
            signal, timeout: 15 * 60 * 1000,
            onLine(line) {
              const match = line.match(/AURA:\s*([\d.]+)%/);
              if (match) onProgress(`Downloading audio · ${Math.min(100, Math.round(Number(match[1])))}%`);
              if (line.includes('[ExtractAudio]')) onProgress('Converting audio…');
              if (line.includes('[Metadata]')) onProgress('Embedding song metadata…');
              if (line.includes('[ThumbnailsConvertor]') || line.includes('[EmbedThumbnail]')) onProgress('Preparing and embedding cover art…');
            },
          });
          if (signal.aborted) throw new Error('YouTube operation cancelled.');
          const file = path.join(staging, `${id}.m4a`);
          let audioStat;
          try { audioStat = await fs.stat(file); }
          catch (error) {
            if (error.code === 'ENOENT') throw new Error('The download did not produce an M4A file. Check FFmpeg and try again.');
            throw error;
          }
          if (!audioStat.size) throw new Error('The download produced an empty audio file.');
          await fs.rename(file, destination);
          return destination;
        } finally { await fs.rm(staging, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }); }
      });
    },
  };
}

function runProcess(command, args, { signal, timeout = 60000, onLine = () => {} } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('YouTube operation cancelled.'));
    const child = spawn(command, args, { shell: false, windowsHide: true });
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    let output = '', errors = '', pending = '', failure;
    function stop(message) {
      failure = new Error(message);
      if (process.platform === 'win32' && child.pid) {
        const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, shell: false });
        killer.on('error', () => child.kill());
      } else child.kill('SIGKILL');
    }
    const abort = () => stop('YouTube operation cancelled.');
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => stop('YouTube operation timed out. Check your connection and try again.'), timeout);
    child.stdout.on('data', chunk => {
      output += chunk.toString();
      pending += chunk.toString();
      const lines = pending.split(/\r?\n/); pending = lines.pop(); lines.forEach(onLine);
      if (output.length > 4 * 1024 * 1024) stop('YouTube response was too large. Try a different search.');
    });
    child.stderr.on('data', chunk => { errors = (errors + chunk.toString()).slice(-24000); });
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); };
    child.on('error', error => {
      cleanup();
      reject(new Error(error.code === 'ENOENT'
        ? `${command} was not found. Install it, add its folder to Windows PATH, and restart AURA. See README → YouTube setup.`
        : `Could not start ${command}: ${error.message}`));
    });
    child.on('close', code => {
      cleanup();
      if (failure) return reject(failure);
      if (code !== 0) return reject(new Error(formatProcessFailure(command, code, errors)));
      resolve(output);
    });
  });
}

function formatProcessFailure(command, code, errors) {
  if (/No space left on device|ENOSPC|not enough space on the disk|disk (?:is )?full/i.test(errors)) {
    return 'Not enough free disk space to save or convert this audio. Free space on the drive containing Music / AURA Downloads, then retry. The downloaded source, converted M4A, and cover art need space at the same time.';
  }
  const details = errors.split('Traceback (most recent call last):')[0].trim();
  if (/Postprocessing:|Conversion failed|Error opening output|Unknown encoder/i.test(errors)) {
    return `FFmpeg could not convert or tag the downloaded audio.\n${details.slice(-6000) || `Exit code ${code}.`}\nThe FFmpeg diagnostic above identifies the postprocessing failure.`;
  }
  return `${command} failed. ${details.slice(-3000) || `Exit code ${code}.`}`;
}

async function findExecutable(command) {
  const filename = process.platform === 'win32' ? `${command}.exe` : command;
  for (const folder of (process.env.PATH || '').split(path.delimiter)) {
    if (!folder) continue;
    const candidate = path.resolve(folder.replace(/^"|"$/g, ''), filename);
    try { if ((await fs.stat(candidate)).isFile()) return candidate; } catch {}
  }
  return command; // Let spawn provide the normal missing-tool error.
}

module.exports = { createYouTubeService, runProcess, formatProcessFailure };
