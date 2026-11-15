'use strict';
const { EventEmitter } = require('node:events');
const { spawn } = require('node:child_process');
const path = require('node:path');
const readline = require('node:readline');

class MasterVolume extends EventEmitter {
  constructor({ platform = process.platform, launch = spawn } = {}) {
    super();
    this.platform = platform;
    this.launch = launch;
    this.state = { available: false, volume: 0, muted: false };
    this.stopped = false;
  }
  start() {
    if (this.platform !== 'win32' || this.child || this.stopped) return;
    const executable = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const script = path.join(__dirname, 'master-volume.ps1').replace(/([\\/])app\.asar([\\/])/, '$1app.asar.unpacked$2');
    const child = this.launch(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    this.child = child;
    child.stdin.on('error', () => {});
    child.stderr.resume();
    const lines = readline.createInterface({ input: child.stdout });
    lines.on('line', line => {
      try {
        const value = JSON.parse(line);
        if (value.available === false) this.publish({ ...this.state, available: false });
        else if (value.available === true && Number.isFinite(value.volume) && value.volume >= 0 && value.volume <= 1 && typeof value.muted === 'boolean') this.publish(value);
      } catch { /* Ignore PowerShell startup diagnostics, never treat them as state. */ }
    });
    const ended = () => {
      if (this.child !== child) return;
      this.child = null;
      lines.close();
      this.publish({ ...this.state, available: false });
      if (!this.stopped) this.retry = setTimeout(() => this.start(), 3000);
    };
    child.once('error', ended);
    child.once('exit', ended);
  }
  publish(value) {
    this.state = { available: value.available, volume: value.volume, muted: value.muted };
    if (Array.isArray(value.outputs)) this.state.outputs = value.outputs.filter(item => typeof item.id === 'string' && typeof item.name === 'string').slice(0, 100);
    if (value.outputError) this.state.outputError = String(value.outputError);
    this.emit('change', this.state);
  }
  setVolume(volume) {
    if (!Number.isFinite(volume) || !this.state.available || !this.child) return;
    // Coalesce rapid drags; only the newest value crosses the process boundary.
    this.pending = `volume:${Math.max(0, Math.min(1, volume))}\n`;
    if (!this.writeTimer) this.writeTimer = setTimeout(() => {
      this.writeTimer = null;
      if (this.child && this.state.available) this.child.stdin.write(this.pending);
      this.pending = null;
    }, 25);
  }
  toggleMute() {
    if (!this.state.available || !this.child) return;
    if (this.writeTimer) {
      clearTimeout(this.writeTimer); this.writeTimer = null;
      this.child.stdin.write(this.pending); this.pending = null;
    }
    this.child.stdin.write('mute:toggle\n');
  }
  selectOutput(id) {
    if (!this.child || !this.state.available || typeof id !== 'string' || /[\r\n\0]/.test(id) || !this.state.outputs?.some(output => output.id === id)) return Promise.resolve(false);
    return new Promise(resolve => {
      const done = result => { clearTimeout(timer); this.removeListener('change', changed); resolve(result); };
      const changed = state => {
        if (state.outputError || !state.available) done(false);
        else if (state.outputs?.some(item => item.id === id && item.isDefault)) done(true);
      };
      const timer = setTimeout(() => done(false), 4500);
      this.on('change', changed);
      this.child.stdin.write(`output:${id}\n`);
    });
  }
  stop() {
    this.stopped = true;
    clearTimeout(this.retry);
    clearTimeout(this.writeTimer);
    if (this.child) { this.child.stdin.end(); this.child.kill(); this.child = null; }
  }
}
module.exports = { MasterVolume };
