const fs = require("node:fs");
const path = require("node:path");
module.exports = async ({ win, run, capture, check, delay, output }) => {
  const choose = async (style) => {
    await run(
      `document.querySelector('[aria-label="Player controls style"] button[role=radio]:${style === "classic" ? "first" : "last"}-of-type').click()`,
    );
    await delay(350);
  };
  await run(
    `btnSettings.click();window.__originalPlayButton=btnPlay;if(audio.paused)btnPlay.click();window.__styleTrack=state.currentNode.id;window.__styleTime=audio.currentTime;`,
  );
  await delay(200);
  check(
    "Sculpted style is the initial control preference",
    await run(`document.documentElement.dataset.controls==='sculpted'`),
  );
  for (const style of ["classic", "sculpted"]) {
    await choose(style);
    check(
      `${style} style switches without replacing playback buttons`,
      await run(
        `btnPlay===window.__originalPlayButton&&document.getElementById('btn-play')===btnPlay&&!audio.paused&&state.currentNode.id===window.__styleTrack&&audio.currentTime>=window.__styleTime`,
      ),
    );
    await capture(`settings-${style}`);
  }
  await run(`btnSettings.click();btnPlay.click()`);
  await delay(150);
  for (const [width, height] of [
    [1400, 900],
    [1120, 824],
    [750, 600],
  ]) {
    win.setSize(width, height);
    await delay(350);
    await capture(`sculpted-${width}`);
    const rect = await run(
      `(()=>{const b=controls.getBoundingClientRect(),p=btnPlay.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height,center:b.x+b.width/2,play:p.x+p.width/2,inside:p.bottom<=innerHeight}})()`,
    );
    check(
      `Sculpted control geometry fits at ${width}`,
      Math.abs(rect.center - rect.play) < 0.1 && rect.inside && rect.w <= 400.1,
    );
    if (width === 1120)
      fs.writeFileSync(
        path.join(output, "sculpted-dock.png"),
        (
          await win.webContents.capturePage({
            x: Math.floor(rect.x) - 8,
            y: Math.floor(rect.y) - 8,
            width: Math.ceil(rect.w) + 16,
            height: Math.ceil(rect.h) + 16,
          })
        ).toPNG(),
      );
  }
  await run(`btnSettings.click()`);
  await delay(150);
  await choose("classic");
  await run(`btnSettings.click()`);
  await capture("classic-main");
  check(
    "Classic dock retains its original geometry",
    await run(
      `getComputedStyle(controls).height!=='84px'&&getComputedStyle(document.querySelector('.sculpted-bridge')).display==='none'`,
    ),
  );
  await run(`btnSettings.click()`);
  await delay(100);
  await choose("sculpted");
  await run(`btnSettings.click();saveSession()`);
  await delay(450);
  win.webContents.reload();
  for (let i = 0; i < 60; i++) {
    await delay(100);
    if (await run(`!!window.aura&&sessionReady`)) break;
  }
  check(
    "Control style preference survives renderer reload",
    await run(
      `document.documentElement.dataset.controls==='sculpted'&&localStorage.getItem('aura-controls-style')==='sculpted'`,
    ),
  );
  await run(`btnPlay.click()`);
  await delay(180);
  check(
    "Restored sculpted Play button still controls audio",
    await run(`!audio.paused`),
  );
  await run(`btnPlay.click()`);
  await run(`btnSettings.click()`);
  await delay(100);
  await choose("classic");
  await run(`btnSettings.click();saveSession()`);
  await delay(450);
  win.webContents.reload();
  for (let i = 0; i < 60; i++) {
    await delay(100);
    if (await run(`!!window.aura&&sessionReady`)) break;
  }
  check(
    "Classic style preference also survives reload",
    await run(`document.documentElement.dataset.controls==='classic'`),
  );
  await run(`btnSettings.click()`);
  await delay(100);
  await choose("sculpted");
  await run(`btnSettings.click();btnQueueToggle.click()`);
  await delay(350);
  await capture("sculpted-compact");
  check(
    "Sculpted controls fit the collapsed player",
    await run(
      `controls.getBoundingClientRect().left>=0&&controls.getBoundingClientRect().right<=innerWidth`,
    ),
  );
  await run(`btnQueueToggle.click()`);
};
