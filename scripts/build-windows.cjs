'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const projectDir = path.resolve(__dirname, '..');
// NSIS needs substantial temporary space. Keep it on the project's drive,
// rather than filling the user's Windows system drive during compression.
const tempRoot = path.join(projectDir, '.cache', 'build-temp');
fs.mkdirSync(tempRoot, { recursive: true });
const tempDir = fs.mkdtempSync(path.join(tempRoot, 'windows-'));
console.log(`Build temporary files: ${tempDir}`);

try {
  const result = spawnSync(process.execPath, [
    path.join(projectDir, 'node_modules', 'electron-builder', 'cli.js'),
    '--win', '--x64', ...process.argv.slice(2),
  ], {
    cwd: projectDir,
    stdio: 'inherit',
    windowsHide: true,
    env: { ...process.env, TEMP: tempDir, TMP: tempDir, TMPDIR: tempDir },
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} catch (error) {
  console.error(`Windows build failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  const relative = path.relative(tempRoot, tempDir);
  if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) {
    try { fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 250 }); }
    catch (error) { console.warn(`Could not clean build temporary files: ${error.message}`); }
  }
}
