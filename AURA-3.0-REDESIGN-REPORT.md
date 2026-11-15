# AURA 3.0 — Atmospheric Liquid Glass

Implementation and verification report · 10 November 2026

## Standalone application identity

Per the follow-up instruction, this build is an independent application, not an update to the original AURA. Package: `aura-3-atmospheric`; app ID: `com.aura.musicplayer3`; product, Windows shortcut, and uninstall entry: `AURA 3.0`; executable: `AURA-3.0.exe`. A distinct app ID gives the NSIS installer its own installation/uninstallation identity.

Normal launches use `%APPDATA%\AURA 3.0` for both user data and Chromium session storage. Music downloads use `Music/AURA 3.0 Downloads`. The original profile is neither read for automatic migration nor modified. This app starts with its own library; existing music can be added without moving or deleting the files. Explicit `--user-data-dir` profiles remain available for isolated verification.

The old repository/publishing configuration was removed. Automatic update checks and release publishing are disabled until a dedicated feed is configured, preventing this app from consuming original-AURA updates. Updater implementation is preserved for a future independent channel.

Build artifacts are written to `dist/standalone`; use `AURA-3.0-Setup-3.0.0.exe` there. Previously generated artifacts outside that directory are superseded and do not represent the standalone build.

## What changed

The application now has a React/TypeScript renderer built by Vite, a new atmospheric design system, and actual Glisse 0.5.0 components. It remains a local Electron music player with its original scanning, metadata, lyrics cache, downloads, updater, and native window integrations.

The main player was reconstructed: square artwork replaces the spinning disc, metadata sits directly beneath it, the timeline precedes a compact glass playback dock, and a dedicated lyric strip leaves artwork recognizable. The queue uses flat aligned rows with thumbnails, artist/album information, virtualized scrolling, current-track indicators, real Glisse action menus, right-click actions, and drag-to-reorder.

Library navigation opens track browsing, while Music sources provides folder/file management. The five-band equalizer lives in a compact glass popover. Fullscreen preserves the artwork/lyrics composition with larger, wrapping text and a floating dock. The transparent lyric window retains its independent Electron lifecycle and uses a lightweight tinted fallback instead of pretending it can refract other applications.

## Audit and preservation decisions

The local files were treated as authoritative, including the local YouTube integration absent from some older documentation. Inspected inputs included package/scripts, the renderer HTML/CSS/controller, floating-window files and preload, main/preload, YouTube service/UI, regression tests, data format, assets, README, and original screenshots.

| System | Decision |
| --- | --- |
| Audio element and navigation semantics | Retained; UI reconnected to the same playback flow |
| Linked-list queue, fixed shuffle order, history | Extracted into a pure queue module; navigation retained |
| Web Audio five-band processing | Extracted into a single-owner audio graph; gains, bypass, reset retained |
| Library scans, metadata, deduplication, source management | Retained backend; upgraded parser using its existing dynamic-import API |
| Artwork extraction/cache and sidecars | Retained; media delivery now goes through an approved-path protocol |
| LRCLIB retrieval, retry limits, permanent cache | Retained; LRC parsing extracted and tested |
| Main HTML and stylesheet | Replaced; original renderer archived under `docs/original-renderer` |
| Fullscreen and floating lyrics lifecycle | Retained IPC and window rules; redesigned presentation |
| Theme, automatic fullscreen, floating preferences | Existing settings schema retained |
| YouTube search/download/cancel/tool checks | Retained service and UI behavior, restyled dialogs |
| Automatic updates | Implementation retained; original feed removed and checks/publishing disabled pending a separate channel |

No project library, artwork cache, lyric cache, songs, or existing user preferences were deleted. All application tests used new profiles below `.cache`. The package/product/app ID and normal data directory are now independent of original AURA. The old project `data/library.json`, its old absolute paths, and the original application's profile are left untouched.

## Architecture

```text
Electron main process
  main.js: library, metadata, covers, lyrics, settings, updater, native windows
  youtube.js: bounded search/download/cancellation service
  src/core/media-protocol.cjs: approved media, content types, byte ranges
       │
  preload.js: contextBridge / IPC, modern webUtils file-drop paths
       │
React renderer
  src/ui/App.tsx: player composition, navigation, dock, EQ, immersive view
  src/ui/QueueView.tsx + queue-store.ts: subscribed and windowed queue rendering
  src/ui/Secondary.tsx + ConfirmDialog.tsx: secondary surfaces and confirmation
  src/ui/layout.ts: artwork sizing against actual available space
  src/ui/tokens.css + atmosphere.css + refinement.css: shared design system
       │
  src/renderer.js: compatibility/orchestration controller
  src/core/music-queue.mjs: queue domain operations
  src/core/lyrics.mjs: pure LRC parser
  src/core/equalizer.mjs: one Web Audio graph per audio element
  src/core/media-url.mjs: consistent encoded media URLs

Separate transparent Electron window
  src/floating-lyrics.* + lyrics-overlay-preload.js
```

React owns the new composition and queue rendering. The controller intentionally retains imperative updates to stable playback/lyric/timeline hosts and library-result hosts. This avoids routing high-frequency audio progress through the entire React tree and preserves the established async playback/cache behavior. It is a working hybrid renderer, not a second disconnected mock interface; all visible actions reach the same controller and bridge.

Vite emits relative assets to `renderer-dist`. Electron uses that directory in ordinary/packaged launches and the explicitly allowed localhost URL during development. Development refreshes reload the compatibility controller safely instead of redeclaring its global lexical bindings.

Versions installed: React/React DOM 19.3.1, Glisse 0.5.0, Vite 8.3.7, TypeScript 7.0.2, Electron 41.2.1, music-metadata 12.3.5, stable electron-builder 26.18.0. The lockfile records exact dependency resolution.

## Glisse research and integration

Reviewed the [repository](https://github.com/0kzh/glisse), installed declaration files, distributed implementation, styling injection, refraction hooks, theme variables, reduced-motion handling, and Chromium backdrop path. Retrieved and read the current [documentation and demo examples](https://glisse.kelvinzhang.ca), including Glass bend/dispersion/frost/rim settings, button variants, segmented navigation, menus, input, slider, and switch examples. The web fetcher initially failed for the documentation site; a direct public-page fetch succeeded.

Verified exports include Glass, Button, Slider, Switch, SearchField, Menu, SegmentedControl, TabBar, and Input. AURA uses Glass, Button, SearchField, Menu, SegmentedControl, and Switch with the installed API. Custom timelines and EQ controls preserve existing precise seeking and vertical-gain behavior. No undocumented orientation or theme-provider API is assumed.

Glisse styles are bundled/injected locally. The design uses its material for floating interaction surfaces, not track-row backgrounds. Dark variables are centralized, effects have a reduced preference, and no external font is required.

## Design decisions

- Near-black neutral background with restrained lavender controls and an artwork-derived ambient color sampled once per image load. A registered color property interpolates track changes.
- Stable softly tinted queue surface; flat rows rather than independent glass cards.
- System sans typography for offline availability and clear Windows rendering. Branding uses spaced AURA lettering and a small waveform.
- Album artwork remains square, unspun, and recognizable. A ResizeObserver budgets its size against actual metadata, controls, and lyric heights, including compact windows.
- Playback controls have one obvious light Play/Pause button. Auxiliary audio/fullscreen/floating controls sit together below it.
- Lyrics are separate from artwork in compact mode. Fullscreen text wraps and scrolls without a frosted text card; the current line remains prominent.
- Secondary surfaces share spacing, colors, input treatment, and dialog hierarchy. Source-clearing confirmation is styled and defaults to keeping sources.
- Reduced motion disables decorative transitions; reduced effects removes backdrop filtering from material surfaces.

## Integration repairs

1. Fixed drag/drop for modern Electron by resolving File paths through preload's `webUtils.getPathForFile`, without exposing Node in the renderer.
2. Removed an invalid Media Session `shuffle` action registration. Valid play/pause/previous/next handlers remain.
3. Removed duplicate Media Session definitions and obsolete imperative queue drag code after migrating queue interaction to React.
4. Added persistent playback sessions in a separate atomically replaced `player-state.json`: queue order, current track/time, volume, repeat, shuffle order/history/remaining tracks, EQ gains, and bypass. Startup restores paused. Existing library/settings files are not repurposed.
5. Introduced a restricted `aura-media` protocol with explicit MIME types and byte-range responses. Only approved library media/artwork and cover-cache images are served. Chromium `webSecurity` is now enabled, with Node integration disabled and context isolation retained. This follows Electron's [custom protocol](https://www.electronjs.org/docs/latest/api/protocol) model.
6. Added keyboard operation and ARIA values for seek, volume, and EQ, panel focus containment, visible focus states, descriptive controls, and nonblocking error notifications.
7. Replaced the outdated metadata dependency and prerelease packaging dependency. `npm audit --omit=dev` reports zero vulnerabilities.

## Verification and evidence

Verification results and captured windows are in `docs/verification`. The automation generates short WAV fixtures and uses existing artwork copies; fixture lyrics are clearly synthetic. It never points application writes at the personal library profile.

The integration suite checks real Electron IPC and audio rather than rendering a browser-only imitation. It covers:

- Main renderer startup and actual Glisse initialization.
- File/folder import, deduplication, rescanning, artwork, saved sources, and source removal without deleting files.
- Real WAV playback/time advancement, pause, previous/next, pointer seeking, keyboard seeking, volume, and byte-range media delivery.
- Queue search without reorder, Play Next, node reorder/removal, sort, fixed shuffle order, repeat, and a bounded mounted row count for more than 5,000 entries.
- Five live Web Audio filter nodes, gain changes, and double-click reset.
- Library dialogs, styled source-clear confirmation, settings, and saved OLED preference.
- Timed lyric parsing/active lines, native fullscreen, transparent always-on-top lyrics, and synchronization to the floating window.
- Online search dialog connectivity, laptop/compact layouts, session save/reload, Node isolation, Chromium web security, minimize, maximize, restore, and close IPC.

`npm test` passes 17 regression tests, including queue/history/download error paths and Unicode/multiple-timestamp LRC cases. `npm run typecheck` and the production renderer build pass. The development integration run records 40 passing checks; the expanded compiled-renderer suite records 43 checks, including folder/rescan/source-preservation coverage. Exact current results are in the JSON artifacts.

Windows NSIS packaging uses stable electron-builder 26.18.0. The standalone installer is `dist/standalone/AURA-3.0-Setup-3.0.0.exe`. Packaged verification uses a fresh `--user-data-dir` profile and checks React/Glisse startup, version 3.0.0, standalone title, Node isolation, IPC import, isolated data writes, actual local playback, settings version, and uncaught exceptions. Current results are in `docs/verification/packaged-checks.json`; the actual packaged window is captured in `11-packaged.png`.

The standalone revision passed 19 regression tests, 43 compiled-renderer checks, TypeScript checking, and all 9 packaged-executable checks. Packaged inspection also confirmed `aura-3-atmospheric`, disabled automatic updates, inclusion of the standalone identity module, no `app-update.yml` pointing to the original feed, and Windows executable product metadata `AURA 3.0`. The earlier development run passed 40 checks. Installer installation, signing, publishing, and hardware-only checks are not claimed as performed.

## Practical limits and remaining manual checks

- Physical media keys, actual Windows click-through over another application, multi-monitor placement restoration, and audible output quality still need hands-on hardware testing. Their existing bridge/window paths are retained; automated synchronization and the actual audio graph were exercised.
- Live LRCLIB matching, YouTube downloads, and update-server delivery depend on network/providers, installed external tools, and release availability. Existing queue/YouTube regression tests pass and the dialogs are connected; this report does not claim a real third-party download or production update was performed.
- Native file-picker selection and OS titlebar dragging/resizing need a final manual desktop pass. Programmatic resizing and native window-control IPC were exercised.
- Long plain lyrics retain the original approximate timing behavior; only LRC provides actual synchronized timestamps.
- Library song browsing retains the existing 700-result cap with search to narrow results. The primary queue is virtualized and supports much larger collections.
- The Windows installer is unsigned because no signing certificate is configured. It was built locally and not installed over the user's application or published. macOS/Linux packaging was not executed on this Windows host.
- The production dependency audit is clean. The packaging/development dependency tree still contains upstream audit findings; no forced incompatible dependency overrides were applied.

## Commands

```powershell
npm install
npm run dev                 # Vite + Electron
npm start                   # Build renderer and open Electron
npm run typecheck
npm test
npm run verify:electron     # Isolated compiled-renderer integration checks
npm run build-win           # Local Windows installer, no publishing
npm run verify:packaged     # Isolated real unpacked-executable checks
```

For development verification, keep `npm run dev:renderer` running separately and execute `npm run verify:dev`.
