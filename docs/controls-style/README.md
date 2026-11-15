# Player control styles

Settings → Appearance → Player controls offers **Sculpted** (the new default) and **Classic** (the existing dock). The selection is saved in the independent AURA 3.0 renderer profile. Fullscreen retains its current controls.

Sculpted uses a vector-clipped Glisse glass bridge, raised circular Play/Pause button, separate rounded glass Shuffle/Repeat surfaces, and bundled Lucide Rewind/FastForward icons. It is rendered UI, not the reference image used as a background. Geometry and material styles live in `src/ui/sculpted-controls.css`; shared transport composition remains in `Player.tsx`. Buttons retain their original DOM identities and IDs so switching styles does not replace engine-bound controls or interrupt audio. No audio/queue/library logic was changed.

The Electron control-style audit passed 54 checks, including both styles during playback, button identity, persistence across reload for both choices, restored playback, and fitting 1400×900, 1120×824, 750×600 and queue-collapsed windows. Source typecheck and the 19 existing unit tests pass. Test profiles are isolated; personal music/settings were not overwritten.

Actual rendered captures: [Sculpted detail](sculpted-dock.png), [main player](sculpted-1120.png), [narrow player](sculpted-750.png), [compact player](sculpted-compact.png), [settings](settings-sculpted.png), [Classic player](classic-main.png). `checks.json` and `runtime-errors.json` record the run.

Repeat with `npm run verify:controls`. Advanced optics depend on Electron/GPU rendering; Reduced effects uses the existing fallback. Windows packaging and the independent application identity remain unchanged.

The broader UI audit passed 79 checks with Sculpted enabled, and the rebuilt Windows executable passed 15 checks including both style selections. The final packaged appearance was visually inspected; see [packaged screenshot](packaged.png). The installer was rebuilt at `dist/standalone/AURA-3.0-Setup-3.0.0.exe`; no installer/uninstaller cycle was run.
