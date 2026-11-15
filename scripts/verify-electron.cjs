// Run in Electron: all scans, settings and cache writes use an isolated profile.
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");
app.commandLine.appendSwitch("disable-renderer-backgrounding");
app.commandLine.appendSwitch("disable-features", "CalculateNativeWinOcclusion");
const testProfile = fs.mkdtempSync(path.join(root, ".cache", "verification-"));
app.setPath("userData", testProfile);
app.commandLine.appendSwitch("user-data-dir", testProfile);
const output = path.join(
  root,
  "docs",
  ...(process.argv.includes("--controls")
    ? ["controls-style"]
    : process.argv.includes("--segments")
      ? ["segments", process.argv.includes("--baseline") ? "before" : "after"]
      : process.argv.includes("--alignment")
        ? [
            "alignment",
            process.argv.includes("--baseline") ? "before" : "after",
          ]
        : process.argv.includes("--visual-audit")
          ? ["ui-refinement", "after"]
          : ["verification"]),
  process.env.AURA_RENDERER_URL ? "development" : "",
);
fs.mkdirSync(output, { recursive: true });
require("./volume-fixture.cjs");
require("../main.js");
if (app.getName() !== "AURA" || app.getPath("userData") !== testProfile)
  throw Error("Standalone identity/profile mismatch");
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const errors = [];
const checks = [];
function check(name, value) {
  checks.push({ name, passed: !!value });
  console.log(value ? "PASS" : "FAIL", name);
  if (!value) throw Error(name);
}
app.on("web-contents-created", (_, contents) => {
  contents.on("console-message", (event) => {
    if (event.level === "error") errors.push(event.message);
  });
  contents.on("render-process-gone", (_event, details) =>
    errors.push(JSON.stringify(details)),
  );
});
app
  .whenReady()
  .then(async () => {
    await delay(1500);
    let win;
    for (let attempt = 0; attempt < 50 && !win; attempt++) {
      win = BrowserWindow.getAllWindows().find(
      (w) =>
        !w.isDestroyed() &&
        (w.webContents.getURL().includes("index.html") ||
          w.webContents.getURL().startsWith("http://127.0.0.1:5173")),
      );
      if (!win) await delay(200);
    }
    if (!win) throw Error("Main window did not start");
    win.webContents.setBackgroundThrottling(false);
    const run = (code) => win.webContents.executeJavaScript(code, true);
    await delay(1500);
    for (let i = 0; i < 60; i++) {
      if (
        await run(
          `!!window.aura&&document.getElementById('loading-overlay')?.style.opacity==='0'`,
        )
      )
        break;
      await delay(200);
    }
    console.log(
      "INITIAL",
      await run(
        `JSON.stringify({title:document.title,ready:!!window.aura,loading:document.getElementById('loading-overlay').style.opacity,body:document.body.innerText.slice(0,220),glisse:!!document.getElementById('glisse-styles')})`,
      ),
    );
    const capture = async (name) => {
      await delay(400);
      await run(
        `new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))`,
      );
      const state = await run(
        `({settings:document.getElementById('settings-popover').classList.contains('open'),sources:document.getElementById('library-modal').classList.contains('open'),online:!document.getElementById('youtube-modal').hidden,confirmation:!!document.querySelector('.confirmation-card'),view:document.getElementById('queue-panel').dataset.view})`,
      );
      fs.writeFileSync(
        path.join(output, name + ".state.json"),
        JSON.stringify(state, null, 2),
      );
      fs.writeFileSync(
        path.join(output, name + ".png"),
        (await win.webContents.capturePage()).toPNG(),
      );
    };
    await capture("01-empty");
    check(
      "Renderer initialized with actual Glisse",
      await run(`!!window.aura&&!!document.getElementById('glisse-styles')`),
    );
    // Create ordinary WAVs and matching sidecar artwork, then import through IPC.
    const fixtures = path.join(root, ".cache", "test-audio");
    fs.mkdirSync(fixtures, { recursive: true });
    const sampleRate = 8000,
      seconds = 30;
    const wav = Buffer.alloc(44 + sampleRate * seconds * 2);
    wav.write("RIFF");
    wav.writeUInt32LE(wav.length - 8, 4);
    wav.write("WAVEfmt ", 8);
    wav.writeUInt32LE(16, 16);
    wav.writeUInt16LE(1, 20);
    wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(sampleRate, 24);
    wav.writeUInt32LE(sampleRate * 2, 28);
    wav.writeUInt16LE(2, 32);
    wav.writeUInt16LE(16, 34);
    wav.write("data", 36);
    wav.writeUInt32LE(wav.length - 44, 40);
    for (let i = 0; i < sampleRate * seconds; i++)
      wav.writeInt16LE(
        Math.round(Math.sin((i / sampleRate) * 440 * Math.PI * 2) * 100),
        44 + i * 2,
      );
    const titles = [
      "Serein - After the Rain",
      "Haru - Slow Orbit",
      "Oceans - Blue Hour",
      "Sol - A Quiet Place",
      "Serein - Last Light",
      "Haru - Somewhere, Softly",
    ];
    const covers = fs
      .readdirSync(path.join(root, "data/covers"))
      .filter((f) => f.endsWith(".jpg"));
    const files = titles.map((title, i) => {
      const fp = path.join(fixtures, title + ".wav");
      const [artist, track] = title.split(" - ");
      const albums = [
        "Daylight",
        "Orbit",
        "Tides",
        "Still",
        "Daylight",
        "Orbit",
      ];
      const tag = (key, value) => {
        const text = Buffer.from(value + "\0", "utf8");
        const block = Buffer.alloc(8 + text.length + (text.length % 2));
        block.write(key);
        block.writeUInt32LE(text.length, 4);
        text.copy(block, 8);
        return block;
      };
      const info = Buffer.concat([
        Buffer.from("INFO"),
        tag("IART", artist),
        tag("INAM", track),
        tag("IPRD", albums[i]),
      ]);
      const header = Buffer.alloc(8);
      header.write("LIST");
      header.writeUInt32LE(info.length, 4);
      const tagged = Buffer.concat([wav, header, info]);
      tagged.writeUInt32LE(tagged.length - 8, 4);
      fs.writeFileSync(fp, tagged);
      fs.copyFileSync(
        path.join(root, "data/covers", covers[i % covers.length]),
        fp.replace(".wav", ".jpg"),
      );
      return fp;
    });
    const sampleLyrics =
      "[00:00.00]Let the world grow quiet\n[00:05.00]Find a little room to breathe\n[00:10.00]Every note becomes a place\n[00:15.00]And every moment brings you closer\n[00:20.00]Somewhere between the stars and the sea\n[00:25.00]This is where we want to be";
    for (const name of titles) {
      const [artist, title] = name.split(" - ");
      const normalize = (value) =>
        value
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, " ")
          .trim();
      const key = `${normalize(artist)}::${normalize(title)}`;
      const hash = require("node:crypto")
        .createHash("sha1")
        .update(key)
        .digest("hex")
        .slice(0, 24);
      fs.writeFileSync(
        path.join(testProfile, "data", "lyrics", hash + ".json"),
        JSON.stringify({
          status: "ok",
          syncedLyrics: sampleLyrics,
          provider: "verification fixture",
        }),
      );
    }
    const payload = await run(
      `window.electronAPI.addPaths(${JSON.stringify(files)})`,
    );
    const folders = await run(
      `window.electronAPI.addPaths(${JSON.stringify([path.join(root, ".cache", "test-audio")])})`,
    );
    check(
      "Folder import persists sources and deduplicates tracks",
      folders.folders.length === 1 && folders.songs.length === 6,
    );
    const rescanned = await run(`window.electronAPI.rescanLibrary()`);
    check(
      "Rescan retains music and cached artwork",
      rescanned.songs.length === 6 &&
        rescanned.songs.every((song) => song.coverPath),
    );
    const withoutFolder = await run(
      `window.electronAPI.removeLibraryFolder(${JSON.stringify(path.join(root, ".cache", "test-audio"))})`,
    );
    check(
      "Source removal leaves real files intact",
      withoutFolder.folders.length === 0 &&
        files.every((file) => fs.existsSync(file)),
    );
    await run(
      `applyLibraryPayload(${JSON.stringify(payload)});setVolume(.02);`,
    );
    await delay(600);
    check(
      "Real library scan imports WAV metadata and artwork",
      payload.songs.length === 6 && payload.songs.every((s) => s.coverPath),
    );
    await run(`window.aura.play(queue.head.id)`);
    for (let i = 0; i < 30; i++) {
      if (await run(`!audio.paused&&audio.currentTime>0`)) break;
      await delay(200);
    }
    console.log(
      "AUDIO",
      await run(
        `JSON.stringify({src:audio.src,paused:audio.paused,time:audio.currentTime,duration:audio.duration,state:state.isPlaying,error:audio.error?.message,ready:audio.readyState})`,
      ),
      errors,
    );
    check(
      "Audio plays and advances",
      await run(
        `!audio.paused&&audio.currentTime>0&&state.isPlaying&&audio.duration===30`,
      ),
    );
    check(
      "Local media supports precise byte ranges",
      await run(
        `fetch(toUrl(queue.head.song.filePath),{headers:{Range:'bytes=0-43'}}).then(async response=>response.status===206&&(await response.arrayBuffer()).byteLength===44)`,
      ),
    );
    check(
      "Chromium web security stays enabled",
      win.webContents.getLastWebPreferences().webSecurity === true,
    );
    await capture("02-playing");
    await require("./touch-audit.cjs")({ win, run, check, output, delay });
    await run(`btnPlay.click()`);
    await delay(100);
    check("Play/pause", await run(`audio.paused&&!state.isPlaying`));
    await run(
      `seekTrack.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));`,
    );
    check(
      "Keyboard seeking updates timeline",
      await run(`audio.currentTime>=5`),
    );
    await run(
      `const rect=seekTrack.getBoundingClientRect();seekTrack.dispatchEvent(new MouseEvent('mousedown',{button:0,clientX:rect.x+rect.width*.5,bubbles:true}));window.dispatchEvent(new MouseEvent('mouseup'));`,
    );
    check(
      "Pointer scrubbing is accurate",
      await run(`Math.abs(audio.currentTime-15)<.1`),
    );
    await run(
      `volTrack.dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true}));`,
    );
    check("Keyboard master volume", await run(`state.volume===1&&audio.volume===1`));
    await run(`setVolume(.02)`);
    await run(
      `window.__beforeSearch=queue.toArray().map(n=>n.id).join(',');window.aura.search('slow orbit');`,
    );
    await delay(100);
    check(
      "Queue search filters without reordering",
      await run(
        `document.querySelectorAll('.q-item').length===1&&queue.toArray().map(n=>n.id).join(',')===window.__beforeSearch`,
      ),
    );
    await run(
      `window.aura.search('');window.__nextId=queue.tail.id;window.aura.next(window.__nextId);`,
    );
    check(
      "Play Next preserves current playback",
      await run(`state.currentNode.next.id===window.__nextId`),
    );
    await run(
      `window.__moveId=queue.tail.id;window.aura.move(window.__moveId,queue.head.id);`,
    );
    check(
      "Reorder moves queue node",
      await run(`queue.head.id===window.__moveId`),
    );
    await run(`btnShuffle.click();`);
    check(
      "Shuffle produces fixed visible queue",
      await run(
        `state.shuffle&&queue.size===6&&shuffleState.originalOrder.length===6`,
      ),
    );
    await run(
      `window.__shuffled=queue.toArray().map(n=>n.id).join(',');btnNext.click();`,
    );
    await delay(200);
    check(
      "Shuffle Next preserves queue order",
      await run(`queue.toArray().map(n=>n.id).join(',')===window.__shuffled`),
    );
    await run(`btnShuffle.click();btnRepeat.click();btnRepeat.click();`);
    check("Repeat-one state", await run(`state.repeat===2`));
    await run(`btnNext.click();`);
    await delay(150);
    await run(`btnPrev.click();`);
    await delay(150);
    check(
      "Previous and Next keep a valid current track",
      await run(`!!state.currentNode&&!!queue.map[state.currentNode.id]`),
    );
    await run(`document.getElementById('sort-artist').click();`);
    check("Queue sorting", await run(`sortKeys.includes('artist')`));
    await run(`document.getElementById('btn-eq').click();`);
    await delay(100);
    await run(
      `document.querySelector('.eq-slider-wrap').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true}));`,
    );
    check(
      "Five-band audio graph and gain",
      await run(
        `eqConnected&&eqFilters.length===5&&eqFilters[0].gain.value===.5`,
      ),
    );
    await capture("03-equalizer");
    await run(
      `document.querySelector('.eq-slider-wrap').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));`,
    );
    check(
      "Equalizer double-click reset",
      await run(`eqValues[0]===0&&eqFilters[0].gain.value===0`),
    );
    await run(
      `document.getElementById('eq-reset').click();document.getElementById('btn-eq').click();btnLibrary.click();`,
    );
    await delay(250);
    check(
      "Library manager reads saved sources",
      await run(
        `libraryModal.classList.contains('open')&&libraryState.files.length===6`,
      ),
    );
    await capture("04-library");
    await run(`document.getElementById('library-clear').click();`);
    await delay(100);
    check(
      "Styled confirmation protects sources",
      await run(`!!document.querySelector('[role=alertdialog]')`),
    );
    await run(
      `document.querySelector('.confirmation-card button').click();libraryClose.click();btnSettings.click();`,
    );
    await capture("05-settings");
    check(
      "Settings open",
      await run(`settingsPopover.classList.contains('open')`),
    );
    await run(`document.querySelector('[data-theme=oled]').click();`);
    await delay(100);
    check(
      "OLED preference saves through bridge",
      await run(`window.electronAPI.getSettings().then(s=>s.theme==='oled')`),
    );
    await run(
      `document.querySelector('#theme-options [data-theme=midnight]').click();btnSettings.click();setLyricsLines(parseLRC(${JSON.stringify("placeholder")}),'synced');`,
    );
    await run(
      `setLyricsLines(parseLRC(${JSON.stringify(sampleLyrics)}),'synced');audio.currentTime=12;updateLyricsOverlay(12,true);`,
    );
    check(
      "Timed lyric parser synchronizes active line",
      await run(
        `state.lyrics.activeIndex===2&&lyricsCurrent.textContent==='Every note becomes a place'`,
      ),
    );
    await run(`btnFullscreen.click();`);
    await delay(600);
    check(
      "Native fullscreen and immersive UI",
      win.isFullScreen() &&
        (await run(
          `isFullscreenMode&&document.getElementById('fullscreen-player').getAttribute('aria-hidden')==='false'`,
        )),
    );
    await capture("06-immersive");
    await run(`btnExitFullscreen.click();`);
    await delay(450);
    await run(`btnFloatingLyrics.click();`);
    await delay(500);
    const overlay = BrowserWindow.getAllWindows().find((w) => w !== win);
    check(
      "Transparent always-on-top floating lyrics",
      overlay && overlay.isAlwaysOnTop() && overlay.isVisible(),
    );
    if (overlay) {
      check(
        "Floating lyrics receive synchronized state",
        await overlay.webContents.executeJavaScript(
          `document.querySelector('.floating-lyric.current').textContent.includes('Every note')`,
        ),
      );
      fs.writeFileSync(
        path.join(output, "07-floating.png"),
        (await overlay.webContents.capturePage()).toPNG(),
      );
    }
    await run(
      `window.electronAPI.saveSettings({floatingLyricsEnabled:false});`,
    );
    await delay(200);
    await run(`document.getElementById('btn-search-online').click();`);
    await delay(100);
    check(
      "Online search is connected",
      await run(`!document.getElementById('youtube-modal').hidden`),
    );
    await capture("08-online");
    await run(`document.getElementById('youtube-close').click()`);
    if (process.argv.includes("--controls"))
      await require("./controls-audit.cjs")({
        win,
        run,
        capture,
        check,
        delay,
        output,
      });
    if (process.argv.includes("--segments"))
      await require("./segment-audit.cjs")({
        win,
        run,
        capture,
        check,
        delay,
        output,
      });
    if (process.argv.includes("--alignment"))
      await require("./alignment-audit.cjs")({
        win,
        run,
        capture,
        check,
        delay,
        output,
      });
    if (process.argv.includes("--visual-audit"))
      await require("./ui-audit.cjs")({
        win,
        run,
        capture,
        check,
        delay,
        output,
        sampleLyrics,
      });
    win.setSize(780, 660);
    await delay(250);
    await capture("09-laptop");
    check(
      "Laptop layout has no horizontal overflow",
      await run(
        `document.documentElement.scrollWidth<=innerWidth&&document.getElementById('controls').getBoundingClientRect().right<=innerWidth`,
      ),
    );
    await run(`btnQueueToggle.click()`);
    await delay(300);
    await capture("10-compact");
    check(
      "Compact window preserves playback controls",
      await run(
        `root.classList.contains('queue-collapsed')&&btnPlay.getBoundingClientRect().width>0`,
      ),
    );
    await run(`btnQueueToggle.click()`);
    await delay(250);
    const size = await run(`queue.size`);
    await run(`window.aura.remove(queue.tail.id)`);
    check("Remove queue entry", (await run(`queue.size`)) === size - 1);
    await run(
      `window.__realNodes=queue.toArray();for(let i=0;i<5000;i++)queue.push({...queue.head.song,title:'Stress track '+i});renderQueue();`,
    );
    await delay(200);
    check(
      "Large queues keep a bounded rendered row count",
      await run(
        `queue.size>5000&&document.querySelectorAll('.q-item').length<=35`,
      ),
    );
    await run(
      `rebuildQueue(window.__realNodes);renderQueue();audio.currentTime=9;setVolume(.3);saveSession();`,
    );
    await delay(450);
    const saved = await run(`window.electronAPI.getPlayerState()`);
    check(
      "Queue, shuffle, position and volume persist",
      saved.order.length === 5 && saved.time >= 9 && saved.volume === 0.3,
    );
    win.webContents.reload();
    for (let attempt = 0; attempt < 60; attempt++) {
      await delay(100);
      if (
        await run(
          `!!window.aura&&sessionReady&&audio.readyState>=1&&state.volume===.3`,
        )
      )
        break;
    }
    console.log(
      "RESTORED",
      await run(
        `({size:queue.size,volume:state.volume,repeat:state.repeat,time:audio.currentTime,current:state.currentNode?.song.filePath})`,
      ),
    );
    check(
      "Session restores after renderer reload",
      await run(
        `queue.size===5&&state.volume===.3&&state.repeat===2&&Math.abs(audio.currentTime-9)<.5`,
      ),
    );
    check(
      "Preload keeps Node out of renderer",
      await run(`typeof require==='undefined'&&typeof process==='undefined'`),
    );
    await run(`document.getElementById('btn-maximize').click()`);
    await delay(300);
    check("Maximize window bridge", win.isMaximized());
    await run(`document.getElementById('btn-maximize').click()`);
    await delay(300);
    check("Restore window bridge", !win.isMaximized());
    await run(`document.getElementById('btn-min').click()`);
    await delay(250);
    check("Minimize window bridge", win.isMinimized());
    win.restore();
    await delay(200);
    let closeRequested = false;
    win.once("close", (event) => {
      closeRequested = true;
      event.preventDefault();
    });
    await run(`document.getElementById('btn-close').click()`);
    await delay(100);
    check("Close window bridge", closeRequested);
    check("No critical renderer errors", errors.length === 0);
    console.log("ERRORS", JSON.stringify(errors));
    console.log(
      "LAYOUT",
      await run(
        `JSON.stringify(Object.fromEntries(['layout','player-panel','cover-wrap','song-info','seekbar-area','controls','lyrics-overlay'].map(id=>{const e=document.getElementById(id);const b=e.getBoundingClientRect();return [id,{y:b.y,h:b.height,w:b.width,scroll:e.scrollHeight,client:e.clientHeight}]})))`,
      ),
    );
    fs.writeFileSync(
      path.join(output, "runtime-errors.json"),
      JSON.stringify(errors, null, 2),
    );
    fs.writeFileSync(
      path.join(output, "checks.json"),
      JSON.stringify(checks, null, 2),
    );
    app.quit();
  })
  .catch((error) => {
    console.error(error);
    fs.writeFileSync(
      path.join(output, "checks.json"),
      JSON.stringify(checks, null, 2),
    );
    fs.writeFileSync(
      path.join(output, "runtime-errors.json"),
      JSON.stringify(errors, null, 2),
    );
    app.exit(1);
  });
