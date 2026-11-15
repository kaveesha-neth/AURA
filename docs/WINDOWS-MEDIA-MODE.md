# Windows media mode — AURA 3.2.0

Version 3.2.1 replaces the original media-session backend with a compiled .NET bridge. See [the replacement and diagnostic details](WINDOWS-MEDIA-BRIDGE.md).

The touch header now switches between **AURA player** and **Windows media**. Native mode retains the current library playback and queue. In Windows mode, the left panel displays the selected app's artwork, title, artist, timeline, and transport controls. The right side replaces the queue with independently scrollable media-session cards above independently scrollable audio-output choices. The master-volume fader remains available for both sources.

Session cards identify the app, media, playback state, and selected session. Selecting a card changes the target of AURA's controls without starting or pausing external apps. Switching into Windows mode pauses native AURA playback to prevent overlapping audio. Returning restores the queue without autoplay. Closed sessions fall back to another available session. Empty and denied-access states disable transport controls and explain availability.

The Windows session bridge uses [GlobalSystemMediaTransportControlsSessionManager](https://learn.microsoft.com/en-us/uwp/api/windows.media.control.globalsystemmediatransportcontrolssessionmanager), available on Windows 10 version 1809 and newer. Only apps exposing Windows media sessions appear; ordinary audio streams without media-session integration are not discoverable through this API. Controls follow each session's [reported capabilities](https://learn.microsoft.com/en-us/uwp/api/windows.media.control.globalsystemmediatransportcontrolssessionplaybackcontrols). Session-specific commands and keyboard shortcuts target the selected session. The native AURA session is excluded to avoid controlling itself.

The audio-output panel enumerates active Windows playback endpoints with friendly names and default status. Selection changes the console and multimedia default endpoint, preserving the communications default. Apps using custom routing retain that routing. The endpoint-switching interface is Windows' undocumented IPolicyConfig interface; the panel reports failure and offers Windows sound settings if switching is unavailable. Master volume follows the new endpoint automatically. No output or volume preference is applied automatically on startup.

Both native bridges run as hidden persistent processes with bounded commands, main-frame-only IPC, native resource cleanup, process shutdown, and restart after failure. Session commands are checked against current sessions and capabilities; seeking validates bounds. Artwork is read from the Windows-provided thumbnail stream with size and image-type limits. UTF-8 preserves media and device names. The helper files are unpacked beside the app archive for packaged execution.

## Verification

- TypeScript and production renderer builds pass.
- 54 existing Electron integration checks pass, preserving native playback, queue, master volume, fullscreen, lyrics, and library behavior.
- 15 focused unit tests pass, including session command targeting, invalid/stale targets, capability checks, seek bounds, pending-command cleanup, output validation, and native-volume behavior.
- 21 packaged-app checks pass, including the native Windows helpers, source switching, real audio-output discovery, return to the native queue, and absence of uncaught renderer exceptions. Both unpacked helper files were checked against the current source before packaged verification.
- The new UI audit covers native-to-Windows switching, selection without autoplay, capability-based disabling, session-specific transport and keyboard routing, output selection, session removal, empty/denied states, restoration of the native queue, and layouts at desktop, 1120×750, 960×600, and 750×950. Results: [checks.json](windows-media/checks.json).
- Real Windows audio discovery found four playback endpoints. Reselecting the current default through the native output-switching interface succeeded, preserving the user's current routing.
- **Live media-session limitation:** the restricted execution environment returns `UnauthorizedAccessException` from Windows' media-session manager. Real external-app enumeration, thumbnails, and remote transport could not be verified here. Deterministic simulated sessions verify the UI and routing contract; they are test-only and are not included as product data. The production app uses the native Windows API and displays an explicit denied-access fallback.

## Preview

These screenshots use controlled test sessions rather than personal media-session data.

- [Desktop](windows-media/01-windows-media-desktop.png)
- [Laptop](windows-media/02-windows-media-laptop.png)
- [Compact](windows-media/03-windows-media-compact.png)
- [Portrait](windows-media/04-windows-media-portrait.png)
- [Empty sessions](windows-media/05-empty-sessions.png)

Build with `npm run build-win -- --config.directories.output=dist/installer-3.2.0`. The installer is copied to `dist/standalone/AURA-3.0-Setup-3.2.0.exe` with a blockmap and SHA-256 checksum.
