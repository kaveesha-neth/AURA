import { useSyncExternalStore } from "react";
import type { Song } from "./queue-store";
export type LibrarySnapshot = {
  songs: Song[];
  folders: string[];
  files: string[];
};
let library: LibrarySnapshot = { songs: [], folders: [], files: [] };
const listeners = new Set<() => void>();
declare global {
  interface Window {
    auraLibraryRender: (value: LibrarySnapshot) => void;
  }
}
window.auraLibraryRender = (value) => {
  if (
    library.songs === value.songs &&
    library.folders === value.folders &&
    library.files === value.files
  )
    return;
  library = { ...value };
  listeners.forEach((listener) => listener());
};
export function useLibrary() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => library,
  );
}
