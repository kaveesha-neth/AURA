const fs = require("node:fs");
const path = require("node:path");
module.exports = async function audit({
  win,
  run,
  capture,
  check,
  delay,
  output,
  sampleLyrics,
}) {
  const click = (selector) =>
    run(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const key = async (keyCode) => {
    win.webContents.sendInputEvent({ type: "keyDown", keyCode });
    win.webContents.sendInputEvent({ type: "keyUp", keyCode });
    await delay(160);
  };
  const type = async (selector, text) => {
    await run(
      `document.querySelector(${JSON.stringify(selector)}).focus();document.querySelector(${JSON.stringify(selector)}).select();`,
    );
    await win.webContents.insertText(text);
    await delay(150);
  };
  const libraryTab =
    '[aria-label="Music view"] button[role="radio"]:last-of-type';
  const queueTab =
    '[aria-label="Music view"] button[role="radio"]:first-of-type';
  await run(
    `window.__auditSaved={nodes:queue.toArray(),current:state.currentNode,time:audio.currentTime};window.__navigationOrder=queue.toArray().map(node=>node.id).join(',');`,
  );
  const initialBounds = await run(
    `JSON.stringify({width:innerWidth,rect:document.getElementById('queue-panel').getBoundingClientRect().width})`,
  );
  await click(libraryTab);
  await delay(250);
  check(
    "Library segment displays an integrated view, without opening a modal",
    await run(
      `document.getElementById('queue-panel').dataset.view==='library'&&!libraryModal.classList.contains('open')&&document.querySelector('[aria-label="Library view"]').getClientRects().length>0`,
    ),
  );
  check(
    "View navigation preserves queue order and window geometry",
    await run(
      `queue.toArray().map(node=>node.id).join(',')===window.__navigationOrder&&JSON.stringify({width:innerWidth,rect:document.getElementById('queue-panel').getBoundingClientRect().width})===${JSON.stringify(initialBounds)}`,
    ),
  );
  await capture("12-library-view");
  await type('input[aria-label="Search library tracks"]', "Slow Orbit");
  check(
    "Visible library search filters saved tracks",
    await run(
      `document.querySelectorAll('#library-track-list .track-row').length===1&&document.querySelector('#library-track-list .track-title').textContent==='Slow Orbit'`,
    ),
  );
  await capture("13-library-search");
  await type('input[aria-label="Search library tracks"]', "");
  await click('[aria-label="Sort library"]');
  await delay(180);
  await capture("14-library-sort");
  await run(
    `Array.from(document.querySelectorAll('.context-menu button')).find(button=>button.textContent.trim()==='Artist').click()`,
  );
  await delay(200);
  check(
    "Library sorting leaves queue order unchanged",
    await run(
      `queue.toArray().map(node=>node.id).join(',')===window.__navigationOrder`,
    ),
  );
  await run(
    `window.__libraryTarget=queue.toArray().find(node=>node!==state.currentNode).song.filePath;window.aura.remove(queue.toArray().find(node=>node.song.filePath===window.__libraryTarget).id);`,
  );
  await delay(150);
  check(
    "Library and queue remain distinct after queue removal",
    await run(
      `queue.size===5&&document.querySelectorAll('#library-track-list .track-row').length===6`,
    ),
  );
  await run(
    `Array.from(document.querySelectorAll('#library-track-list .track-row')).find(row=>row.dataset.id===window.__libraryTarget).querySelector('.track-menu').click()`,
  );
  await delay(180);
  check(
    "Library menu offers Add to queue",
    await run(
      `Array.from(document.querySelectorAll('.context-menu button')).some(button=>button.textContent.trim()==='Add to queue'&&!button.disabled)`,
    ),
  );
  await run(
    `Array.from(document.querySelectorAll('.context-menu button')).find(button=>button.textContent.trim()==='Add to queue').click()`,
  );
  await delay(200);
  check(
    "Library Add to queue appends the selected saved track",
    await run(
      `queue.size===6&&queue.tail.song.filePath===window.__libraryTarget`,
    ),
  );
  await run(
    `Array.from(document.querySelectorAll('#library-track-list .track-row')).find(row=>row.dataset.id===window.__libraryTarget).querySelector('.track-menu').click()`,
  );
  await delay(150);
  await run(
    `Array.from(document.querySelectorAll('.context-menu button')).find(button=>button.textContent.trim()==='Play next').click()`,
  );
  await delay(200);
  check(
    "Library Play Next updates the live queue",
    await run(`state.currentNode.next.song.filePath===window.__libraryTarget`),
  );
  await click(queueTab);
  await delay(180);
  check(
    "Queue segment restores the queue and reports selected state",
    await run(
      `document.getElementById('queue-panel').dataset.view==='queue'&&document.querySelector('[aria-label="Music view"] button[role=radio]').getAttribute('aria-checked')==='true'`,
    ),
  );
  await click('[aria-label^="Sort queue"]');
  // Keyboard and real pointer reorder use stable queue IDs.
  await run(`sortKeys=[];renderQueue();`);
  await delay(100);
  await key("Escape");
  await run(
    `window.__reorderHead=queue.head.id;window.__beforeReorderVolume=state.volume;document.querySelector('#queue-list .track-grip').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',code:'ArrowDown',altKey:true,bubbles:true}));`,
  );
  await delay(150);
  check(
    "Keyboard grip reorder does not trigger volume shortcuts",
    await run(
      `queue.head.id!==window.__reorderHead&&state.volume===window.__beforeReorderVolume`,
    ),
  );
  await run(`document.getElementById('queue-list').scrollTop=0`);
  await delay(150);
  const dragPoints = await run(
    `(()=>{const rows=document.querySelectorAll('#queue-list .q-item');window.__draggedId=rows[1].dataset.id;const from=rows[1].getBoundingClientRect(),to=rows[0].getBoundingClientRect();return {x:Math.round(from.x+110),y:Math.round(from.y+32),targetY:Math.round(to.y+32)}})()`,
  );
  win.focus();
  win.webContents.sendInputEvent({
    type: "mouseDown",
    button: "left",
    clickCount: 1,
    x: dragPoints.x,
    y: dragPoints.y,
  });
  win.webContents.sendInputEvent({
    type: "mouseMove",
    x: dragPoints.x,
    y: dragPoints.y - 8,
  });
  await delay(80);
  win.webContents.sendInputEvent({
    type: "mouseMove",
    x: dragPoints.x,
    y: dragPoints.targetY,
  });
  await delay(100);
  console.log(
    "QUEUE_POINTER_STATE",
    await run(
      `({scroll:document.getElementById('queue-list').scrollTop,pocket:document.querySelector('.queue-drop-pocket')?.dataset.position,source:window.__draggedId,order:queue.toArray().map(n=>n.id)})`,
    ),
  );
  win.webContents.sendInputEvent({
    type: "mouseUp",
    button: "left",
    clickCount: 1,
    x: dragPoints.x,
    y: dragPoints.targetY,
  });
  await delay(300);
  for (let attempt = 0; attempt < 40; attempt++) {
    if (await run(`!document.querySelector('.queue-drag-overlay')`)) break;
    await delay(50);
  }
  check(
    "Pointer drag reorders the actual linked queue",
    await run(`queue.head.id===window.__draggedId`),
  );
  await click('[aria-label^="Sort queue"]');
  await delay(160);
  await capture("15-queue-sort");
  await key("Escape");
  await run(
    `const row=document.querySelector('#queue-list .track-row');row.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:innerWidth-2,clientY:innerHeight-2}));`,
  );
  await delay(180);
  check(
    "Context menu avoids viewport edges",
    await run(
      `(()=>{const rect=document.querySelector('.context-menu').getBoundingClientRect();return rect.left>=11&&rect.top>=11&&rect.right<=innerWidth-11&&rect.bottom<=innerHeight-11})()`,
    ),
  );
  await key("End");
  check(
    "Context menu keyboard End reaches its final action",
    await run(
      `document.activeElement.textContent.trim()==='Remove from queue'`,
    ),
  );
  await key("Home");
  await capture("16-context-menu");
  await key("Escape");
  check(
    "Context menu Escape restores track focus",
    await run(
      `!document.querySelector('.context-menu')&&document.activeElement.classList.contains('track-hit')`,
    ),
  );
  await click(".browser-heading .liquid-button");
  await delay(180);
  await capture("17-add-music");
  check(
    "Add music exposes file and folder workflows",
    await run(
      `document.querySelector('.context-menu').innerText.includes('Add files')&&document.querySelector('.context-menu').innerText.includes('Add folder')`,
    ),
  );
  await key("Escape");
  await click('[aria-label="Library and queue actions"]');
  await delay(120);
  await run(
    `Array.from(document.querySelectorAll('.context-menu button')).find(button=>button.textContent.includes('Manage music sources')).click()`,
  );
  await delay(200);
  await click('.source-tabs [data-tab="files"]');
  await delay(150);
  await capture("18-sources");
  check(
    "Source dialog lists saved files with React actions",
    await run(
      `document.querySelectorAll('#library-content .source-row').length===6`,
    ),
  );
  await run(
    `if(audio.paused)btnPlay.click();window.__removedSourcePath=state.currentNode.song.filePath;`,
  );
  await delay(200);
  await run(
    `(()=>{const row=Array.from(document.querySelectorAll('#library-content .source-row')).find(row=>row.querySelector('span[title]')?.textContent===window.__removedSourcePath);row.scrollIntoView({block:'nearest'});row.querySelector('button.destructive').click();})()`,
  );
  for (let attempt = 0; attempt < 40; attempt++) {
    if (await run(`libraryState.files.length===5`)) break;
    await delay(100);
  }
  check(
    "Removing the current source keeps playback state synchronized",
    await run(`audio.paused===!state.isPlaying`),
  );
  await run(
    `window.electronAPI.addPaths([window.__removedSourcePath]).then(payload=>window.aura.applyLibrary(payload))`,
  );
  await delay(200);
  await click("#library-clear");
  await delay(150);
  await capture("19-confirmation");
  await key("Escape");
  check(
    "Confirmation Escape preserves library sources",
    await run(
      `!document.querySelector('.confirmation-card')&&libraryState.files.length===6`,
    ),
  );
  await click("#library-close");
  await delay(160);
  await click("#btn-settings");
  await delay(200);
  await capture("20-settings");
  check(
    "Settings use state-synchronized Liquid Glass switches",
    await run(
      `document.querySelector('#settings-popover [role=switch][aria-label="Enable floating lyrics"]')?.getAttribute('aria-checked')==='true'`,
    ),
  );
  await click("#reduced-effects");
  await delay(200);
  check(
    "Reduced effects disables backdrop filtering",
    await run(
      `document.documentElement.dataset.effects==='reduced'&&getComputedStyle(document.getElementById('controls')).backdropFilter==='none'`,
    ),
  );
  await capture("21-reduced-effects");
  check(
    "Reduced effects preserves selected segment label visibility",
    await run(
      `Array.from(document.querySelectorAll('#settings-popover .lg-tab-lens')).every(lens=>getComputedStyle(lens).backgroundColor==='rgba(0, 0, 0, 0)')`,
    ),
  );
  await click("#reduced-effects");
  await key("Escape");
  check(
    "Settings close restores its trigger focus",
    await run(`document.activeElement.id==='btn-settings'`),
  );
  const material = await run(
    `(()=>{const element=document.documentElement.dataset.controls==='sculpted'?document.querySelector('.sculpted-bridge'):document.getElementById('controls');return {filter:getComputedStyle(element).backdropFilter,rim:element.hasAttribute('data-rim'),rowGlass:document.querySelectorAll('.track-row .lg-glass').length,totalGlass:document.querySelectorAll('.lg-glass').length}})()`,
  );
  fs.writeFileSync(
    path.join(output, "material-diagnostics.json"),
    JSON.stringify(material, null, 2),
  );
  check(
    "Playback dock uses the real refraction filter and optical rim",
    material.filter.includes("url(") && material.rim,
  );
  check(
    "Track rows allocate no individual glass surfaces",
    material.rowGlass === 0,
  );
  const rect = await run(
    `(()=>{const r=btnPlay.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`,
  );
  win.webContents.sendInputEvent({ type: "mouseMove", ...rect });
  win.webContents.sendInputEvent({
    type: "mouseDown",
    button: "left",
    clickCount: 1,
    ...rect,
  });
  await delay(120);
  await capture("22-play-pressed");
  win.webContents.sendInputEvent({
    type: "mouseUp",
    button: "left",
    clickCount: 1,
    ...rect,
  });
  await delay(120);
  if (await run(`!audio.paused`)) await run(`btnPlay.click()`);
  await run(`audio.currentTime=1;btnPlay.click()`);
  await delay(250);
  await run(
    `window.__queueMutations=0;window.__queueObserver=new MutationObserver(records=>window.__queueMutations+=records.length);window.__queueObserver.observe(document.getElementById('queue-list'),{childList:true,subtree:true,characterData:true});`,
  );
  await delay(650);
  const playbackRender = await run(
    `({mutations:window.__queueMutations,time:audio.currentTime})`,
  );
  await run(`window.__queueObserver.disconnect();btnPlay.click()`);
  check(
    "Audio progress does not mutate React track rows",
    playbackRender.mutations === 0 && playbackRender.time > 1,
  );
  await run(`showLoading('Rescanning library…')`);
  await delay(150);
  await capture("23-loading");
  await run(
    `hideLoading();notify('Could not read this music source. Check the folder and try again.');`,
  );
  await capture("24-notification");
  await run(
    `window.__longNode=state.currentNode;window.__originalSong=state.currentNode.song;state.currentNode.song={...state.currentNode.song,title:'A very long track title that should use available space without pushing playback controls out of the window',artist:'An artist name with several contributors and a deliberately long display name',album:'A very long album name',coverPath:null};loadNode(state.currentNode,false);`,
  );
  await delay(300);
  await capture("25-long-title-no-art");
  check(
    "Long metadata has a readable tooltip and stays inside the player",
    await run(
      `songTitle.title.includes('very long')&&songTitle.getBoundingClientRect().right<=document.getElementById('player-panel').getBoundingClientRect().right&&btnPlay.getBoundingClientRect().bottom<innerHeight`,
    ),
  );
  await run(
    `window.__longNode.song=window.__originalSong;loadNode(window.__longNode,false);setLyricsLines(parseLRC(${JSON.stringify(sampleLyrics)}),'synced');audio.currentTime=12;updateLyricsOverlay(12,true);`,
  );
  await delay(250);
  for (const [width, height, name] of [
    [1480, 900, "26-wide"],
    [1120, 824, "27-desktop"],
    [960, 720, "28-medium"],
    [750, 600, "29-minimum"],
  ]) {
    win.setSize(width, height);
    await delay(250);
    await capture(name);
    check(
      `Playback controls and lyrics remain accessible at ${width}×${height}`,
      await run(
        `(()=>{const panel=document.getElementById('player-panel').getBoundingClientRect(),dock=btnPlay.getBoundingClientRect(),lyrics=document.getElementById('lyrics-overlay').getBoundingClientRect();return document.documentElement.scrollWidth<=innerWidth&&dock.left>=panel.left&&dock.right<=panel.right&&dock.bottom<innerHeight&&lyrics.bottom<=panel.bottom+2})()`,
      ),
    );
  }
  win.setSize(1120, 824);
  await delay(180);
  await click(libraryTab);
  await run(`window.auraLibraryRender({songs:[],folders:[],files:[]})`);
  await delay(150);
  await capture("30-empty-library");
  check(
    "Empty library has a functional import action",
    await run(
      `document.querySelector('[aria-label="Library view"] .empty-action button')?.textContent.includes('Add music')`,
    ),
  );
  await run(`window.auraLibraryRender(libraryState)`);
  await click(queueTab);
  await run(`applyFullscreenState(true)`);
  win.setSize(1440, 700);
  await delay(300);
  await capture("31-wide-immersive");
  check(
    "Wide immersive controls stay in the viewport",
    await run(
      `document.getElementById('fullscreen-controls').getBoundingClientRect().bottom<=innerHeight`,
    ),
  );
  await run(`document.activeElement?.blur();btnPlay.click();`);
  await delay(3350);
  await capture("33-immersive-idle");
  check(
    "Fullscreen controls recede during uninterrupted playback",
    await run(
      `document.getElementById('fullscreen-player').dataset.idle==='true'&&getComputedStyle(document.getElementById('fullscreen-controls')).opacity==='0'`,
    ),
  );
  win.webContents.sendInputEvent({ type: "mouseMove", x: 20, y: 20 });
  await delay(300);
  check(
    "Pointer activity restores immersive controls",
    await run(
      `document.getElementById('fullscreen-player').dataset.idle==='false'&&getComputedStyle(document.getElementById('fullscreen-controls')).opacity==='1'`,
    ),
  );
  await run(`btnPlay.click()`);
  win.setMinimumSize(450, 600);
  win.setSize(500, 700);
  await delay(250);
  await capture("32-narrow-immersive");
  check(
    "Narrow immersive player supports wrapped lyrics",
    await run(
      `document.getElementById('fullscreen-lyrics').getBoundingClientRect().width<=innerWidth&&document.getElementById('fullscreen-controls').getBoundingClientRect().right<=innerWidth`,
    ),
  );
  await run(`applyFullscreenState(false)`);
  win.setMinimumSize(750, 600);
  win.setSize(1120, 824);
  await delay(200);
  win.webContents.debugger.attach("1.3");
  await win.webContents.debugger.sendCommand("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
  await delay(150);
  check(
    "Reduced motion suppresses decorative animation",
    await run(
      `matchMedia('(prefers-reduced-motion: reduce)').matches&&getComputedStyle(document.getElementById('controls')).transitionDuration==='0s'`,
    ),
  );
  await capture("34-reduced-motion");
  await win.webContents.debugger.sendCommand("Emulation.setEmulatedMedia", {
    features: [],
  });
  win.webContents.debugger.detach();
  await run(
    `rebuildQueue(window.__auditSaved.nodes);state.currentNode=window.__auditSaved.current;loadNode(state.currentNode,false);renderQueue();`,
  );
  await delay(150);
};
