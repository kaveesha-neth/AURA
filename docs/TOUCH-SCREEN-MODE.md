# Touch screen mode — AURA 3.1.0

The hand button beside Settings enters native fullscreen. The new view follows the supplied reference: dark plum panels, square artwork, prominent track metadata, five large transport buttons, a queue, and a separate vertical volume fader. Playback uses the existing audio engine, queue, shuffle history, repeat mode, session persistence, and volume setting.

The queue supports direct playback, Play Next, removal, and local title/artist search. Controls have accessible labels and native range inputs support touch, mouse, and keyboard input. Missing artwork and empty queues have dedicated fallback states. The layout adapts to narrower displays. Exit or Escape restores the desktop and returns focus to the trigger. Native fullscreen exits also clear touch mode. Automatic immersive mode is suppressed while touch mode is active. Settings returns to desktop settings; Add Music returns to the desktop file picker. Touch mode is deliberately a session view and is not restored automatically at startup.

## Validation

- TypeScript check and production renderer build passed.
- 54 Electron integration checks passed, including actual Chromium touch contacts for seek and vertical volume, shared pause/shuffle/repeat state, native fullscreen, Escape and focus restoration, session restoration, and existing playback/library behavior. No renderer errors.
- 17 packaged-app checks passed, including version 3.1.0, local playback, touch entry/exit, queue synchronization, desktop control styles, library, settings, floating lyrics, and isolation. No uncaught exceptions.
- Seven focused domain tests passed. The complete unit suite stalled in the existing YouTube process-wrapper area; it did not complete.
- Verification used `--disable-gpu --in-process-gpu --no-sandbox` because the environment's GPU subprocess could not start. These are verification flags only; the production app's security configuration is unchanged.

Screenshots: [touch view](verification/touch-screen.png), [packaged touch view](verification/touch-screen-packaged.png). Machine-readable results: [integration checks](verification/checks.json), [packaged checks](verification/packaged-checks.json).

## Build output

The 3.1.0 unpacked Windows application was built and verified at `dist/standalone/win-unpacked/AURA-3.0.exe`. Keep its companion files alongside the executable.

After disk space was freed, the complete renderer and Windows NSIS installer were rebuilt successfully. The installer is available at `dist/standalone/AURA-3.0-Setup-3.1.0.exe`, with its blockmap and SHA-256 checksum alongside it. Its product version and the embedded app package both identify version 3.1.0, and the copied installer's checksum matches the build output. The installer includes normal installation and uninstallation support and does not require the unpacked app's companion files.

This build used `npm run build-win -- --config.directories.output=dist/installer-3.1.0`, then copied the installer to `dist/standalone`. The separate staging folder avoids a DLL locked by a running app in the original unpacked folder. The build script uses the installed Electron distribution, avoiding a redundant network download.
