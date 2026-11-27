import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

type Preferences = { windowsLyricsFontSize: number; windowsLyricsVisibleLines: number };
const defaults: Preferences = { windowsLyricsFontSize: 32, windowsLyricsVisibleLines: 3 };
const Context = createContext({ ...defaults, ready: false, error: "", update: (_patch: Partial<Preferences>) => {} });

export function SessionLyricsPreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState(defaults);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const saved = useRef(JSON.stringify(defaults));
  useEffect(() => {
    let disposed = false;
    const load = async () => {
      try {
        const value = await window.electronAPI?.getSettings?.();
        if (disposed) return;
        const next = {
          windowsLyricsFontSize: value?.windowsLyricsFontSize ?? defaults.windowsLyricsFontSize,
          windowsLyricsVisibleLines: value?.windowsLyricsVisibleLines ?? defaults.windowsLyricsVisibleLines,
        };
        saved.current = JSON.stringify(next);
        setPreferences(next);
      } catch {
        if (!disposed) setError("Couldn't load lyrics preferences");
      } finally {
        if (!disposed) setReady(true);
      }
    };
    void load();
    return () => { disposed = true; };
  }, []);
  useEffect(() => {
    const snapshot = JSON.stringify(preferences);
    if (!ready || snapshot === saved.current) return;
    let disposed = false;
    const timer = setTimeout(async () => {
      try {
        await window.electronAPI?.saveSettings?.(preferences);
        if (!disposed) { saved.current = snapshot; setError(""); }
      } catch {
        if (!disposed) setError("Couldn't save lyrics preferences");
      }
    }, 250);
    return () => { disposed = true; clearTimeout(timer); };
  }, [preferences, ready]);
  return <Context.Provider value={{ ...preferences, ready, error, update: patch => setPreferences(current => ({ ...current, ...patch })) }}>{children}</Context.Provider>;
}

export const useSessionLyricsPreferences = () => useContext(Context);

export function SessionLyricsSettings() {
  const { windowsLyricsFontSize, windowsLyricsVisibleLines, ready, error, update } = useSessionLyricsPreferences();
  return <section className="settings-section">
    <h3>Windows Media lyrics</h3>
    <div className="settings-range">
      <label htmlFor="windows-lyrics-font-size">Font size <output>{windowsLyricsFontSize} px</output></label>
      <input id="windows-lyrics-font-size" type="range" min={18} max={48} step={2} value={windowsLyricsFontSize} disabled={!ready}
        onChange={event => update({ windowsLyricsFontSize: Number(event.target.value) })} />
    </div>
    <div className="settings-range">
      <label htmlFor="windows-lyrics-visible-lines">Visible lines <output>{windowsLyricsVisibleLines}</output></label>
      <input id="windows-lyrics-visible-lines" type="range" min={1} max={7} step={2} value={windowsLyricsVisibleLines} disabled={!ready}
        onChange={event => update({ windowsLyricsVisibleLines: Number(event.target.value) })} />
    </div>
    {error && <p className="settings-preference-error" role="status">{error}</p>}
  </section>;
}
