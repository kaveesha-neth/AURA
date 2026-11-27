import { memo, type CSSProperties } from "react";
import { useNativeLyrics } from "./native-lyrics-store";
import { useSessionLyricsPreferences } from "./session-lyrics-preferences";
import { LyricLines } from "./LyricLines";

export const NativeLyrics = memo(function NativeLyrics() {
  const lyrics = useNativeLyrics();
  const preferences = useSessionLyricsPreferences();
  return <div className="system-lyrics touch-native-lyrics" aria-label={lyrics.type === "plain" ? "Plain lyrics" : "Synchronized lyrics"}
    style={{
      "--system-lyrics-font-size": `${preferences.windowsLyricsFontSize}px`,
      "--system-lyrics-lines": preferences.windowsLyricsVisibleLines,
    } as CSSProperties}>
    {lyrics.type === "plain" && lyrics.lines.length ?
      <div className="touch-plain-lyrics" key={lyrics.track}>
        <small>Plain lyrics</small>
        {lyrics.lines.map((line, index) => <p key={index}>{line.text}</p>)}
      </div> : lyrics.lines.length ?
      <LyricLines key={lyrics.track} lines={lyrics.lines} index={lyrics.activeIndex} visible={preferences.windowsLyricsVisibleLines} fit fontSize={preferences.windowsLyricsFontSize} /> :
      <p className="system-lyrics-message" role="status">{lyrics.message}</p>}
  </div>;
});
