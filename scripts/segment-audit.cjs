const fs = require("node:fs");
const path = require("node:path");
module.exports = async ({ win, run, capture, check, delay, output }) => {
  const results = [];
  for (const width of [1120, 750]) {
    win.setSize(width, 824);
    await delay(250);
    for (const [name, selector] of [
      ["navigation", ".browser-nav .lg-segmented"],
      ["theme", ".preference-segments:not(.delay-segments)"],
      ["fullscreen-delay", ".delay-segments"],
    ]) {
      if(name==='theme') {await run(`document.getElementById('btn-settings').click()`);await delay(250);}
      const count = await run(
        `document.querySelector(${JSON.stringify(selector)}).querySelectorAll('button.lg-tab').length`,
      );
      for (let index = 0; index < count; index++) {
        await run(
          `document.querySelector(${JSON.stringify(selector)}).querySelectorAll('button.lg-tab')[${index}].click()`,
        );
        await delay(800);
        const box = await run(
          `(()=>{const root=document.querySelector(${JSON.stringify(selector)}),pill=root.querySelector('.lg-segmented-thumb'),tab=root.querySelector('button[data-selected]');const r=e=>{const b=e.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height,cx:b.x+b.width/2,cy:b.y+b.height/2}};return {root:r(root),pill:r(pill),tab:r(tab)}})()`,
        );
        results.push({ width, name, index, ...box });
        fs.writeFileSync(path.join(output, 'geometry.json'), JSON.stringify(results,null,2));
        if (!process.argv.includes("--baseline"))
          check(
            `${name} selection ${index + 1} centered and contained at ${width}`,
            Math.abs(box.root.cy - box.pill.cy) < 0.1 &&
              Math.abs(box.tab.cx - box.pill.cx) < 0.1 &&
              box.pill.x >= box.root.x &&
              box.pill.y >= box.root.y &&
              box.pill.y + box.pill.h <= box.root.y + box.root.h + 0.1 &&
              box.pill.x + box.pill.w <= box.root.x + box.root.w + 0.1,
          );
        if (index === 0 && width === 1120) {
          const b = box.root;
          fs.writeFileSync(
            path.join(output, `${name}.png`),
            (
              await win.webContents.capturePage({
                x: Math.max(0, Math.floor(b.x) - 8),
                y: Math.max(0, Math.floor(b.y) - 8),
                width: Math.ceil(b.w) + 16,
                height: Math.ceil(b.h) + 16,
              })
            ).toPNG(),
          );
        }
      }
    }
    await capture(`settings-${width}`);
    await run(`document.getElementById('btn-settings').click()`);
    await delay(100);
  }
  await run(
    `document.querySelector('[aria-label="Music view"] button[role=radio]').click();document.querySelector('#theme-options [data-theme=midnight]').click();`,
  );
  fs.writeFileSync(
    path.join(output, "geometry.json"),
    JSON.stringify(results, null, 2),
  );
};
