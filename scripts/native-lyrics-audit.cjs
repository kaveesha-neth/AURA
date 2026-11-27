const fs = require('node:fs');
const path = require('node:path');

// Runs inside the existing isolated playback suite, with synthetic audio and
// cached lyrics. No live provider requests or system-volume writes are needed.
module.exports = async ({ win, run, check, output, delay }) => {
  const until = async test => {
    for (let i = 0; i < 50; i++) { if (await test()) return true; await delay(100); }
    return false;
  };
  const choose = async view => { await run(`document.getElementById('touch-view-${view}').click()`); await delay(100); };
  const lyric = () => run(`document.querySelector('.touch-native-lyrics .is-current')?.textContent`);
  const capture = async name => {
    await delay(550);
    fs.writeFileSync(path.join(output, name + '.png'), (await win.webContents.capturePage()).toPNG());
  };
  check('Native touch defaults to Queue with both view options', await run(`document.getElementById('touch-view-queue').getAttribute('aria-pressed')==='true'&&!document.getElementById('touch-queue-content').hidden&&document.getElementById('touch-lyrics-content').hidden`));
  await run(`window.__nativeAudit={src:audio.src,lines:state.lyrics.lines,type:state.lyrics.type};window.__lyricsPublications=0;window.__publishLyrics=window.auraLyricsRender;window.auraLyricsRender=value=>{window.__lyricsPublications++;window.__publishLyrics(value)};true`);
  const originalOrder = await run(`queue.toArray().map(n=>n.id).join(',')`);
  await choose('lyrics');
  check('Switching to lyrics preserves live audio and queue order', await run(`!audio.paused&&audio.src===window.__nativeAudit.src&&queue.toArray().map(n=>n.id).join(',')===${JSON.stringify(originalOrder)}`));
  check('Lyrics view hides queue content and has no nested card or extra controls', await run(`document.getElementById('touch-queue-content').hidden&&!document.getElementById('touch-lyrics-content').hidden&&!document.querySelector('.touch-native-lyrics.touch-panel,.touch-native-lyrics button,.touch-native-lyrics header')&&document.getElementById('touch-view-lyrics').getBoundingClientRect().height>=44`));
  await run(`btnPlay.click();window.aura.touchSeek(12)`);
  check('Paused forward seek synchronizes native touch and desktop lyrics', await until(async () => await lyric() === 'Every note becomes a place') && await run(`lyricsCurrent.textContent==='Every note becomes a place'`));
  await run(`window.aura.touchSeek(2)`);
  check('Paused backward seek resynchronizes lyrics', await until(async () => await lyric() === 'Let the world grow quiet'));
  await run(`window.__publicationCount=window.__lyricsPublications;updateLyricsOverlay(2);updateLyricsOverlay(2.1)`);
  check('Unchanged lyric index does not publish playback ticks', await run(`window.__publicationCount===window.__lyricsPublications`));
  await run(`state.repeat=2;audio.dispatchEvent(new Event('ended'))`);
  check('Repeat-one resets lyrics without changing track', await until(async () => await lyric() === 'Let the world grow quiet') && await run(`audio.src===window.__nativeAudit.src`));
  await run(`audio.pause();state.isPlaying=false;state.repeat=0;updatePlayBtn();updateQueuePlayingState();`);

  // Check both cards on a 1024 x 600 viewport used by compact touch displays.
  win.webContents.debugger.attach('1.3');
  try {
    await win.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride', { width: 1024, height: 600, deviceScaleFactor: 1, mobile: false });
    await choose('queue');
    await run(`(()=>{const input=document.querySelector('.touch-search input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,' ');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await delay(100);
    await run(`document.querySelector('.touch-track-list').scrollTop=120;window.__queueScroll=document.querySelector('.touch-track-list').scrollTop;window.__queueCard=document.querySelector('.touch-queue').getBoundingClientRect().toJSON();`);
    await capture('touch-native-queue-1024');
    await choose('lyrics');
    check('Lyrics viewport preserves card geometry and three columns at 1024 x 600', await run(`(()=>{const r=document.querySelector('.touch-queue').getBoundingClientRect(),b=window.__queueCard;return r.x===b.x&&r.y===b.y&&r.width===b.width&&r.height===b.height&&['.touch-now','.touch-queue','.touch-volume','.touch-transport'].every(s=>{const b=document.querySelector(s).getBoundingClientRect();return b.width>0&&b.x>=0&&b.right<=innerWidth&&b.y>=0&&b.bottom<=innerHeight})})()`));
    await capture('touch-native-lyrics-1024');
    check('Active lyric is vertically centered below the switcher', await run(`(()=>{const v=document.querySelector('.touch-native-lyrics').getBoundingClientRect(),l=document.querySelector('.touch-native-lyrics .is-current').getBoundingClientRect();return Math.abs((l.top+l.bottom-v.top-v.bottom)/2)<2&&v.top+1>=document.querySelector('.touch-queue header').getBoundingClientRect().bottom})()`));
    await choose('queue');
    check('Queue query and scroll survive view switching', await run(`document.querySelector('.touch-search input').value===' '&&window.__queueScroll>0&&Math.abs(document.querySelector('.touch-track-list').scrollTop-window.__queueScroll)<1`));
    await run(`(()=>{const input=document.querySelector('.touch-search input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await choose('lyrics');
    await run(`setLyricsLines([{time:0,text:'A long lyric wraps gently across the screen, keeping every word readable and the music close at hand.'},{time:20,text:'The next line waits quietly'}],'synced');window.aura.touchSeek(2)`);
    await capture('touch-native-lyrics-long-1024');
    check('Long lyrics wrap within the touch viewport', await run(`(()=>{const p=document.querySelector('.touch-native-lyrics .is-current'),s=p.firstElementChild;return s.scrollWidth<=p.clientWidth+1&&s.scrollHeight>parseFloat(getComputedStyle(p).lineHeight)&&s.scrollHeight<=p.clientHeight+1})()`));
    const point = await run(`(()=>{const r=document.getElementById('touch-view-queue').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    await win.webContents.debugger.sendCommand('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...point, id: 1 }] });
    await win.webContents.debugger.sendCommand('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    check('View selector accepts a touchscreen contact', await until(() => run(`!document.getElementById('touch-queue-content').hidden`)));
  } finally {
    await win.webContents.debugger.sendCommand('Emulation.clearDeviceMetricsOverride');
    win.webContents.debugger.detach();
  }
  await choose('lyrics');
  await run(`setLyricsLines(plainLyricsToTimedLines('First plain line\\nSecond plain line',30),'plain')`);
  check('Plain lyrics remain readable without invented synchronized highlighting', await until(() => run(`document.querySelector('.touch-plain-lyrics')?.textContent.includes('Second plain line')&&!document.querySelector('.touch-native-lyrics .is-current')`)));
  for (const message of ['Instrumental', 'No lyrics found', 'Lyrics unavailable']) {
    await run(`resetLyricsOverlay(${JSON.stringify(message)})`);
    check('Native touch displays ' + message, await until(() => run(`document.querySelector('.touch-native-lyrics [role=status]')?.textContent===${JSON.stringify(message)}`)));
  }
  await run(`showLyricsLoading()`);
  check('Native touch clears old lyrics while loading', await until(() => run(`document.querySelector('.touch-native-lyrics [role=status]')?.textContent==='Finding lyrics…'`)));
  await run(`window.auraLyricsRender=window.__publishLyrics;setLyricsLines(window.__nativeAudit.lines,window.__nativeAudit.type);window.aura.touchSeek(0);state.isPlaying=false;updatePlayBtn();btnPlay.click();`);
  await choose('queue');
  check('Native lyrics audit restores playback and Queue', await until(() => run(`!audio.paused&&state.isPlaying&&!document.getElementById('touch-queue-content').hidden`)));
};
