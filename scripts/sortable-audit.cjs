const fs = require("node:fs");
const path = require("node:path");
module.exports = async ({ win, run, capture, check, delay, output }) => {
  const pointer = (type, x, y) =>
    win.webContents.sendInputEvent({
      type,
      x: Math.round(x),
      y: Math.round(y),
      ...(type === "mouseMove" ? {} : { button: "left", clickCount: 1 }),
    });
  const key = async (keyCode) => {
    win.focus();
    win.webContents.focus();
    win.webContents.sendInputEvent({ type: "keyDown", keyCode });
    win.webContents.sendInputEvent({ type: "keyUp", keyCode });
    await delay(150);
  };
  const rect = (selector) =>
    run(
      `(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,cx:r.x+r.width/2,cy:r.y+r.height/2}})()`,
    );
  await run(
    `sortKeys=[];searchQuery='';renderQueue();document.querySelector('[aria-label="Music view"] button[role=radio]').click();`,
  );
  await delay(200);
  win.focus();
  const baseline = await run(
    `({nodes:queue.toArray(),current:state.currentNode})`,
  );
  await run(
    `window.__alignmentNodes=queue.toArray();window.__alignmentCurrent=state.currentNode;`,
  );
  for (const [name, selector] of [
    ["artwork", ".track-art"],
    ["text", ".track-title"],
    ["artist", ".track-artist"],
    ["empty space", null],
    ["album", ".track-album"],
    ["row number", ".track-gutter"],
  ]) {
    win.focus();
    await run(`document.getElementById('queue-list').scrollTop=0`);
    await delay(100);
    const row = await rect(".q-item");
    const part = selector ? await rect(".q-item " + selector) : null;
    const x = part && part.w ? part.cx : row.x + row.w - 7,
      y = part && part.h ? part.cy : row.cy;
    const before = await run(`queue.toArray().map(n=>n.id)`);
    pointer("mouseMove", x, y);
    pointer("mouseDown", x, y);
    pointer("mouseMove", x, y + 8);
    await delay(80);
    check(
      `Dragging from ${name} lifts a complete row`,
      await run(
        `!!document.querySelector('.queue-drag-overlay .track-title')&&!!document.querySelector('.queue-drop-pocket')`,
      ),
    );
    pointer("mouseMove", x, y + 135);
    await delay(100);
    if (name === "artwork") {
      await capture("drag-moving-pocket");
      check(
        "Insertion pocket moves and neighboring rows reflow",
        await run(
          `Number(document.querySelector('.queue-drop-pocket').dataset.position)>0&&Array.from(document.querySelectorAll('.q-item')).some(e=>e.style.transform.includes('-'))`,
        ),
      );
    }
    pointer("mouseUp", x, y + 135);
    await delay(60);
    check(
      `Drop from ${name} has a settling animation`,
      await run(`!!document.querySelector('.queue-drag-overlay')`),
    );
    for (let i = 0; i < 30; i++) {
      if (await run(`!document.querySelector('.queue-drag-overlay')`)) break;
      await delay(50);
    }
    const order = await run(`queue.toArray().map(n=>n.id)`);
    const expected = [...before];
    const [id] = expected.splice(0, 1);
    expected.splice(2, 0, id);
    if (JSON.stringify(order) !== JSON.stringify(expected))
      console.log("DROP_DIAGNOSTIC", { name, before, order, expected });
    check(
      `Drop from ${name} commits stable track IDs`,
      JSON.stringify(order) === JSON.stringify(expected),
    );
  }
  await run(`document.getElementById('queue-list').scrollTop=0`);
  await delay(100);
  let r = await rect(".q-item .track-title");
  pointer("mouseMove", r.cx, r.cy);
  pointer("mouseDown", r.cx, r.cy);
  pointer("mouseMove", r.cx + 2, r.cy + 1);
  await delay(50);
  check("Sub-threshold movement remains a click", await run(`!document.querySelector('.queue-drag-overlay')`));
  pointer("mouseUp", r.cx, r.cy);
  await delay(180);
  check(
    "Ordinary row click plays its song",
    await run(`state.currentNode.id===queue.head.id&&!audio.paused`),
  );
  await run(
    `audio.currentTime=4;window.__dragPlayback={id:state.currentNode.id,time:audio.currentTime,repeat:state.repeat,shuffle:state.shuffle,history:shuffleState.history.map(n=>n.id).join(',')};`,
  );
  const currentOrder = await run(`queue.toArray().map(n=>n.id)`);
  r = await rect(".q-item .track-title");
  pointer("mouseDown", r.cx, r.cy);
  pointer("mouseMove", r.cx, r.cy + 130);
  await delay(120);
  await capture("drag-current-track");
  pointer("mouseUp", r.cx, r.cy + 130);
  await delay(300);
  for (let i = 0; i < 30; i++) {
    if (await run(`!document.querySelector('.queue-drag-overlay')`)) break;
    await delay(50);
  }
  check(
    "Moving the playing track preserves audio, repeat and history",
    await run(
      `state.currentNode.id===window.__dragPlayback.id&&!audio.paused&&audio.currentTime>=4&&state.repeat===window.__dragPlayback.repeat&&state.shuffle===window.__dragPlayback.shuffle&&shuffleState.history.map(n=>n.id).join(',')===window.__dragPlayback.history`,
    ),
  );
  check(
    "Displayed order matches the linked playback queue",
    await run(
      `Array.from(document.querySelectorAll('#queue-list .q-item')).sort((a,b)=>Number(a.dataset.index)-Number(b.dataset.index)).every((e,i)=>e.dataset.id===queue.toArray()[i].id)`,
    ),
  );
  check("Settled rows have no residual drag offsets or pocket",await run(`!document.querySelector('.queue-drop-pocket')&&Array.from(document.querySelectorAll('#queue-list .q-item')).every(e=>getComputedStyle(e).transform==='none'&&Math.abs(e.getBoundingClientRect().top-(document.getElementById('queue-list').getBoundingClientRect().top+Number(e.dataset.index)*64-document.getElementById('queue-list').scrollTop))<1)`));
  await capture("drag-settled");
  r = await rect(".q-item .track-title");
  const cancelled = await run(`queue.toArray().map(n=>n.id).join(',')`);
  pointer("mouseDown", r.cx, r.cy);
  pointer("mouseMove", r.cx, r.cy + 90);
  await delay(90);
  await key("Escape");
  await delay(300);
  pointer("mouseUp", r.cx, r.cy + 90);
  for (let i = 0; i < 30; i++) {
    if (await run(`!document.querySelector('.queue-drag-overlay')`)) break;
    await delay(50);
  }
  console.log(
    "CANCEL_STATE",
    await run(
      `({order:queue.toArray().map(n=>n.id).join(','),overlay:!!document.querySelector('.queue-drag-overlay')})`,
    ),
    cancelled,
  );
  check(
    "Escape returns to original order without committing",
    await run(
      `queue.toArray().map(n=>n.id).join(',')===${JSON.stringify(cancelled)}&&!document.querySelector('.queue-drag-overlay')`,
    ),
  );
  r = await rect(".q-item .track-menu");
  pointer("mouseMove", r.cx, r.cy);
  pointer("mouseDown", r.cx, r.cy);
  pointer("mouseUp", r.cx, r.cy);
  await delay(130);
  check(
    "Context button opens its menu without dragging",
    await run(
      `!!document.querySelector('.context-menu')&&!document.querySelector('.queue-drag-overlay')`,
    ),
  );
  await key("Escape");
  // A deliberately long virtual queue exercises edge scrolling without touching disk.
  await run(
    `window.__preStress=queue.toArray();for(let i=0;i<120;i++)queue.push({...queue.head.song,title:'Scroll track '+i});renderQueue();`,
  );
  await delay(100);
  r = await rect(".q-item .track-title");
  const viewport = await rect("#queue-list");
  pointer("mouseDown", r.cx, r.cy);
  pointer("mouseMove", r.cx, viewport.y + viewport.h - 5);
  await delay(850);
  check(
    "Edge dragging scrolls the virtual queue only",
    await run(
      `document.getElementById('queue-list').scrollTop>100&&document.documentElement.scrollTop===0&&Number(document.querySelector('.queue-drop-pocket').dataset.position)>5`,
    ),
  );
  await capture("drag-autoscroll");
  await key("Escape");
  await delay(300);
  pointer("mouseUp", r.cx, viewport.y + viewport.h - 5);
  await run(
    `rebuildQueue(window.__preStress);renderQueue();document.getElementById('queue-list').scrollTop=0;window.aura.search('a');`,
  );
  await delay(120);
  r = await rect(".q-item .track-title");
  pointer("mouseDown", r.cx, r.cy);
  pointer("mouseMove", r.cx, r.cy + 100);
  await delay(100);
  check(
    "Filtered queue disables reordering with an explanation",
    await run(
      `!document.querySelector('.queue-drag-overlay')&&!document.querySelector('.queue-reorder-hint').hidden`,
    ),
  );
  pointer("mouseUp", r.cx, r.cy + 100);
  await run(
    `window.aura.search('');document.getElementById('sort-artist').click()`,
  );
  await delay(100);
  r = await rect(".q-item .track-title");
  pointer("mouseDown", r.cx, r.cy);
  pointer("mouseMove", r.cx, r.cy + 80);
  await delay(90);
  check(
    "Sorted queue disables manual reordering",
    await run(
      `!document.querySelector('.queue-drag-overlay')&&sortKeys.length>0`,
    ),
  );
  pointer("mouseUp", r.cx, r.cy + 80);
  await run(`sortKeys=[];renderQueue();`);
  // Mouse focus and keyboard focus have intentionally different treatments.
  r = await rect("#queue-search");
  pointer("mouseMove", r.cx, r.cy);
  pointer("mouseDown", r.cx, r.cy);
  pointer("mouseUp", r.cx, r.cy);
  await delay(80);
  check(
    "Mouse-focused search keeps an understated material",
    await run(
      `getComputedStyle(document.querySelector('.browser-search .lg-input')).boxShadow==='none'&&getComputedStyle(document.querySelector('.browser-search .lg-input')).outlineStyle==='none'`,
    ),
  );
  await capture("search-mouse-focus");
  await run(`document.querySelector('.browser-heading button').focus()`);
  await key("Tab");
  console.log(
    "KEYBOARD_FOCUS",
    await run(
      `({mode:document.documentElement.dataset.input,active:document.activeElement.id,visible:document.activeElement.matches(':focus-visible'),outline:getComputedStyle(document.querySelector('.browser-search .lg-input')).outline,shadow:getComputedStyle(document.querySelector('.browser-search .lg-input')).boxShadow})`,
    ),
  );
  check(
    "Keyboard search focus keeps a discreet visible indicator",
    await run(
      `getComputedStyle(document.querySelector('.browser-search .lg-input')).outlineStyle==='solid'&&parseFloat(getComputedStyle(document.querySelector('.browser-search .lg-input')).outlineWidth)>0&&parseFloat(getComputedStyle(document.querySelector('.browser-search .lg-input')).outlineWidth)<=1.2`,
    ),
  );
  await capture("search-keyboard-focus");
  await run(
    `document.querySelector('[aria-label="Music view"] button[role=radio]:last-of-type').click()`,
  );
  await delay(100);
  r = await rect(".browser-search input:not(#queue-search)");
  pointer("mouseDown", r.cx, r.cy);
  pointer("mouseUp", r.cx, r.cy);
  await delay(80);
  check(
    "Library search has no mouse-focus ring",
    await run(
      `Array.from(document.querySelectorAll('.browser-search .lg-input')).filter(e=>e.getClientRects().length).every(e=>getComputedStyle(e).outlineStyle==='none'&&getComputedStyle(e).boxShadow==='none')`,
    ),
  );
  await run(`document.getElementById('btn-search-online').click()`);
  await delay(150);
  await run(
    `document.getElementById('youtube-query').blur();window.__onlineBaseShadow=getComputedStyle(document.getElementById('youtube-query').parentElement).boxShadow`,
  );
  r = await rect("#youtube-query");
  pointer("mouseDown", r.cx, r.cy);
  pointer("mouseUp", r.cx, r.cy);
  await delay(80);
  check(
    "Online search has no mouse-focus ring",
    await run(
      `getComputedStyle(document.getElementById('youtube-query').parentElement).outlineStyle==='none'&&getComputedStyle(document.getElementById('youtube-query').parentElement).boxShadow===window.__onlineBaseShadow`,
    ),
  );
  await capture("online-search-focus");
  await key("Escape");
  await run(
    `document.querySelector('[aria-label="Music view"] button[role=radio]').click();btnShuffle.click();window.__shuffleDrag={history:shuffleState.history.map(n=>n.id).join(','),remaining:[...shuffleState.remaining].join(','),current:state.currentNode.id};document.getElementById('queue-list').scrollTop=0;`,
  );
  await delay(120);
  r = await rect(".q-item .track-title");
  pointer("mouseDown", r.cx, r.cy);
  pointer("mouseMove", r.cx, r.cy + 90);
  await delay(100);
  pointer("mouseUp", r.cx, r.cy + 90);
  await delay(300);
  check(
    "Manual reorder preserves active shuffle bookkeeping",
    await run(
      `state.shuffle&&state.currentNode.id===window.__shuffleDrag.current&&shuffleState.history.map(n=>n.id).join(',')===window.__shuffleDrag.history&&[...shuffleState.remaining].join(',')===window.__shuffleDrag.remaining`,
    ),
  );
  await run(`saveSession()`);
  await delay(450);
  check(
    "Dropped order persists through the existing session bridge",
    await run(
      `window.electronAPI.getPlayerState().then(saved=>saved.order.join('|')===queue.toArray().map(n=>n.song.filePath).join('|'))`,
    ),
  );
  await run(`btnShuffle.click();`);
  await delay(100);
  win.webContents.debugger.attach("1.3");
  await win.webContents.debugger.sendCommand("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
  r = await rect(".q-item .track-title");
  pointer("mouseDown", r.cx, r.cy);
  pointer("mouseMove", r.cx, r.cy + 90);
  await delay(100);
  check(
    "Reduced motion disables pocket transition",
    await run(
      `getComputedStyle(document.querySelector('.queue-drop-pocket')).transitionDuration==='0s'`,
    ),
  );
  pointer("mouseUp", r.cx, r.cy + 90);
  await delay(100);
  await win.webContents.debugger.sendCommand("Emulation.setEmulatedMedia", {
    features: [],
  });
  win.webContents.debugger.detach();
  await run(
    `rebuildQueue(window.__alignmentNodes);state.currentNode=window.__alignmentCurrent;loadNode(state.currentNode,false);renderQueue();`,
  );
  await delay(200);
};
