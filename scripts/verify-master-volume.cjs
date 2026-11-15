// Dedicated live Windows integration check. No audio playback; restore OS state.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { MasterVolume } = require('../src/core/master-volume.cjs');
const root = path.resolve(__dirname, '..');
const profile = fs.mkdtempSync(path.join(root, '.cache', 'master-volume-verification-'));
app.setPath('userData', profile);
app.commandLine.appendSwitch('user-data-dir', profile);
require('../main.js');
const probe = new MasterVolume();
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const results = [];
const check = (name, ok) => { results.push({ name, passed: !!ok }); console.log(ok ? 'PASS' : 'FAIL', name); if (!ok) throw Error(name); };
async function until(test) { for (let i = 0; i < 150; i++) { if (await test()) return true; await delay(100); } return false; }
app.whenReady().then(async () => {
  let original;
  try {
    probe.start();
    check('Independent native probe reads Windows master volume', await until(() => probe.state.available));
    original = { ...probe.state };
    let win;
    await until(() => { win = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('index.html')); return !!win; });
    const run = code => win.webContents.executeJavaScript(code, true);
    check('Renderer initializes with available master volume', await until(() => run(`!!window.aura&&window.aura.getVolume().available`)));
    check('Startup preserves Windows master volume and uses unity app gain', await run(`Math.abs(state.volume-${original.volume})<.002&&audio.volume===1&&state.muted===${original.muted}`));
    const target = original.volume > .5 ? original.volume - .02 : original.volume + .02;
    await run(`window.aura.touchVolume(${target})`);
    check('AURA volume control changes real master endpoint', await until(() => Math.abs(probe.state.volume - target) < .002 && !probe.state.muted));
    probe.setVolume(original.volume);
    check('External volume changes update desktop control', await until(() => run(`Math.abs(state.volume-${original.volume})<.002&&document.getElementById('vol-track').getAttribute('aria-valuenow')==='${Math.round(original.volume * 100)}'`)));
    await run(`window.aura.touchMode(true)`);
    check('Touch fader reads master level', await until(() => run(`Number(document.getElementById('touch-volume').value)===${Math.round(original.volume * 100)}`)));
    probe.setVolume(target);
    check('External changes update touch fader', await until(() => run(`Number(document.getElementById('touch-volume').value)===${Math.round(target * 100)}`)));
    probe.toggleMute();
    check('External mute updates both UI states', await until(() => run(`state.muted&&document.getElementById('vol-icon').dataset.muted==='true'&&document.getElementById('touch-volume').getAttribute('aria-valuetext').includes('muted')`)));
    await run(`document.getElementById('vol-icon').click()`);
    check('AURA unmute changes real master mute state', await until(() => !probe.state.muted));
    check('App gain remains unity throughout master control', await run(`audio.volume===1`));
    // Persist an obsolete app-volume value, then reload. It must not change OS volume.
    await run(`window.electronAPI.savePlayerState({order:[],volume:.01})`);
    win.reload();
    check('Reload does not restore obsolete app volume to the system', await until(() => run(`!!window.aura&&window.aura.getVolume().available&&Math.abs(state.volume-${target})<.002&&audio.volume===1`)));
  } finally {
    if (original) {
      probe.setVolume(original.volume);
      if (!await until(() => Math.abs(probe.state.volume - original.volume) < .002 && !probe.state.muted)) throw Error('Failed to restore master level');
      if (original.muted) { probe.toggleMute(); if (!await until(() => probe.state.muted)) throw Error('Failed to restore original mute'); }
      console.log('RESTORED original Windows volume and mute');
    }
    probe.stop();
    fs.writeFileSync(path.join(root, 'docs/verification/master-volume-checks.json'), JSON.stringify(results, null, 2));
  }
  app.quit();
}).catch(error => { console.error(error); probe.stop(); app.exit(1); });
