import { useEffect, useRef, useState, type ReactNode } from "react";
import { SegmentedControl, Switch } from "glisse";
import {
  X,
  FolderPlus,
  FileAudio,
  RefreshCw,
  Folder,
  Music2,
  Trash2,
  Search,
  Globe2,
  SlidersHorizontal,
} from "lucide-react";
import {
  AuraGlassSurface,
  AuraIconButton,
  AuraLiquidButton,
  EmptyState,
} from "./materials";
import { useLibrary } from "./library-store";
import { TrackList } from "./TrackList";
type Option = { value: string; label: string };
function Preference({
  id,
  attribute,
  options,
  label,
  toggle = false,
}: {
  id: string;
  attribute: string;
  options: Option[];
  label: string;
  toggle?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState(options[0].value);
  const [disabled, setDisabled] = useState(false);
  useEffect(() => {
    const element = host.current!;
    const update = () => {
      const selected = element.querySelector<HTMLButtonElement>(
        '[aria-checked="true"]',
      );
      if (selected)
        setValue(selected.getAttribute(attribute) || options[0].value);
      setDisabled(
        element.querySelector<HTMLButtonElement>("button")?.disabled || false,
      );
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(element, {
      subtree: true,
      attributes: true,
      attributeFilter: ["aria-checked", "disabled"],
    });
    return () => observer.disconnect();
  }, []);
  const select = (next: string) =>
    host.current
      ?.querySelector<HTMLButtonElement>(`[${attribute}="${next}"]`)
      ?.click();
  return (
    <>
      <div id={id} ref={host} hidden aria-hidden="true">
        {options.map((option, index) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={index === 0}
            {...{ [attribute]: option.value }}
          >
            {option.label}
          </button>
        ))}
      </div>
      {toggle ? (
        <Switch
          aria-label={label}
          checked={value === "true"}
          disabled={disabled}
          onCheckedChange={(checked) => select(String(checked))}
        />
      ) : (
        <SegmentedControl
          className={`preference-segments ${id === "auto-fullscreen-options" ? "delay-segments" : ""}`}
          aria-label={label}
          items={options}
          value={value}
          onValueChange={select}
        />
      )}
    </>
  );
}
function Sources() {
  const library = useLibrary();
  const [tab, setTab] = useState("folders");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const listener = (event: Event) =>
      setTab((event as CustomEvent<string>).detail);
    window.addEventListener("aura-source-tab", listener);
    return () => window.removeEventListener("aura-source-tab", listener);
  }, []);
  const items = (tab === "folders" ? library.folders : library.files).filter(
    (path) => path.toLowerCase().includes(query.toLowerCase()),
  );
  async function remove(path: string) {
    setBusy(path);
    setError("");
    try {
      const result =
        await window.electronAPI?.[
          tab === "folders" ? "removeLibraryFolder" : "removeLibraryFile"
        ](path);
      if (result) window.aura.applyLibrary(result);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not remove source. Try again.",
      );
    } finally {
      setBusy(null);
    }
  }
  return (
    <div id="library-modal" className="aura-modal" aria-hidden="true">
      <div id="library-backdrop" className="modal-backdrop" />
      <AuraGlassSurface
        material="panel"
        id="library-dialog"
        className="aura-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="library-title"
      >
        <header className="surface-header">
          <div>
            <h2 id="library-title">Music sources</h2>
            <p>Removing a source keeps your music files on disk.</p>
          </div>
          <AuraIconButton id="library-close" label="Close music sources">
            <X />
          </AuraIconButton>
        </header>
        <div id="library-actions" className="dialog-toolbar">
          <AuraLiquidButton id="library-add-folder" icon={<FolderPlus />}>
            Add folder
          </AuraLiquidButton>
          <AuraLiquidButton id="library-add-files" icon={<FileAudio />}>
            Add files
          </AuraLiquidButton>
          <AuraIconButton id="library-rescan" label="Rescan library">
            <RefreshCw />
          </AuraIconButton>
        </div>
        <div
          id="library-tabs"
          className="source-tabs"
          role="tablist"
          aria-label="Source type"
        >
          {[
            { id: "folders", label: "Folders", count: library.folders.length },
            { id: "files", label: "Files", count: library.files.length },
            { id: "songs", label: "Tracks", count: library.songs.length },
          ].map((item) => (
            <button
              key={item.id}
              className={`library-tab ${tab === item.id ? "active" : ""}`}
              role="tab"
              aria-selected={tab === item.id}
              data-tab={item.id}
              onClick={() => setTab(item.id)}
            >
              {item.label}
              <span
                id={`library-${item.id === "folders" ? "folder" : item.id === "files" ? "file" : "song"}-count`}
              >
                {item.count}
              </span>
            </button>
          ))}
        </div>
        <label className="plain-search" htmlFor="library-search">
          <Search />
          <input
            id="library-search"
            placeholder="Search sources"
            aria-label="Search music sources"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div id="library-content" className="source-content">
          {tab === "songs" ? (
            <TrackList
              listId="source-track-list"
              entries={library.songs.map((song) => ({
                id: song.filePath,
                song,
              }))}
              mode="library"
              query={query}
            />
          ) : !items.length ? (
            <EmptyState
              icon={tab === "folders" ? <Folder /> : <Music2 />}
              title={
                query
                  ? "No matching sources"
                  : `No ${tab === "folders" ? "folders" : "files"} added`
              }
            />
          ) : (
            items.map((path) => (
              <div className="source-row" key={path}>
                <span className="source-icon">
                  {tab === "folders" ? <Folder /> : <FileAudio />}
                </span>
                <div>
                  <strong title={path}>
                    {path.split(/[\\/]/).pop() || path}
                  </strong>
                  <span title={path}>{path}</span>
                </div>
                <AuraIconButton
                  className="destructive"
                  disabled={busy === path}
                  label={`Remove ${path.split(/[\\/]/).pop()} from sources`}
                  onClick={() => remove(path)}
                >
                  <X />
                </AuraIconButton>
              </div>
            ))
          )}
        </div>
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        <footer className="dialog-footer">
          <button id="library-clear" className="destructive">
            <Trash2 />
            Clear saved sources
          </button>
        </footer>
      </AuraGlassSurface>
    </div>
  );
}
export function Secondary({ children }: { children?: ReactNode }) {
  return (
    <>
      <AuraGlassSurface
        material="panel"
        id="settings-popover"
        className="aura-popover"
        role="dialog"
        aria-label="Settings"
        aria-hidden="true"
      >
        <header className="surface-header">
          <h2>Settings</h2>
          <AuraIconButton
            label="Close settings"
            onClick={() => window.aura?.closePanels()}
          >
            <X />
          </AuraIconButton>
        </header>
        <section className="settings-section">
          <h3>Appearance</h3>
          <div className="settings-row">
            <span>Theme</span>
            <Preference
              id="theme-options"
              attribute="data-theme"
              label="Theme"
              options={[
                { value: "midnight", label: "Dark" },
                { value: "oled", label: "OLED" },
              ]}
            />
          </div>
          {children}
        </section>
        <section className="settings-section">
          <h3>Playback</h3>
          <div className="settings-stack">
            <label>Automatic fullscreen</label>
            <Preference
              id="auto-fullscreen-options"
              attribute="data-auto-fullscreen-delay"
              label="Automatic fullscreen delay"
              options={[
                { value: "0", label: "Off" },
                { value: "120000", label: "2m" },
                { value: "300000", label: "5m" },
                { value: "600000", label: "10m" },
                { value: "900000", label: "15m" },
                { value: "1800000", label: "30m" },
              ]}
            />
          </div>
        </section>
        <section className="settings-section">
          <h3>Floating lyrics</h3>
          <div className="settings-row">
            <span>Show floating lyrics</span>
            <Preference
              id="floating-lyrics-options"
              attribute="data-floating-lyrics-enabled"
              label="Enable floating lyrics"
              toggle
              options={[
                { value: "false", label: "Off" },
                { value: "true", label: "On" },
              ]}
            />
          </div>
          <div className="settings-row">
            <span>Click through</span>
            <Preference
              id="floating-lyrics-click-through-options"
              attribute="data-floating-lyrics-click-through"
              label="Floating lyrics click through"
              toggle
              options={[
                { value: "false", label: "Off" },
                { value: "true", label: "On" },
              ]}
            />
          </div>
          <div className="settings-range">
            <label htmlFor="floating-lyrics-scale">
              Scale <output id="floating-lyrics-scale-value">100%</output>
            </label>
            <input
              id="floating-lyrics-scale"
              type="range"
              min="10"
              max="140"
              step="5"
              defaultValue="100"
            />
          </div>
          <div className="settings-range">
            <label htmlFor="floating-lyrics-visible-lines">
              Visible lines{" "}
              <output id="floating-lyrics-visible-lines-value">6</output>
            </label>
            <input
              id="floating-lyrics-visible-lines"
              type="range"
              min="3"
              max="6"
              step="1"
              defaultValue="6"
            />
          </div>
        </section>
        <footer className="settings-about">
          <span>About AURA</span>
          <span id="settings-version" />
        </footer>
      </AuraGlassSurface>
      <Sources />
      <div id="youtube-modal" className="aura-modal" hidden>
        <div id="youtube-backdrop" className="modal-backdrop" />
        <AuraGlassSurface
          material="panel"
          id="youtube-dialog"
          className="aura-dialog online-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="youtube-title"
          tabIndex={-1}
        >
          <header className="surface-header">
            <h2 id="youtube-title">Discover online</h2>
            <AuraIconButton id="youtube-close" label="Close online search">
              <X />
            </AuraIconButton>
          </header>
          <label
            id="youtube-source-label"
            className="online-source"
            htmlFor="youtube-source"
          >
            Search in
            <select id="youtube-source" defaultValue="music">
              <option value="music">YouTube Music</option>
              <option value="youtube">YouTube</option>
            </select>
          </label>
          <form id="youtube-form">
            <label className="plain-search">
              <Search />
              <input
                id="youtube-query"
                type="search"
                maxLength={200}
                placeholder="Song or artist"
                aria-label="Search song or artist"
                required
                autoComplete="off"
              />
            </label>
            <AuraLiquidButton id="youtube-search" type="submit">
              Search
            </AuraLiquidButton>
          </form>
          <div id="youtube-operation">
            <p id="youtube-status" role="status" aria-live="polite">
              Search for a song or artist.
            </p>
            <button id="youtube-cancel" hidden>
              Cancel
            </button>
          </div>
          <div id="youtube-results" aria-label="Online results" />
          <footer className="dialog-footer">
            <span>Downloads in your Music folder</span>
            <button id="youtube-check-tools" type="button">
              <SlidersHorizontal />
              Check tools
            </button>
          </footer>
        </AuraGlassSurface>
      </div>
    </>
  );
}
