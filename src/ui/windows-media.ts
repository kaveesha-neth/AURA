import { useEffect, useState } from "react";
import { mediaPosition } from "../core/media-timeline.mjs";

export type MediaAction = "play" | "pause" | "next" | "previous" | "seek" | "shuffle" | "repeat";
export type MediaSession = {
  id: string; source: string; appName: string; title: string; artist: string; album: string; thumbnail: string;
  playing: boolean; position: number; start: number; end: number; updatedAt: number; rate?: number; shuffle: boolean; repeat: number;
  controls: Record<MediaAction, boolean>;
};
export type WindowsMediaState = { available: boolean; sessions: MediaSession[]; current: string; error?: string; diagnostic?: string; bridge?: string };
export type Output = { id: string; name: string; isDefault: boolean };

export function useWindowsMedia(enabled: boolean) {
  const [snapshot, setSnapshot] = useState<WindowsMediaState>({ available: false, sessions: [], current: "" });
  const [selectedId, select] = useState("");
  const [outputs, setOutputs] = useState<Output[]>([]);
  const [pending, setPending] = useState(false);
  const [outputPending, setOutputPending] = useState("");
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    let receivedEvent = false;
    const update = (value: WindowsMediaState) => { if (!disposed) setSnapshot(value); };
    const updateOutputs = (value: { outputs?: Output[]; available?: boolean }) => { if (!disposed) setOutputs(value.available === false ? [] : [...(value.outputs || [])].sort((a, b) => Number(b.isDefault) - Number(a.isDefault))); };
    const changed = (event: Event) => { receivedEvent = true; update((event as CustomEvent).detail); };
    const volume = (event: Event) => updateOutputs((event as CustomEvent).detail);
    window.addEventListener("windows-media-changed", changed);
    window.addEventListener("master-volume-changed", volume);
    window.electronAPI?.getWindowsMedia?.().then((value: WindowsMediaState) => { if (!receivedEvent) update(value); }).catch(() => { if (!receivedEvent) update({ available: false, sessions: [], current: "", error: "unavailable" }); });
    window.electronAPI?.getMasterVolume?.().then(updateOutputs).catch(() => {});
    return () => { disposed = true; window.removeEventListener("windows-media-changed", changed); window.removeEventListener("master-volume-changed", volume); };
  }, [enabled]);
  const selected = snapshot.sessions.find(s => s.id === selectedId) || snapshot.sessions.find(s => s.id === snapshot.current) || snapshot.sessions.find(s => s.playing) || snapshot.sessions[0];
  useEffect(() => {
    if (!enabled || !selected?.playing) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [enabled, selected?.playing]);
  const command = async (action: MediaAction, value?: number) => {
    if (!selected || pending || !selected.controls[action]) return;
    setPending(true); setError("");
    try {
      if (!await window.electronAPI?.windowsMediaCommand?.({ sessionId: selected.id, action, value })) setError("This app couldn’t complete that control. Its session may have changed.");
    } catch { setError("Couldn’t reach this media session. Try again."); }
    finally { setPending(false); }
  };
  const selectOutput = async (id: string) => {
    if (outputPending) return;
    setOutputPending(id); setError("");
    try { if (!await window.electronAPI?.selectAudioOutput?.(id)) setError("Windows couldn’t change the output. Try Windows sound settings."); }
    catch { setError("Couldn’t change the audio output."); }
    finally { setOutputPending(""); }
  };
  const position = mediaPosition(selected, Math.max(now, Date.now()));
  return { ...snapshot, enabled, selected, select: (id: string) => { select(id); setError(""); }, outputs, pending, command, outputPending, selectOutput, message: error, position };
}
