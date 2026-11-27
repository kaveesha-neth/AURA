// Measured lyric layout regression matrix; all data and native services are fixtures.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const profile = fs.mkdtempSync(path.join(root, '.cache', 'lyric-layout-'));
app.commandLine.appendSwitch('user-data-dir', profile);
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
require('./windows-media-fixture.cjs');
const fixtureFetch = global.fetch;
let fixtureLyrics = '';
global.fetch = async (url, options) => String(url).startsWith('https://lrclib.net/')
  ? { ok: true, json: async () => ({ syncedLyrics: fixtureLyrics }) }
  : fixtureFetch(url, options);
require('../main.js');
const output = path.join(root, '.cache', 'lyric-layout-results');
fs.mkdirSync(output, { recursive: true });
const checks = [], errors = [];
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const check = (name, passed, detail) => {
  checks.push({ name, passed: !!passed, detail });
  console.log(passed ? 'PASS' : 'FAIL', name, passed ? '' : JSON.stringify(detail));
  if (!passed) throw Error(name);
};
app.on('web-contents-created', (_, contents) => contents.on('console-message', event => {
  if (event.level === 'error') errors.push(event.message);
}));
app.whenReady().then(async () => {
  const until = async test => { for (let i = 0; i < 80; i++) { if (await test()) return true; await delay(50); } return false; };
  let win;
  if (!await until(() => { win = BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes('index.html')); return !!win; })) throw Error('Layout window did not start');
  const run = code => win.webContents.executeJavaScript(code, true);
  win.webContents.setBackgroundThrottling(false);
  check('Layout test renderer initializes', await until(() => run(`!!window.aura&&document.getElementById('loading-overlay').style.opacity==='0'`)));
  await run(`window.aura.touchMode(true)`); await delay(600);
  win.webContents.debugger.attach('1.3');
  const preference = async (id, value) => run(`(()=>{const e=document.getElementById(${JSON.stringify(id)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(String(value))});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  const texts = {
    single: 'A quiet line',
    wrapped: 'The world grows quiet as we follow every winding road and find a little room to breathe together.',
    multiline: 'Every word belongs in the light, even when the melody carries a longer thought across the screen. '.repeat(3).trim(),
    exceptional: 'Beyond the distant skyline we keep following the melody, carrying every word into the morning light. '.repeat(30).trim(),
  };
  let sequence = 0;
  for (const source of ['native', 'windows']) {
    await run(`document.querySelectorAll('.touch-header .touch-source-switch button')[${source === 'windows' ? 1 : 0}].click()`);
    if (source === 'native') await run(`document.getElementById('touch-view-lyrics').click()`);
    for (const [width, height] of [[1024, 600], [800, 600]]) {
      await win.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
      const card = await run(`JSON.stringify(document.querySelector('.touch-now').getBoundingClientRect().toJSON())`);
      for (const font of [18, 32, 48]) for (const visible of [1, 3, 7]) {
        await preference('windows-lyrics-font-size', font);
        await preference('windows-lyrics-visible-lines', visible);
        for (const [kind, text] of Object.entries(texts)) {
          fixtureLyrics = `[00:00]The opening line\n[00:05]A previous line with room to breathe\n[00:10]${text}\n[00:20]An upcoming lyric follows\n[00:25]The final line`;
          if (source === 'native') await run(`setLyricsLines(parseLRC(${JSON.stringify(fixtureLyrics)}),'synced');updateLyricsOverlay(15,true)`);
          else {
            Object.assign(global.__mediaFixture.state.sessions[0], { title: `Layout fixture ${++sequence}`, playing: false, position: 15, updatedAt: Date.now() });
            global.__mediaFixture.emit('change', global.__mediaFixture.state);
          }
          check(`${source} ${width} ${font}px ${visible} lines ${kind}: text loads`, await until(() => run(`document.querySelector('.system-lyrics .is-current')?.textContent===${JSON.stringify(text)}`)));
          await delay(550);
          const metrics = await run(`(()=>{
            const p=document.querySelector('.system-lyrics .is-current'),v=p.parentElement;
            const r=p.getBoundingClientRect(),b=v.getBoundingClientRect(),cs=getComputedStyle(p);
            const probe=p.cloneNode(true);probe.style.fontSize=${font}+'px';probe.style.transform='none';probe.style.opacity='0';v.append(probe);
            const natural=probe.offsetHeight;probe.remove();
            const rows=[...v.querySelectorAll('.system-lyric')].map(e=>({offset:Number(e.style.getPropertyValue('--lyric-offset')),r:e.getBoundingClientRect()})).sort((a,b)=>a.offset-b.offset);
            return {height:r.height,viewport:v.clientHeight,font:parseFloat(cs.fontSize),natural,center:Math.abs((r.top+r.bottom-b.top-b.bottom)/2),
              fits:r.top>=b.top-.5&&r.bottom<=b.bottom+.5,unclipped:cs.overflowY==='visible'&&p.firstElementChild.scrollHeight<=p.clientHeight+1,
              separate:rows.every((row,i)=>!i||rows[i-1].r.bottom<=row.r.top+.5),
              outer:getComputedStyle(v).overflowY,card:document.querySelector('.touch-now').getBoundingClientRect().toJSON()};
          })()`);
          const expectedFont = metrics.natural <= metrics.viewport ? metrics.font === font : metrics.font < font;
          check(`${source} ${width} ${font}px ${visible} lines ${kind}: centered, full text, natural height and separated neighbors`,
            metrics.fits && metrics.unclipped && metrics.separate && metrics.center < 2 && expectedFont && metrics.outer === 'hidden' && JSON.stringify(metrics.card) === card, metrics);
          if (font === 48 && visible === 3 && width === 1024 && kind !== 'single')
            fs.writeFileSync(path.join(output, `${source}-${kind}.png`), (await win.webContents.capturePage()).toPNG());
          // A short/long boundary should keep its neighbors disjoint throughout
          // movement, while the surrounding cards remain fixed.
          if (font === 32 && visible === 3 && kind === 'multiline') {
            if (source === 'native') await run(`updateLyricsOverlay(21,true)`);
            else {
              Object.assign(global.__mediaFixture.state.sessions[0], { position: 21, updatedAt: Date.now() });
              global.__mediaFixture.emit('change', global.__mediaFixture.state);
            }
            const transition = await run(`new Promise(resolve=>{
              let frames=0,ok=true;const sample=()=>{
                const rows=[...document.querySelectorAll('.system-lyrics .system-lyric')].map(e=>({i:Number(e.style.getPropertyValue('--lyric-offset')),r:e.getBoundingClientRect()})).sort((a,b)=>a.i-b.i);
                ok=ok&&rows.every((row,i)=>!i||rows[i-1].r.bottom<=row.r.top+1);
                if(++frames<32)requestAnimationFrame(sample);else resolve(ok);
              };requestAnimationFrame(sample);
            })`);
            check(`${source} ${width}: different-height transition has no overlapping wrappers`, transition);
          }
        }
      }
    }
  }
  await win.webContents.debugger.sendCommand('Emulation.clearDeviceMetricsOverride');
  win.webContents.debugger.detach();
  check('No renderer errors during lyric layout matrix', errors.length === 0, errors);
  fs.writeFileSync(path.join(output, 'checks.json'), JSON.stringify({ checks, errors }, null, 2));
  app.quit();
}).catch(error => {
  console.error(error);
  fs.writeFileSync(path.join(output, 'checks.json'), JSON.stringify({ checks, errors, failure: String(error) }, null, 2));
  app.exit(1);
});
