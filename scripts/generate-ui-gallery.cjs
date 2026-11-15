const fs = require("node:fs");
const path = require("node:path");
const directory = path.resolve(__dirname, "../docs/ui-refinement");
const pairs = [
  ["Player and queue", "02-playing.png", "02-playing.png"],
  ["Library navigation", "04-library.png", "12-library-view.png"],
  ["Music sources", "04-library.png", "18-sources.png"],
  ["Settings", "05-settings.png", "20-settings.png"],
  ["Equalizer", "03-equalizer.png", "03-equalizer.png"],
  ["Fullscreen", "06-immersive.png", "06-immersive.png"],
  ["Floating lyrics", "07-floating.png", "07-floating.png"],
  ["Compact window", "10-compact.png", "10-compact.png"],
];
const image = (folder, file, label) =>
  `<figure><a href="${folder}/${file}" target="_blank"><img src="${folder}/${file}" alt="${label}" loading="lazy"></a><figcaption>${label}</figcaption></figure>`;
const extra = fs
  .readdirSync(path.join(directory, "after"))
  .filter((file) => file.endsWith(".png"));
fs.writeFileSync(
  path.join(directory, "comparison.html"),
  `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AURA UI refinement comparison</title><style>body{margin:0;background:#10141b;color:#e8edf6;font:14px/1.6 system-ui,sans-serif;padding:32px}main{max-width:1700px;margin:auto}h1{font-size:30px;font-weight:600;margin:0 0 12px}h2{font-size:21px;font-weight:500;margin:40px 0 16px}p,figcaption{color:#a7b4c8}section{border-top:1px solid #ffffff14;margin-top:32px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:20px}figure{margin:0;min-width:0}img{max-width:100%;height:auto;max-height:680px;object-fit:contain;object-position:top;display:block;border-radius:10px;background:#0a0e14}figcaption{padding:10px 0}.states{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px}.states img{max-height:350px}@media(max-width:800px){body{padding:20px}.pair,.states{grid-template-columns:1fr}}</style><main><h1>AURA · UI refinement</h1><p>Before-and-after captures of the actual Electron application. Tests use an isolated, synthetic music library; fixture artwork comes from the existing cache. Click any image for its full resolution.</p>${pairs.map(([label, before, after]) => `<section><h2>${label}</h2><div class="pair">${image("before", before, "Before")}${image("after", after, "After")}</div></section>`).join("")}<section><h2>All captured states</h2><div class="states">${extra.map((file) => image("after", file, file.replace(".png", "").replaceAll("-", " "))).join("")}</div></section></main></html>`,
);
console.log("Generated docs/ui-refinement/comparison.html");
