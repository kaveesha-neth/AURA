import { type CSSProperties } from "react";
import { activeLyricIndex } from "../core/lyrics.mjs";
import { useSessionLyrics } from "./useSessionLyrics";
import { LyricLines } from "./LyricLines";
import type { useWindowsMedia } from "./windows-media";
import { useSessionLyricsPreferences } from "./session-lyrics-preferences";

export function SessionLyrics({ media }: { media: ReturnType<typeof useWindowsMedia> }) {
  const preferences = useSessionLyricsPreferences();
  const lyrics = useSessionLyrics(media.available ? media.selected : undefined, media.enabled);
  const index = activeLyricIndex(lyrics.lines, Math.max(0, media.position - (media.selected?.start || 0)));
  return <section className="touch-panel system-lyrics" aria-label="Synchronized lyrics" style={{
    "--system-lyrics-font-size": `${preferences.windowsLyricsFontSize}px`,
    "--system-lyrics-lines": preferences.windowsLyricsVisibleLines,
  } as CSSProperties}>
    {lyrics.lines.length ? <LyricLines key={lyrics.key} lines={lyrics.lines} index={index} visible={preferences.windowsLyricsVisibleLines} fontSize={preferences.windowsLyricsFontSize} />
      : <p className="system-lyrics-message" role="status">{lyrics.message}</p>}
  </section>;
}
