const { spawn } = require("node:child_process");
const path = require("node:path");
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
if (process.argv.includes("--dev"))
  env.AURA_RENDERER_URL = "http://127.0.0.1:5173";
else delete env.AURA_RENDERER_URL;
const child = spawn(
  require("electron"),
  [
    path.join(__dirname, "verify-electron.cjs"),
    ...process.argv.slice(2).filter((arg) => arg !== "--dev"),
  ],
  {
    cwd: path.resolve(__dirname, ".."),
    env,
    stdio: "inherit",
    windowsHide: true,
  },
);
child.on("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});
child.on("exit", (code) => (process.exitCode = code ?? 1));
