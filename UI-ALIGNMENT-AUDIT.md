# AURA 3.0 — alignment and queue interaction audit

## Segmented-control follow-up

Corrected the Queue/Library, Dark/OLED, and Automatic fullscreen selection pills. Nonzero `--lg-tab-inset` values offset the pills by 4 px in navigation and 3 px in preferences, while the labels retained their original origin. Both component groups now share a zero track inset and a consistent 2 px thumb inset. The fullscreen-delay control also stretched to 292 px while its six labels occupied 286 px, accumulating horizontal drift. It now sizes to six equal 48 px slots without flex stretching. These corrections change geometry only; selection behavior and saved settings are unchanged.

Checked every selection in all three controls at native window widths 1120 and 750 px, with DOM center/containment assertions and actual rendered crops. Before/after captures and measurements are in `docs/segments/{before,after}`. Repeat with `npm run build:renderer` followed by `node scripts/run-verification.cjs --segments`.

This pass preserves the existing visual identity, two-column layout, standalone app identity, and playback/library engine. Verification uses actual Windows Electron windows, DOM bounding boxes, native pointer/keyboard events, and captured rendered frames. Test profiles and synthetic music stay under `.cache`; personal libraries were not changed.

## Problems and corrections

| Problem / root cause | Correction |
| --- | --- |
| Play button box was centered, but its icon and empty ripple span occupied separate implicit grid rows; Glisse also supplied ordinary button padding/gap. | Explicit symmetric dock columns, zero padding/gap inside the primary icon button, one shared icon grid cell, and an absolutely positioned ripple layer. The existing small triangle optical adjustment remains intentional. |
| Header compensated for its scrollbar with a fixed margin; fractional Windows scaling produced about 2.4 px duration and 1.5 px album drift. | One shared column/gap definition and measured scrollbar gutter using actual content bounds. Header/row edges now agree within 0.02 CSS px at tested widths. |
| Search retained Glisse's default maximum width; toolbar buttons had different rectangular hitboxes. | Search fills its grid column, with two equal 38 px action columns and consistent gaps. |
| Volume icon differed from its utility peers; slider paint was offset from its interaction area's center. | Explicit volume grid, matching 32 px utility hitboxes, shared gaps, and centered slider rails/thumbs. |
| Popup close controls used negative margins and inconsistent widths; switches were scaled after layout. | Square 32 px header actions, no negative-margin correction, Glisse's native scale variable, and consistent equalizer label spacing. |
| Titlebar utility hitboxes were rectangular and window widths differed from the spacing system. | Square utility controls and consistent 44 px window-control widths; titlebar height and dragging behavior preserved. |
| Mouse-focused search inherited attention-heavy focus treatment. Text inputs can match `:focus-visible` even after clicking. | Shared input-modality tracking keeps mouse typing understated. Tab navigation retains a discreet one-pixel keyboard indicator across Glisse and plain search fields. |

Artwork, metadata, seekbar and lyrics retain their intended centered relationship and existing width hierarchy. Navigation and Discover already shared the correct centerline; they were measured and preserved. Ordinary Lucide icons use a shared stroke weight and fixed hitboxes independent of SVG dimensions. No corrective translation hacks were added; transforms implement dragging, reflow, and existing motion.

## Queue dragging

Reviewed maintained [dnd-kit](https://github.com/clauderic/dnd-kit), its [sortable/scrollable guidance](https://dndkit.com/legacy/presets/sortable/overview/), and [Motion layout techniques](https://motion.dev/docs/react-layout-animations). Chose a custom fixed-height virtual-list implementation in `src/ui/useQueueDrag.ts`: viewport-independent insertion mapping and critically damped transform springs avoid registering thousands of off-screen drop targets or adding another framework dependency. Native HTML5 reordering was removed.

- A five-pixel threshold separates clicks from dragging anywhere on the row. Menu controls remain independent; native image dragging is suppressed.
- A complete rendered row clone lifts into a single floating surface, retaining artwork, metadata, duration and control geometry. The source stays hidden and a full-height subtle pocket reserves its insertion slot.
- Neighbors continuously reflow with critically damped transform motion. One animation loop updates the small mounted window of rows; pointer movement does not publish queue state or rerender the full list.
- Proximity-based edge scrolling affects only the queue. Insertion math includes scroll displacement and stable track IDs.
- Drop animates into the pocket, commits through the existing `aura.move` command, and synchronously renders the settled order before revealing it. Escape animates back without committing. Window blur/resize and structural changes safely cancel.
- Existing current-track identity, playback position, repeat, shuffle history/remaining tracks, and session persistence stay intact. Alt + Up/Down keyboard reordering remains available.
- Manual reordering is disabled while filtered or sorted, with a visible explanation. Clear search/sorting first. Reduced motion removes spring movement and settling animation.

## Rendered verification

Native window sizes: **1400×900, 1120×824, 960×720, 750×600**, plus collapsed queue and native fullscreen. The broader regression audit also covers 1480×900 and wide/narrow immersive layouts. Windows display scaling affects screenshot pixel dimensions; measurements use actual CSS geometry.

At all four measured widths, dock/play center differences and transport vertical-center differences are below 0.1 px. Header/title and duration edges agree within 0.02 px. Artwork/metadata, timeline/lyrics, utility centerlines, navigation/Discover, and titlebar bounds were inspected. Hover, active, disabled, and keyboard focus states were exercised in the rendered app.

The pointer suite verifies artwork, title, artist, album, empty-space and number dragging; moving pocket and neighbor transforms; animated settling; normal click playback; current-track audio continuity; displayed versus linked queue order; Escape cancellation; menu independence; long-list auto-scrolling; filtered/sorted restrictions; mouse/keyboard search treatment; active shuffle bookkeeping; persisted dropped order; and reduced motion. Final machine-readable results are in `docs/alignment/after/checks.json` and `runtime-errors.json`. The broader suite's results are in `docs/ui-refinement/after/checks.json`.

Results: TypeScript passed, **19 unit tests passed**, **95 alignment/interaction/regression checks passed**, and the broader **79-check UI audit passed**. Windows NSIS packaging succeeded, followed by **13 checks against the real packaged executable**. Both renderer error logs are empty. The installer is unsigned; the installer/uninstaller itself was not executed.

Before/after screenshots and geometry: [comparison gallery](docs/alignment/comparison.html), `docs/alignment/{before,after}/geometry.json`. Captures include four window widths, playback, equalizer, sources, settings, fullscreen, floating lyrics, online search, compact mode, moving pocket, current-track drag, autoscroll and search focus. These are actual frames, not mockups; no video recording is claimed.

## Repeat and limitations

```powershell
npm run typecheck
npm test
npm run verify:alignment
npm run verify:ui
npm run build-win
npm run verify:packaged -- --refinement
node scripts/generate-alignment-gallery.cjs
```

Run native UI suites sequentially so focused windows do not compete. The Windows installer remains a separate AURA 3.0 application. Hardware touch input, other Windows DPI/GPU combinations, physical media keys and multi-monitor behavior still need manual validation. No personal-library migration, live provider download, installer/uninstaller cycle, or full GPU benchmark was performed. The available Electron inspection environment worked; no GUI verification limitation prevented this audit.
