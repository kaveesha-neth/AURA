const fs = require("node:fs");
const path = require("node:path");
module.exports = async ({ run, send, check, output, delay }) => {
  await run(`window.__packagedPlay=btnPlay;btnSettings.click()`);
  await delay(150);
  await run(
    `document.querySelector('[aria-label="Player controls style"] button[role=radio]').click()`,
  );
  await delay(180);
  check(
    "Packaged Classic control preference changes without replacing the transport",
    await run(
      `document.documentElement.dataset.controls==='classic'&&btnPlay===window.__packagedPlay&&localStorage.getItem('aura-controls-style')==='classic'`,
    ),
  );
  await run(
    `document.querySelector('[aria-label="Player controls style"] button[role=radio]:last-of-type').click();btnSettings.click()`,
  );
  await delay(180);
  check(
    "Packaged Sculpted controls use the curved glass material",
    await run(
      `document.documentElement.dataset.controls==='sculpted'&&getComputedStyle(document.querySelector('.sculpted-bridge')).clipPath.includes('sculpted-contour')&&localStorage.getItem('aura-controls-style')==='sculpted'`,
    ),
  );
  await run(
    `document.querySelector('[aria-label="Music view"] button[role=radio]:last-of-type').click()`,
  );
  await delay(250);
  check(
    "Packaged Library navigation is an integrated view",
    await run(
      `document.getElementById('queue-panel').dataset.view==='library'&&!libraryModal.classList.contains('open')`,
    ),
  );
  const library = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(
    path.join(output, "packaged-library.png"),
    Buffer.from(library.data, "base64"),
  );
  await run(
    `document.querySelector('[aria-label="Music view"] button[role=radio]:first-of-type').click()`,
  );
  await delay(150);
  check(
    "Packaged dock has native refraction and flat track rows",
    await run(
      `getComputedStyle(document.documentElement.dataset.controls==='sculpted'?document.querySelector('.sculpted-bridge'):document.getElementById('controls')).backdropFilter.includes('url(')&&document.querySelectorAll('.track-row .lg-glass').length===0`,
    ),
  );
  await run(`btnFloatingLyrics.click()`);
  let target;
  for (let i = 0; i < 50; i++) {
    const targets = await (
      await fetch("http://127.0.0.1:9228/json/list")
    ).json();
    target = targets.find((item) => item.url.includes("floating-lyrics.html"));
    if (target) break;
    await delay(100);
  }
  if (!target) throw Error("Packaged floating window did not open");
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });
  let id = 0;
  const pending = new Map();
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    const task = pending.get(message.id);
    if (task) {
      pending.delete(message.id);
      message.error
        ? task.reject(Error(JSON.stringify(message.error)))
        : task.resolve(message.result);
    }
  };
  const childSend = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const key = ++id;
      pending.set(key, { resolve, reject });
      socket.send(JSON.stringify({ id: key, method, params }));
    });
  const childRun = async (expression) => {
    const result = await childSend("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails)
      throw Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  try {
    for (let i = 0; i < 50; i++) {
      if (
        await childRun(
          `document.querySelectorAll('.floating-lyrics-control .lucide').length===4`,
        )
      )
        break;
      await delay(100);
    }
    await run(
      `window.electronAPI.updateFloatingLyrics({lines:['Previous line','','Packaged floating lyric','Next line','',''],activeIndex:2,transition:'forward'})`,
    );
    await delay(500);
    check(
      "Packaged floating lyrics load bundled Lucide icons and synchronize",
      await childRun(
        `document.querySelectorAll('.floating-lyrics-control .lucide').length===4&&document.querySelector('.floating-lyric.current').textContent==='Packaged floating lyric'`,
      ),
    );
    check(
      "Packaged floating renderer remains transparent and isolated",
      await childRun(
        `getComputedStyle(document.body).backgroundColor==='rgba(0, 0, 0, 0)'&&typeof require==='undefined'`,
      ),
    );
    const image = await childSend("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(
      path.join(output, "packaged-floating.png"),
      Buffer.from(image.data, "base64"),
    );
  } finally {
    socket.close();
    await run(`btnFloatingLyrics.click()`);
  }
};
