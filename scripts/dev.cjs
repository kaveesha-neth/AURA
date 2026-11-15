const { spawn } = require("node:child_process");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const vite = spawn(
  process.execPath,
  [path.join(root, "node_modules/vite/bin/vite.js")],
  { cwd: root, stdio: "inherit", windowsHide: true },
);
let electron;
const timer = setInterval(async () => {
  try {
    if (!(await fetch("http://127.0.0.1:5173")).ok) return;
  } catch {
    return;
  }
  clearInterval(timer);
  const env = { ...process.env, AURA_RENDERER_URL: "http://127.0.0.1:5173" };
  delete env.ELECTRON_RUN_AS_NODE;
  electron = spawn(require("electron"), [".", "--dev"], {
    cwd: root,
    env,
    stdio: "inherit",
    windowsHide: true,
  });
  electron.on("exit", (code) => {
    vite.kill();
    process.exitCode = code || 0;
  });
}, 500);
function stop() {
  clearInterval(timer);
  electron?.kill();
  vite.kill();
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
