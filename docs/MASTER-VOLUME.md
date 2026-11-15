# Master volume — AURA 3.1.1

On Windows, the desktop slider, touch fader, keyboard volume shortcuts, and mute button control the default playback endpoint through Windows Core Audio. The audio element stays at unity gain. Slider movement unmutes the endpoint, while the mute button preserves its volume level. Changes made through Windows or another application appear in both AURA views.

One hidden persistent PowerShell/C# helper reads the native endpoint every 100 ms and accepts bounded volume and mute commands over standard input. It follows default output-device changes and releases COM objects. Drag commands are coalesced over 25 ms. The main process restricts commands to the player frame; renderer code has no shell execution access. The helper is unpacked beside the app archive so the packaged application can execute it. It exits when AURA closes and restarts after unexpected failure. Unavailable audio devices disable the controls rather than applying a separate app volume. Other platforms retain the original app-volume behavior.

AURA reads master volume on startup and renderer reload. It never restores saved app volume onto the Windows master endpoint.

Validation:

- 11 dedicated live Windows checks passed: independent native volume observation, actual master-volume writes, external changes in desktop and touch views, mute synchronization, unity app gain, and safe startup/reload. The original Windows volume and mute state were restored after testing. See `docs/verification/master-volume-checks.json`.
- 54 Electron integration checks and 11 focused domain/bridge unit tests passed. The general playback suite uses a simulated master endpoint so its volume tests cannot change Windows loudness. The dedicated live suite uses the actual native endpoint.
- TypeScript and production renderer builds passed.
- All 18 packaged-app checks passed, including real native bridge startup from the unpacked helper. The NSIS 3.1.1 installer build completed; the final copy's version and SHA-256 checksum were verified.

Build: `npm run build-win -- --config.directories.output=dist/installer-3.1.1`. The release installer is copied to `dist/standalone/AURA-3.0-Setup-3.1.1.exe`; the staging folder avoids DLLs locked by a running previous version.
