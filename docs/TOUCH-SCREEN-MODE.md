# Touch screen mode — AURA 3.1.0

The hand button beside Settings enters native fullscreen. The new view follows the supplied reference: dark plum panels, square artwork, prominent track metadata, five large transport buttons, a queue, and a separate vertical volume fader. Playback uses the existing audio engine, queue, shuffle history, repeat mode, session persistence, and volume setting.

The queue supports direct playback, Play Next, removal, and local title/artist search. Controls have accessible labels and native range inputs support touch, mouse, and keyboard input. Missing artwork and empty queues have dedicated fallback states. The layout adapts to narrower displays. Exit or Escape restores the desktop and returns focus to the trigger. Native fullscreen exits also clear touch mode. Automatic immersive mode is suppressed while touch mode is active. Settings returns to desktop settings; Add Music returns to the desktop file picker. Touch mode is deliberately a session view and is not restored automatically at startup.

## Native Queue / Lyrics view

The native playback card has a compact Queue / Lyrics selector centered at its bottom, using the same material and touch targets as the playback-source selector. Queue is the default; its search, track count, actions, and scroll position are retained when switching views. Lyrics fill the existing card above the selector, without changing the three-column layout or interrupting playback.

Native lyrics subscribe to the existing controller through a lightweight external store. They reuse the current track's retrieval, cache, parser, and audio timeline. The line presentation is shared with Windows Media and follows its font-size and visible-line preferences. Plain lyrics are shown as scrollable text labeled “Plain lyrics,” without simulated synchronized highlighting. Instrumental, loading, missing, and unavailable states appear in the same area.

The playback verification suite includes native lyrics checks and captures both views at a 1024 × 600 CSS viewport under `docs/verification/touch-native-*.png`. These checks use synthetic audio, cached lyrics, and an isolated profile; physical touchscreen validation is separate.

### Lyric wrapping fix — 3.3.1

Both touch playback sources now use natural-height lyric wrappers. The old fixed slots clipped Windows Media text and constrained native text to a slot instead of the whole viewport. The shared presentation measures rendered heights at lyric changes, viewport resizes, and font loads. It centers the active line and places neighboring lines outside its measured bounds; the outer lyrics viewport is the clipping boundary. Configured font sizes are preserved unless a line exceeds the entire viewport, when a bounded measurement search reduces its font size to fit. The native viewport remains above the Queue / Lyrics selector; card dimensions and playback synchronization are unchanged.

`scripts/verify-lyric-layout.cjs` exercises single-line, wrapped, multiline, and exceptionally long text in both sources, with 18/32/48 px fonts, 1/3/7 visible lines, and 1024 × 600 and 800 × 600 viewports. It checks centering, full text bounds, neighbor separation, font preservation/fallback, stable surrounding cards, and animation frames between different-height lines. Results and screenshots are written to `.cache/lyric-layout-results/`.

## Original 3.1.0 validation

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
