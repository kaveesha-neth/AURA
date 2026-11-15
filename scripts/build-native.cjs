'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
if (process.platform !== 'win32') { console.log('Windows media bridge build skipped on this platform.'); process.exit(0); }
const root = path.resolve(__dirname, '..');
const cliHome = path.join(root, '.cache', 'dotnet');
const temp = path.join(root, '.cache', 'dotnet-temp');
fs.mkdirSync(cliHome, { recursive: true }); fs.mkdirSync(temp, { recursive: true });
const args = ['publish', path.join(root, 'native/WindowsMediaBridge/WindowsMediaBridge.csproj'), '-c', 'Release', '-r', 'win-x64', '--self-contained', 'true', '-o', path.join(root, 'resources/windows-media'), '-p:NuGetAudit=false', '--ignore-failed-sources'];
// Use the existing SDK package cache when building without network access.
const packages = path.join(os.homedir(), '.nuget', 'packages');
if (fs.existsSync(packages)) args.push(`-p:RestoreAdditionalProjectFallbackFolders=${packages}`);
const result = spawnSync('dotnet', args, { cwd: root, stdio: 'inherit', windowsHide: true,
  env: { ...process.env, DOTNET_CLI_HOME: cliHome, DOTNET_CLI_TELEMETRY_OPTOUT: '1', DOTNET_SKIP_FIRST_TIME_EXPERIENCE: '1', DOTNET_GENERATE_ASPNET_CERTIFICATE: 'false', TEMP: temp, TMP: temp } });
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
