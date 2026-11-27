const fs = require('node:fs');
const path = require('node:path');

module.exports = async ({ win, run, check, output, delay }) => {
  await run(`document.getElementById('btn-touch-mode').click()`);
  await delay(700);
  check('Touch mode enters native fullscreen and keeps playback running', win.isFullScreen() && await run(`isTouchMode&&!isFullscreenMode&&!audio.paused&&!document.getElementById('touch-player').hidden`));
  check('Touch queue reflects real music and artwork', await run(`document.querySelectorAll('.touch-row').length===queue.size&&document.querySelector('.touch-art img').naturalWidth>0`));
  check('Touch layout fits fullscreen', await run(`['.touch-now','.touch-queue','.touch-volume','.touch-transport'].every(s=>{const r=document.querySelector(s).getBoundingClientRect();return r.width>0&&r.top>=0&&r.bottom<=innerHeight&&r.right<=innerWidth})`));
  await require('./native-lyrics-audit.cjs')({ win, run, check, output, delay });
  await run(`document.getElementById('touch-play').click()`);
  await delay(100);
  check('Touch pause uses shared audio state', await run(`audio.paused&&document.getElementById('touch-play').getAttribute('aria-label')==='Play'`));
  // Send real touch contacts through Chromium, exercising native range behavior.
  win.webContents.debugger.attach('1.3');
  const touch = async (selector, fraction, vertical = false) => {
    const point = await run(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width*${vertical ? '.5' : fraction},y:r.y+r.height*${vertical ? 1 - fraction : '.5'}}})()`);
    await win.webContents.debugger.sendCommand('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...point, id: 1 }] });
    await win.webContents.debugger.sendCommand('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await delay(100);
  };
  try {
    await touch('#touch-seek', .6);
    check('Touch seek responds to actual touch input', await run(`Math.abs(audio.currentTime-18)<1`));
    await touch('#touch-volume', .7, true);
    check('Vertical volume responds to actual touch input', await run(`Math.abs(state.volume-.7)<.08&&audio.volume===1`));
  } finally { win.webContents.debugger.detach(); }
  await run(`document.querySelector('.touch-transport button').click()`);
  await delay(100);
  check('Touch shuffle reflects shared queue state', await run(`state.shuffle&&document.querySelector('.touch-transport button').getAttribute('aria-pressed')==='true'`));
  await run(`document.querySelector('.touch-transport button').click();document.querySelector('.touch-transport button:last-child').click()`);
  await delay(100);
  check('Touch repeat reflects shared state', await run(`state.repeat===1&&document.querySelector('.touch-transport button:last-child').getAttribute('aria-label')==='Repeat all'`));
  await run(`btnRepeat.click();btnRepeat.click();`);
  fs.writeFileSync(path.join(output, 'touch-screen.png'), (await win.webContents.capturePage()).toPNG());
  await run(`document.dispatchEvent(new KeyboardEvent('keydown',{code:'Escape',key:'Escape',bubbles:true}))`);
  await delay(700);
  check('Escape restores desktop and focus', !win.isFullScreen() && await run(`!isTouchMode&&document.getElementById('touch-player').hidden&&document.activeElement.id==='btn-touch-mode'`));
  await run(`document.getElementById('btn-touch-mode').click()`);
  await delay(500);
  win.setFullScreen(false);
  await delay(700);
  check('Native fullscreen exit also exits touch mode', await run(`!isTouchMode&&document.getElementById('touch-player').hidden`));
  await run(`setVolume(.02);audio.currentTime=0;btnPlay.click()`);
  for (let attempt = 0; attempt < 30; attempt++) {
    if (await run(`state.isPlaying&&!audio.paused`)) break;
    await delay(100);
  }
  check('Touch audit restores active playback', await run(`state.isPlaying&&!audio.paused`));
};
