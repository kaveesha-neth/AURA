# AURA

An atmospheric desktop music player built with Electron, React, TypeScript, Vite, and real [Glisse](https://github.com/0kzh/glisse) Liquid Glass components.

This is a separate application that installs alongside the original AURA. It has its own Windows application ID, shortcuts, uninstaller, and `%APPDATA%\AURA 3.0` data directory. It starts with an independent library; the original AURA library and preferences are untouched.

Square album artwork, quiet album-derived lighting, a floating playback dock, a dense searchable queue, immersive synchronized lyrics, and a lightweight always-on-top lyric window.

## Run

Use Node.js 22.12+ (Node 24 recommended).

```powershell
npm install
npm run dev
```

`npm run dev` starts Vite and opens Electron. The Electron window is required for library access, local audio, and native window controls. Renderer edits may reload the page to keep the compatibility controller synchronized.

To run the compiled renderer locally:

```powershell
npm start
```

## Build

```powershell
npm run build-win
```

Builds are grouped by version under `dist/releases/<version>/`. Current installer: `dist/releases/3.2.2/AURA-Setup-3.2.2.exe`. Run without installing using `dist/releases/3.2.2/win-unpacked/AURA.exe`, keeping that entire folder together. Older mixed build outputs are archived under `dist/archive/pre-3.2.2/`; see `dist/README.md` for deletion guidance.

The Windows build uses temporary space under `.cache/build-temp` on the project drive. `build-win` does not publish a release. Automatic updates and `release-win` are disabled until a separate publishing destination and update feed are configured. This app does not use the original AURA GitHub release feed. macOS and Linux build scripts are retained but require their corresponding build environments.

## Your music

- Windows media sessions use the self-contained .NET 8 bridge introduced in 3.2.1. A separate .NET installation is not needed to run AURA. Development builds require the .NET 8 SDK; `npm run build:native` builds the bridge, and `start`, `dev`, and `build-win` include that step automatically. If Windows media fails, expand **Connection details** and use **Open connection log**. See [bridge replacement and verification](docs/WINDOWS-MEDIA-BRIDGE.md).
- **Touch playback sources**: use **AURA player** for the local library and queue, or **Windows media** to control a selected Windows media session. Windows mode shows scrollable app cards above an audio-output selector. Selecting a card changes the session being controlled without starting it. AURA pauses its own playback when switching to Windows mode; returning restores the queue without autoplay. Play/pause, previous/next, seek, shuffle, and repeat are enabled only when the selected app supports them. The output selector changes the Windows default output; custom per-app routes stay with those apps. Windows sound settings are available from the output panel. See [Windows media mode](docs/WINDOWS-MEDIA-MODE.md).
- On Windows, both volume sliders and the mute button control the **system master volume** for the default output device. Windows volume keys, the taskbar slider, external mute changes, and output-device changes are reflected in AURA. Startup reads the current system level; saved player volume does not overwrite it. Other operating systems retain app volume control.
- **Touch screen mode**: click the hand icon beside Settings in the title bar. AURA enters native fullscreen with large playback controls, artwork, a searchable queue, Play Next and Remove actions, and a vertical touch volume slider. Playback and queue state stay synchronized with the desktop player. Press Escape or use the exit button to return. Settings returns to the desktop settings panel; Add Music opens the file picker. Touch mode stays active until you exit it, including when music is paused.
- Add files, add folders, or drop music into the window.
- **Queue** and **Library** are separate views in the content header. Library has its own search and sorting, with Play, Play Next, and Add to Queue actions. **Music sources** opens saved folder/file management.
- Search the queue without changing playback order. Sort by artist, album, or date added; combine sorts, and use the row menu or right-click for Play Next and removal.
- Drag anywhere on a queue row to reorder, with a floating row, moving insertion pocket, animated reflow, and edge scrolling. Escape cancels; Alt + Up/Down on the row's reorder button provides keyboard access. Clear search and sorting before manual reordering.
- Shuffle establishes a visible playback order. Previous/Next retain shuffle history. Right-click Shuffle or press Shift+S to reshuffle upcoming tracks.
- The audio-settings icon opens the five-band equalizer. Use pointer or arrow keys; double-click a band or use Home to reset it.
- Expand enters immersive artwork and lyrics. Double-click artwork to refresh lyrics.
- Floating lyrics, click-through, scale, visible line count, automatic fullscreen, OLED mode, and reduced effects are available in Settings.
- Settings → Appearance → Player controls switches between **Sculpted**, the shaped glass bar with a raised circular Play/Pause button, and **Classic**, the original dock. The choice saves automatically; switching keeps playback running. Sculpted is the default for profiles without a saved choice. Fullscreen retains its existing controls.
- Discover online retains YouTube/YouTube Music search and downloads. It uses the existing external yt-dlp/FFmpeg tools; Check Tools reports their availability.

Supported library formats: MP3, FLAC, WAV, OGG, M4A, AAC, Opus, WMA, AIFF/AIF, MP4, M4B. Actual decoding depends on Electron/Chromium codec support.

## Shortcuts

| Key | Action |
| --- | --- |
| Space | Play / pause |
| Left / Right | Seek five seconds |
| Alt + Left / Right | Previous / Next |
| Up / Down | Volume |
| S | Toggle shuffle |
| Shift + S | Reshuffle upcoming tracks |
| R | Cycle repeat off / all / one |
| Esc | Exit fullscreen or close a panel |

Sliders support arrow keys. Text fields and native controls retain their own keyboard behavior.

## Data and architecture

Library sources, optimized artwork, lyrics, settings, playback sessions, and Chromium storage use the independent `%APPDATA%\AURA 3.0` profile. Downloads use `Music/AURA 3.0 Downloads`. These existing storage paths are preserved across the display-name change so libraries, preferences, and downloads remain available. Removing a source never deletes music files. The internal package name is `aura-3-atmospheric`, Windows app ID is `com.aura.musicplayer3`, and product/shortcut/uninstall name is `AURA`. No original-AURA data is automatically migrated or shared.

- `src/ui/`: React composition, shared virtual track lists, genuine Queue/Library navigation, material components, dialogs, and the unified `production.css` design/motion tokens.
- `src/core/`: linked-list queue, LRC parser, Web Audio graph, restricted local-media streaming protocol.
- `src/renderer.js`: retained playback/library/settings orchestration and UI compatibility adapter.
- `main.js`, `preload.js`: Electron backend and isolated IPC bridge.
- `src/floating-lyrics.*`: transparent lyric window and its lightweight material fallback.
- `renderer-dist/`: generated, relative-path frontend used by Electron and packaging.

See [AURA-3.0-REDESIGN-REPORT.md](AURA-3.0-REDESIGN-REPORT.md) for design decisions, the audit, verification evidence, and limitations. Original renderer sources and prior documentation are archived in `docs/original-renderer`.

The production refinement is documented in [AURA-3.0-UI-REFINEMENT-REPORT.md](AURA-3.0-UI-REFINEMENT-REPORT.md), with a [before-and-after gallery](docs/ui-refinement/comparison.html). Floating lyrics now has a separate Vite entry point and shares the locally bundled Lucide icon family.

## Verification

```powershell
npm run typecheck
npm test
npm run verify:electron
npm run verify:ui
npm run verify:alignment
```

The Electron suite creates synthetic audio and independent profiles under `.cache`; it does not test against your personal library. It records results and screenshots under `docs/verification`.

The focused [alignment audit](UI-ALIGNMENT-AUDIT.md) records measured geometry and pointer interaction results. Its before/after captures and bounding boxes are in `docs/alignment`.

To test the Vite renderer, keep `npm run dev:renderer` running in another terminal, then run `npm run verify:dev`. After building Windows and running the Electron suite, run `npm run verify:packaged` to exercise the real unpacked executable with an isolated profile.

Copyright © 2026 Kaveesha Nethmal. See [LICENSE](LICENSE).
