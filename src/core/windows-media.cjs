'use strict';
const { EventEmitter } = require('node:events');
const { spawn } = require('node:child_process');
const path = require('node:path');
const readline = require('node:readline');
const ACTIONS = new Set(['play', 'pause', 'next', 'previous', 'seek', 'shuffle', 'repeat']);
class WindowsMedia extends EventEmitter {
  constructor({ platform = process.platform, launch = spawn, executable } = {}) {
    super(); this.platform = platform; this.launch = launch;
    this.executable = executable || (__dirname.includes('app.asar') ? path.join(process.resourcesPath, 'windows-media', 'AuraMediaBridge.exe') : path.resolve(__dirname, '../../resources/windows-media/AuraMediaBridge.exe'));
    this.state = { available: false, sessions: [], current: '' }; this.pending = new Map(); this.sequence = 0;
  }
  start() {
    if (this.platform !== 'win32' || this.child || this.stopped) return;
    const child = this.launch(this.executable, [], { windowsHide: true, stdio: ['pipe','pipe','pipe'] });
    this.child = child; child.stdin.on('error', error => this.diagnose(`Media bridge input: ${error.message}`));
    const diagnostics = readline.createInterface({ input: child.stderr });
    diagnostics.on('line', line => this.diagnose(line));
    const lines = readline.createInterface({ input: child.stdout });
    lines.on('line', line => {
      try {
        const data = JSON.parse(line);
        if (Number.isInteger(data.reply)) { const request = this.pending.get(data.reply); if (request) { clearTimeout(request.timer); request.resolve(data.ok === true); this.pending.delete(data.reply); } if (data.error) this.diagnose(data.error); return; }
        if (typeof data.available !== 'boolean' || !Array.isArray(data.sessions)) return;
        data.sessions = data.sessions.filter(s => typeof s.id === 'string' && typeof s.title === 'string' && typeof s.appName === 'string' && s.controls && typeof s.controls === 'object').slice(0, 100);
        this.state = data; this.emit('change', data);
      } catch { this.diagnose('Invalid response from the Windows media bridge.'); }
    });
    const ended = () => {
      if (this.child !== child) return;
      this.child = null; lines.close(); diagnostics.close(); this.failPending();
      this.state = { available: false, sessions: [], current: '', error: this.missing ? 'bridge-missing' : 'disconnected', diagnostic: this.lastDiagnostic || 'The Windows media bridge exited unexpectedly.' }; this.emit('change', this.state);
      if (!this.stopped) this.retry = setTimeout(() => this.start(), 3000);
    };
    child.once('error', error => { this.missing = error.code === 'ENOENT'; this.diagnose(`Launch media bridge: ${error.code || error.name}: ${error.message}`); ended(); });
    child.once('exit', code => { if (!this.stopped) this.diagnose(`Media bridge exited with code ${code}.`); ended(); });
  }
  diagnose(message) { const text = String(message).trim(); if (!text) return; this.lastDiagnostic = text.slice(-4096); this.emit('diagnostic', this.lastDiagnostic); }
  command({ sessionId, action, value } = {}) {
    const session = this.state.sessions.find(s => s.id === sessionId);
    if (!this.child || !this.state.available || !session || !ACTIONS.has(action) || !session.controls[action]) return Promise.resolve(false);
    if (action === 'seek' && (!Number.isFinite(value) || value < session.start || value > session.end)) return Promise.resolve(false);
    if (this.pending.size >= 16) return Promise.resolve(false);
    return new Promise(resolve => {
      const requestId = ++this.sequence;
      const timer = setTimeout(() => { this.pending.delete(requestId); resolve(false); }, 5000);
      this.pending.set(requestId, { resolve, timer });
      this.child.stdin.write(JSON.stringify({ requestId, sessionId, action, value }) + '\n');
    });
  }
  failPending() { for (const item of this.pending.values()) { clearTimeout(item.timer); item.resolve(false); } this.pending.clear(); }
  stop() { this.stopped = true; clearTimeout(this.retry); this.failPending(); if (this.child) { this.child.stdin.end(); this.child.kill(); this.child = null; } }
}
module.exports = { WindowsMedia };
