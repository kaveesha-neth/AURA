import { memo } from "react";
import {
  Music2,
  Shuffle,
  SkipBack,
  SkipForward,
  Rewind,
  FastForward,
  Play,
  Pause,
  Repeat,
  Repeat1,
  Volume2,
  VolumeX,
  SlidersHorizontal,
  PanelsTopLeft,
  Expand,
  Minimize2,
  RotateCcw,
  X,
} from "lucide-react";
import {
  AuraGlassSurface,
  AuraIconButton,
  AuraLiquidButton,
} from "./materials";
import { useImmersiveControls } from "./useImmersiveControls";

export const Transport = memo(function Transport({
  full = false,
}: {
  full?: boolean;
}) {
  return (
    <AuraGlassSurface
      id={full ? "fullscreen-controls" : "controls"}
      className={`playback-dock ${full ? "fullscreen-dock" : "transport-dock"}`}
    >
      {!full && (
        <>
          <svg
            className="sculpted-definitions"
            aria-hidden="true"
            width="0"
            height="0"
          >
            <defs>
              <clipPath id="sculpted-contour" clipPathUnits="objectBoundingBox">
                <path d="M .12 .21 H .35 C .41 .21 .425 .025 .5 .025 S .59 .21 .65 .21 H .88 C .95 .21 1 .32 1 .5 S .95 .79 .88 .79 H .65 C .59 .79 .575 .975 .5 .975 S .41 .79 .35 .79 H .12 C .05 .79 0 .68 0 .5 S .05 .21 .12 .21 Z" />
              </clipPath>
              <linearGradient id="sculpted-edge" x1="0" y1="0" x2="0.25" y2="1">
                <stop stopColor="#f2eaff" stopOpacity=".65" />
                <stop offset=".4" stopColor="#d9d0ed" stopOpacity=".13" />
                <stop offset="1" stopColor="#c7bfd8" stopOpacity=".4" />
              </linearGradient>
            </defs>
          </svg>
          <AuraGlassSurface
            className="sculpted-material sculpted-bridge"
            style={{ clipPath: "url(#sculpted-contour)" }}
            aria-hidden="true"
          />
          <svg
            className="sculpted-material sculpted-contour-edge"
            viewBox="0 0 1000 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path
              d="M120 21 H350 C410 21 425 2.5 500 2.5 S590 21 650 21 H880 C950 21 1000 32 1000 50 S950 79 880 79 H650 C590 79 575 97.5 500 97.5 S410 79 350 79 H120 C50 79 0 68 0 50 S50 21 120 21 Z"
              fill="none"
              stroke="url(#sculpted-edge)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          <AuraGlassSurface
            className="sculpted-material sculpted-side sculpted-shuffle"
            aria-hidden="true"
          />
          <AuraGlassSurface
            className="sculpted-material sculpted-side sculpted-repeat"
            aria-hidden="true"
          />
        </>
      )}
      <AuraIconButton
        id={full ? undefined : "btn-shuffle"}
        label="Shuffle (S)"
        data-fullscreen-action={full ? "shuffle" : undefined}
      >
        <Shuffle />
        <span className="btn-dot" />
      </AuraIconButton>
      <AuraIconButton
        id={full ? undefined : "btn-prev"}
        label="Previous (Alt + Left)"
        data-fullscreen-action={full ? "prev" : undefined}
      >
        <SkipBack className="classic-skip" />
        {!full && <Rewind className="sculpted-skip" fill="currentColor" />}
      </AuraIconButton>
      <AuraLiquidButton
        id={full ? undefined : "btn-play"}
        className="icon-button play-button"
        aria-label="Play / pause (Space)"
        title="Play / pause (Space)"
        data-fullscreen-action={full ? "play" : undefined}
      >
        {full ? (
          <>
            <span id="fullscreen-icon-play">
              <Play fill="currentColor" />
            </span>
            <span id="fullscreen-icon-pause" hidden>
              <Pause fill="currentColor" />
            </span>
          </>
        ) : (
          <>
            <Play id="icon-play" fill="currentColor" />
            <Pause
              id="icon-pause"
              style={{ display: "none" }}
              fill="currentColor"
            />
            <span id="play-ripple" />
          </>
        )}
      </AuraLiquidButton>
      <AuraIconButton
        id={full ? undefined : "btn-next"}
        label="Next (Alt + Right)"
        data-fullscreen-action={full ? "next" : undefined}
      >
        <SkipForward className="classic-skip" />
        {!full && <FastForward className="sculpted-skip" fill="currentColor" />}
      </AuraIconButton>
      <AuraIconButton
        id={full ? undefined : "btn-repeat"}
        label="Repeat (R)"
        data-fullscreen-action={full ? "repeat" : undefined}
      >
        {full ? (
          <>
            <Repeat className="full-repeat-all" />
            <Repeat1 className="full-repeat-one" />
          </>
        ) : (
          <>
            <Repeat id="icon-repeat-all" />
            <Repeat1 id="icon-repeat-one" style={{ display: "none" }} />
          </>
        )}
        <span className="btn-dot" />
      </AuraIconButton>
    </AuraGlassSurface>
  );
});
export function Timeline({ full = false }: { full?: boolean }) {
  return (
    <div
      id={full ? "fullscreen-timeline" : "seekbar-area"}
      className="timeline"
    >
      <div
        className="seek-track"
        id={full ? "fullscreen-seek-track" : "seek-track"}
        role="slider"
        tabIndex={0}
        aria-label="Playback position"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={0}
      >
        <div
          className="seek-fill"
          id={full ? "fullscreen-seek-fill" : "seek-fill"}
        />
        <div
          className="seek-thumb"
          id={full ? "fullscreen-seek-thumb" : "seek-thumb"}
        />
      </div>
      <div
        className="time-labels"
        id={full ? "fullscreen-times" : "seek-times"}
      >
        <span id={full ? "fullscreen-time-current" : "time-current"}>0:00</span>
        <span id={full ? "fullscreen-time-total" : "time-total"}>0:00</span>
      </div>
    </div>
  );
}
export const NowPlaying = memo(function NowPlaying() {
  return (
    <section id="player-panel" aria-label="Now playing">
      <div id="cover-wrap">
        <div id="cover-glow" />
        <div id="cover-container">
          <img
            id="cover-img"
            alt="Current album artwork"
            style={{ display: "none" }}
          />
          <div id="cover-placeholder">
            <Music2 strokeWidth={1.25} />
          </div>
        </div>
      </div>
      <div id="song-info">
        <div id="song-title-wrap">
          <h1 id="song-title">No track selected</h1>
        </div>
        <p id="song-artist">Choose music from your library.</p>
        <p id="song-album" />
      </div>
      <Timeline />
      <Transport />
      <div className="player-utilities">
        <div id="vol-area">
          <AuraIconButton id="vol-icon" label="Mute / unmute">
            <Volume2 className="volume-audible" />
            <VolumeX className="volume-muted" />
          </AuraIconButton>
          <div
            id="vol-track"
            role="slider"
            tabIndex={0}
            aria-label="Volume"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={80}
          >
            <div id="vol-fill" />
            <div id="vol-thumb" />
          </div>
          <span id="vol-label">80</span>
        </div>
        <div className="utility-actions">
          <AuraIconButton
            id="btn-eq"
            label="Equalizer"
            aria-expanded={false}
            aria-controls="audio-popover"
          >
            <SlidersHorizontal />
          </AuraIconButton>
          <AuraIconButton id="btn-floating-lyrics" label="Floating lyrics">
            <PanelsTopLeft />
          </AuraIconButton>
          <AuraIconButton id="btn-fullscreen" label="Fullscreen player">
            <Expand />
          </AuraIconButton>
        </div>
      </div>
      <div id="lyrics-overlay" className="lyrics-hidden" aria-live="polite">
        <div id="lyrics-lines">
          <div id="lyrics-prev" className="lyrics-line lyrics-side" />
          <div id="lyrics-current" className="lyrics-line lyrics-main" />
          <div id="lyrics-next" className="lyrics-line lyrics-side" />
        </div>
        <div id="lyrics-status" />
      </div>
    </section>
  );
});
export const AudioPanel = memo(function AudioPanel() {
  return (
    <AuraGlassSurface
      material="panel"
      id="audio-popover"
      className="aura-popover"
      role="dialog"
      aria-label="Equalizer"
      aria-hidden="true"
    >
      <div id="eq-panel">
        <div id="eq-header" className="surface-header">
          <h2>Equalizer</h2>
          <div className="surface-header-actions">
            <label className="eq-switch" title="Enable equalizer">
              <input
                id="eq-toggle"
                type="checkbox"
                defaultChecked
                aria-label="Enable equalizer"
              />
              <span />
            </label>
            <AuraIconButton
              label="Close equalizer"
              onClick={() => window.aura?.closePanels()}
            >
              <X />
            </AuraIconButton>
          </div>
        </div>
        <div id="eq-bands">
          {["Sub", "Bass", "Mid", "Presence", "Treble"].map((label, index) => (
            <div className="eq-band" key={label} data-band={index}>
              <output className="eq-value">0 dB</output>
              <div
                className="eq-slider-wrap"
                role="slider"
                tabIndex={0}
                aria-label={label + " gain"}
                aria-valuemin={-12}
                aria-valuemax={12}
                aria-valuenow={0}
              >
                <div className="eq-track">
                  <div className="eq-track-fill" />
                </div>
                <div className="eq-handle">
                  <div className="eq-grip" />
                </div>
              </div>
              <span className="eq-label">{label}</span>
              <small>{["60", "250", "1k", "4k", "12k"][index]} Hz</small>
            </div>
          ))}
        </div>
        <div className="eq-footer">
          <span>Double-click to reset a band</span>
          <button id="eq-reset">
            <RotateCcw />
            Reset
          </button>
        </div>
      </div>
    </AuraGlassSurface>
  );
});
export const Immersive = memo(function Immersive() {
  const idle = useImmersiveControls();
  return (
    <section id="fullscreen-player" aria-hidden="true" data-idle={idle}>
      <div id="fullscreen-background" />
      <div id="fullscreen-background-transition" />
      <div id="fullscreen-scrim" />
      <AuraIconButton
        id="btn-exit-fullscreen"
        className="fullscreen-exit"
        label="Exit fullscreen (Esc)"
      >
        <Minimize2 />
      </AuraIconButton>
      <div id="fullscreen-content">
        <aside id="fullscreen-now-playing">
          <div id="fullscreen-cover-stage">
            <img id="fullscreen-cover" alt="Current album artwork" />
            <img id="fullscreen-cover-transition" alt="" aria-hidden="true" />
          </div>
          <div id="fullscreen-track-meta">
            <h1 id="fullscreen-title">No track selected</h1>
            <p id="fullscreen-artist" />
          </div>
          <Timeline full />
          <Transport full />
        </aside>
        <section
          id="fullscreen-lyrics"
          aria-label="Synchronized lyrics"
          aria-live="polite"
        >
          {[-2, -1, 0, 1, 2, 3].map((offset) => (
            <p
              key={offset}
              className={`fullscreen-lyric ${offset === 0 ? "current" : ""}`}
              data-lyric-offset={offset}
            />
          ))}
        </section>
      </div>
    </section>
  );
});
