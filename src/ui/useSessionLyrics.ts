import { useEffect, useState } from "react";
import { parseLRC } from "../core/lyrics.mjs";
import type { MediaSession } from "./windows-media";

export type LyricLine = { time: number; text: string };
type Lyrics = { key: string; lines: LyricLine[]; message: string };
const emptyLines: LyricLine[] = [];

// Retrieval uses the same IPC, LRCLIB matching and persistent cache as native audio.
// Session identity guards rendering; track metadata identifies the cached request.
export function useSessionLyrics(session: MediaSession | undefined, enabled: boolean) {
  const title = enabled ? session?.title?.trim() || "" : "";
  const artist = session?.artist?.trim() || "";
  const album = session?.album?.trim() || "";
  const duration = Math.round(Math.max(0, (session?.end || 0) - (session?.start || 0)));
  const key = title ? JSON.stringify([session?.id, title, artist, album, duration]) : "";
  const [result, setResult] = useState<Lyrics>({ key: "", lines: emptyLines, message: "Waiting for media" });

  useEffect(() => {
    if (!key) return;
    let disposed = false;
    setResult({ key, lines: emptyLines, message: "Finding lyrics…" });
    const load = async () => {
      try {
        const payload = await window.electronAPI?.getLyrics?.({ title, artist, album, duration, lyricsSource: "windows" });
        if (disposed) return;
        const lines: LyricLine[] = payload?.instrumental ? emptyLines : parseLRC(payload?.syncedLyrics);
        const message = lines.length ? "" : payload?.instrumental ? "Instrumental"
          : !payload || payload.status === "error" ? "Lyrics temporarily unavailable"
          : "Synchronized lyrics unavailable";
        setResult({ key, lines, message });
      } catch {
        if (!disposed) setResult({ key, lines: emptyLines, message: "Lyrics temporarily unavailable" });
      }
    };
    void load();
    // Shared IPC work may still fill the cache; it cannot update a departed track.
    return () => { disposed = true; };
  }, [key, title, artist, album, duration]);

  if (!key) return { key, lines: emptyLines, message: session && enabled ? "Synchronized lyrics unavailable" : "Waiting for media" };
  return result.key === key ? result : { key, lines: emptyLines, message: "Finding lyrics…" };
}
