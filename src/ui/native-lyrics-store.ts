import { useSyncExternalStore } from "react";

export type LyricLine = { time: number; text: string };
export type NativeLyricsSnapshot = {
  track: string;
  lines: LyricLine[];
  activeIndex: number;
  type: string;
  message: string;
};

let snapshot: NativeLyricsSnapshot = {
  track: "", lines: [], activeIndex: -1, type: "none", message: "No track selected",
};
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

declare global {
  interface Window {
    auraLyricsRender: (value: NativeLyricsSnapshot) => void;
  }
}

// The controller publishes only lyric changes, never the playback clock.
window.auraLyricsRender = value => {
  if (snapshot.track === value.track && snapshot.lines === value.lines &&
      snapshot.activeIndex === value.activeIndex && snapshot.type === value.type &&
      snapshot.message === value.message) return;
  snapshot = value;
  listeners.forEach(listener => listener());
};

export const useNativeLyrics = () => useSyncExternalStore(subscribe, () => snapshot);
