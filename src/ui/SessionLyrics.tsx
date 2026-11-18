import { memo, type CSSProperties } from "react";
import { activeLyricIndex } from "../core/lyrics.mjs";
import { useSessionLyrics, type LyricLine } from "./useSessionLyrics";
import type { useWindowsMedia } from "./windows-media";
import { useSessionLyricsPreferences } from "./session-lyrics-preferences";

// Stable timestamp/index keys let existing lines move between slots without
// restarting animations on timeline reports. Keep one extra line on either side
// ready to enter, including when the user changes the visible line count.
const LyricLines = memo(function LyricLines({ lines, index, visible }: { lines: LyricLine[]; index: number; visible: number }) {
  const radius = Math.floor(visible / 2);
  const start = Math.max(0, index - radius - 1);
  return <>{lines.slice(start, index + radius + 2).map((line, offset) => {
    const lineIndex = start + offset;
    const distance = lineIndex - index;
    return <p key={lineIndex} className={`system-lyric ${distance === 0 ? "is-current" : ""}`}
      aria-hidden={Math.abs(distance) > radius} style={{ "--lyric-offset": distance } as CSSProperties}>{line.text}</p>;
  })}</>;
});

export function SessionLyrics({ media }: { media: ReturnType<typeof useWindowsMedia> }) {
  const preferences = useSessionLyricsPreferences();
  const lyrics = useSessionLyrics(media.available ? media.selected : undefined, media.enabled);
  const index = activeLyricIndex(lyrics.lines, Math.max(0, media.position - (media.selected?.start || 0)));
  return <section className="touch-panel system-lyrics" aria-label="Synchronized lyrics" style={{
    "--system-lyrics-font-size": `${preferences.windowsLyricsFontSize}px`,
    "--system-lyrics-lines": preferences.windowsLyricsVisibleLines,
  } as CSSProperties}>
    {lyrics.lines.length ? <LyricLines key={lyrics.key} lines={lyrics.lines} index={index} visible={preferences.windowsLyricsVisibleLines} />
      : <p className="system-lyrics-message" role="status">{lyrics.message}</p>}
  </section>;
}
