import { useSyncExternalStore } from "react";
export type Song = {
  filePath: string;
  title: string;
  artist: string;
  album?: string;
  coverPath?: string;
  duration?: number;
  scannedAt?: number;
  ext?: string;
};
export type QueueNode = { id: string; song: Song };
type QueueSnapshot = {
  sortKeys?: string[];
  dateDir?: number;
  nodes: QueueNode[];
  current: string | null;
  playing: boolean;
  shuffle?: boolean;
  repeat?: number;
  query: string;
};
let snapshot: QueueSnapshot = {
  nodes: [],
  current: null,
  playing: false,
  query: "",
};
const listeners = new Set<() => void>();
declare global {
  interface Window {
    auraQueueRender: (value: QueueSnapshot) => void;
    aura: {
      touchMode: (enabled: boolean) => void;
      setTouchSource: (source: "native" | "windows") => void;
      touchSeek: (seconds: number) => void;
      touchVolume: (volume: number) => void;
      getVolume: () => { volume: number; muted: boolean; available: boolean; master: boolean };
      libraryTrack: (path: string, action: "play" | "next" | "append") => void;
      closePanels: () => void;
      applyLibrary: (payload: any) => void;
      library: (tab?: string) => void;
      play: (id: string) => void;
      next: (id: string) => void;
      remove: (id: string) => void;
      move: (id: string, target?: string) => void;
      search: (query: string) => void;
    };
    electronAPI?: { systemVolumeSupported: boolean; [key: string]: any };
  }
}
window.auraQueueRender = (value) => {
  snapshot = value;
  listeners.forEach((listener) => listener());
};
export const useQueue = () =>
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => snapshot,
  );
export { mediaUrl as fileUrl } from "../core/media-url.mjs";
