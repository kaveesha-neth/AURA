const fs = require("node:fs");
const path = require("node:path");
module.exports = async ({ win, run, capture, check, delay, output }) => {
  const measurements = [];
  for (const [width, height] of [
    [1400, 900],
    [1120, 824],
    [960, 720],
    [750, 600],
  ]) {
    win.setSize(width, height);
    await delay(400);
    const geometry = await run(
      `(()=>{const r=s=>{const e=document.querySelector(s);if(!e)return null;const b=e.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height,cx:b.x+b.width/2,cy:b.y+b.height/2}};return {viewport:[innerWidth,innerHeight],dock:r('#controls'),play:r('#btn-play'),buttons:Array.from(document.querySelectorAll('#controls>button')).map(e=>r('#'+e.id)),volume:r('#vol-icon'),slider:r('#vol-track'),utilities:r('.utility-actions'),search:r('.browser-search'),toolbar:r('.browser-toolbar'),headers:Array.from(document.querySelectorAll('[aria-label="Queue view"] .track-columns span')).map(e=>({x:e.getBoundingClientRect().x,w:e.getBoundingClientRect().width})),row:r('.q-item'),title:r('.q-item .track-meta'),album:r('.q-item .track-album'),duration:r('.q-item .track-duration'),menu:r('.q-item .track-menu'),nav:r('.browser-nav .lg-segmented'),discover:r('.discover-action'),cover:r('#cover-wrap'),metadata:r('#song-info'),timeline:r('#seekbar-area'),lyrics:r('#lyrics-overlay'),titlebar:r('#titlebar'),windowButtons:Array.from(document.querySelectorAll('.window-controls button')).map(e=>r('#'+e.id))}})()`,
    );
    measurements.push({ size: [width, height], ...geometry });
    await capture(`alignment-${width}`);
    if (!process.argv.includes("--baseline")) {
      check(
        `Dock and primary button centers agree at ${width}`,
        Math.abs(geometry.play.cx - geometry.dock.cx) < 0.1 &&
          Math.abs(geometry.play.cy - geometry.dock.cy) < 0.1,
      );
      check(
        `Transport hitboxes share a centerline at ${width}`,
        geometry.buttons.every((b) => Math.abs(b.cy - geometry.play.cy) < 0.1),
      );
      check(
        `Headers align with row columns at ${width}`,
        Math.abs(geometry.headers[0].x - geometry.title.x) < 0.1 &&
          Math.abs(
            geometry.headers[2].x +
              geometry.headers[2].w -
              geometry.duration.x -
              geometry.duration.w,
          ) < 0.1,
      );
      check(
        `Player and navigation align at ${width}`,
        Math.abs(geometry.cover.cx - geometry.metadata.cx) < 0.1 &&
          Math.abs(geometry.timeline.cx - geometry.lyrics.cx) < 0.1 &&
          Math.abs(geometry.volume.cy - geometry.utilities.cy) < 0.1 &&
          Math.abs(geometry.nav.cy - geometry.discover.cy) < 0.1,
      );
    }
  }
  fs.writeFileSync(
    path.join(output, "geometry.json"),
    JSON.stringify(measurements, null, 2),
  );
  win.setSize(1120, 824);
  await delay(200);
  if (!process.argv.includes("--baseline"))
    await require("./sortable-audit.cjs")({
      win,
      run,
      capture,
      check,
      delay,
      output,
    });
};
