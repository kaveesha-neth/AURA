import { useEffect, useRef, useState, type CSSProperties } from "react";
import { AudioLines, Settings2, Minimize2, ListMusic, Music2, Shuffle, Rewind, FastForward, Play, Pause, Repeat, Repeat1, Volume2, VolumeX, ListPlus, X, Search, MonitorPlay } from "lucide-react";
import { AuraIconButton } from "./materials";
import { fileUrl, useQueue } from "./queue-store";
import "./touch-player.css";
import { useWindowsMedia, type MediaAction } from "./windows-media";
import { WindowsMediaPanel } from "./WindowsMediaPanel";
import { NativeLyrics } from "./NativeLyrics";

const time = (value: number) => `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, "0")}`;
const click = (id: string) => document.getElementById(id)?.click();

export function TouchPlayer() {
  const queue = useQueue();
  const [active, setActive] = useState(false);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"queue" | "lyrics">("queue");
  const queueScroll = useRef(0);
  const trackList = useRef<HTMLDivElement>(null);
  const lastQueueTrack = useRef<string | null>(null);
  const [source, setSource] = useState<"native" | "windows">("native");
  const [seekDraft, setSeekDraft] = useState<number | null>(null);
  const remote = useWindowsMedia(active && source === "windows");
  const windows = source === "windows";
  const [media, setMedia] = useState({ current: 0, duration: 0, volume: 0, muted: false, available: false, master: false });
  const currentRow = useRef<HTMLDivElement>(null);
  const current = queue.nodes.find(node => node.id === queue.current);
  const changeSource = (value: "native" | "windows") => {
    window.aura?.setTouchSource(value);
    setSource(value);
  };
  const selected = remote.selected;
  const title = windows ? selected?.title || "Your Windows media, together" : current?.song.title || "Your music, within reach";
  const artist = windows ? selected?.artist || selected?.appName || "Select an active media session to get started" : current?.song.artist || "Add your music to get started";
  const artwork = windows ? selected?.thumbnail : current?.song.coverPath ? fileUrl(current.song.coverPath) : "";
  const start = windows ? selected?.start || 0 : 0;
  const duration = windows ? Math.max(0, (selected?.end || 0) - start) : media.duration;
  const position = windows ? remote.position : media.current;
  const playing = windows ? !!selected?.playing : queue.playing;
  const repeat = windows ? selected?.repeat || 0 : queue.repeat || 0;
  const can = (action: MediaAction) => windows ? remote.available && !remote.pending && !!selected?.controls[action] : !!queue.nodes.length;
  const transport = (action: MediaAction, nativeId: string) => windows ? void remote.command(action) : click(nativeId);
  useEffect(() => setSeekDraft(null), [source, selected?.id]);
  const commitSeek = async (value: number) => { if (windows) { await remote.command("seek", value); setSeekDraft(null); } };
  useEffect(() => {
    if (!active || !windows) return;
    const shortcut = (event: Event) => {
      const { action, delta } = (event as CustomEvent).detail;
      if (action === "toggle") void remote.command(playing ? "pause" : "play");
      else if (action === "seek-relative") void remote.command("seek", Math.max(start, Math.min(start + duration, position + delta)));
      else void remote.command(action);
    };
    window.addEventListener("touch-remote-action", shortcut);
    return () => window.removeEventListener("touch-remote-action", shortcut);
  }, [active, windows, remote.command, playing, position, duration, start]);
  useEffect(() => {
    const change = (event: Event) => setActive(Boolean((event as CustomEvent).detail));
    window.addEventListener("touch-mode-changed", change);
    return () => window.removeEventListener("touch-mode-changed", change);
  }, []);
  useEffect(() => {
    if (!active) return;
    const audio = document.getElementById("audio") as HTMLAudioElement;
    const sync = () => setMedia({ current: audio.currentTime || 0, duration: Number.isFinite(audio.duration) ? audio.duration : 0, ...(window.aura?.getVolume() || { volume: 0, muted: false, available: false, master: false }) });
    const events = ["timeupdate", "durationchange", "volumechange", "loadedmetadata", "emptied", "seeked"];
    sync();
    events.forEach(event => audio.addEventListener(event, sync));
    window.addEventListener("aura-volume-changed", sync);
    return () => { events.forEach(event => audio.removeEventListener(event, sync)); window.removeEventListener("aura-volume-changed", sync); };
  }, [active]);
  useEffect(() => {
    if (active && source === "native" && !query && view === "queue" && lastQueueTrack.current !== queue.current) {
      currentRow.current?.scrollIntoView({ block: "nearest" });
      lastQueueTrack.current = queue.current;
    }
  }, [active, queue.current, query, source]);
  useEffect(() => {
    if (view === "queue" && trackList.current) trackList.current.scrollTop = queueScroll.current;
  }, [view, source]);
  const changeView = (next: "queue" | "lyrics") => {
    if (view === "queue") queueScroll.current = trackList.current?.scrollTop || 0;
    setView(next);
  };
  const exit = () => window.aura?.touchMode(false);
  const addMusic = () => { exit(); click("btn-add-files"); };
  const nodes = queue.nodes.filter(({ song }) => `${song.title} ${song.artist}`.toLowerCase().includes(query.toLowerCase()));
  return (
    <section id="touch-player" hidden={!active} aria-label="Touch screen player">
      <header className="touch-header">
        <div className="touch-brand"><AudioLines /><span>AURA</span><small>TOUCH</small></div>
        <div className="touch-source-switch" role="group" aria-label="Playback source">
          <button aria-pressed={!windows} onClick={() => changeSource("native")}><AudioLines />AURA player</button>
          <button aria-pressed={windows} disabled={!window.electronAPI?.systemVolumeSupported} onClick={() => changeSource("windows")}><MonitorPlay />Windows media</button>
        </div>
        <div className="touch-header-actions">
          <AuraIconButton label="Settings" onClick={() => { exit(); click("btn-settings"); }}><Settings2 /></AuraIconButton>
          <AuraIconButton id="touch-exit" label="Exit touch screen mode (Esc)" onClick={exit}><Minimize2 /></AuraIconButton>
        </div>
      </header>
      <div className={`touch-layout ${windows ? "is-windows-source" : ""}`}>
        <section className="touch-now touch-panel" aria-label="Now playing">
          <div className="touch-art">{windows ? <MonitorPlay aria-hidden="true" /> : <Music2 aria-hidden="true" />}{artwork && <img key={artwork} src={artwork} alt={`${title} artwork`} onError={e => { e.currentTarget.style.visibility = "hidden"; }} />}</div>
          <div className="touch-meta"><small>{windows ? `WINDOWS MEDIA${selected ? ` / ${selected.appName}` : ""}` : "NOW PLAYING"}</small><h1 title={title}>{title}</h1><p title={artist}>{artist}</p></div>
          <div className="touch-timeline">
            <input id="touch-seek" type="range" aria-label="Playback position" min={start} max={start + duration || 1} step={.1} value={Math.max(start, Math.min(seekDraft ?? position, start + duration))} disabled={!duration || (windows && !can("seek"))} onChange={e => windows ? setSeekDraft(Number(e.target.value)) : window.aura.touchSeek(Number(e.target.value))} onPointerUp={e => { if (windows) void commitSeek(Number(e.currentTarget.value)); }} onKeyUp={e => { if (windows && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) void commitSeek(Number(e.currentTarget.value)); }} onPointerCancel={() => setSeekDraft(null)} style={{ "--progress": `${duration ? Math.max(0, (seekDraft ?? position) - start) / duration * 100 : 0}%` } as CSSProperties} />
            <div><span>{time(Math.max(0, position - start))}</span><span>{windows && !duration ? "Live / no timeline" : time(duration)}</span></div>
          </div>
          <div className="touch-transport">
            <AuraIconButton label="Shuffle" aria-pressed={windows ? !!selected?.shuffle : !!queue.shuffle} disabled={!can("shuffle")} onClick={() => transport("shuffle", "btn-shuffle")}><Shuffle /></AuraIconButton>
            <AuraIconButton label="Previous track" disabled={!can("previous")} onClick={() => transport("previous", "btn-prev")}><Rewind fill="currentColor" /></AuraIconButton>
            <AuraIconButton id="touch-play" className="touch-play" label={playing ? "Pause" : "Play"} disabled={!can(playing ? "pause" : "play")} onClick={() => transport(playing ? "pause" : "play", "btn-play")}>{playing ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}</AuraIconButton>
            <AuraIconButton label="Next track" disabled={!can("next")} onClick={() => transport("next", "btn-next")}><FastForward fill="currentColor" /></AuraIconButton>
            <AuraIconButton label={(windows ? ["Repeat off", "Repeat one", "Repeat all"] : ["Repeat off", "Repeat all", "Repeat one"])[repeat]} aria-pressed={!!repeat} disabled={!can("repeat")} onClick={() => transport("repeat", "btn-repeat")}>{repeat === (windows ? 1 : 2) ? <Repeat1 /> : <Repeat />}</AuraIconButton>
          </div>
        </section>
        {windows ? <WindowsMediaPanel media={remote} /> : <section className="touch-queue touch-panel" aria-label="Queue and lyrics">
          {view === "queue" && <header><small>{queue.nodes.length} tracks</small></header>}
          <div id="touch-queue-content" className="touch-queue-content" hidden={view !== "queue"}>
          <label className="touch-search"><Search /><input type="search" placeholder="Find in queue" aria-label="Find in touch queue" value={query} onChange={e => setQuery(e.target.value)} /></label>
          <div className="touch-track-list" ref={trackList} onScroll={e => { if (view === "queue") queueScroll.current = e.currentTarget.scrollTop; }}>
            {nodes.map(node => <div key={node.id} ref={node.id === queue.current ? currentRow : undefined} className={`touch-row ${node.id === queue.current ? "is-current" : ""}`}>
              <button className="touch-track" aria-current={node.id === queue.current ? "true" : undefined} onClick={() => window.aura.play(node.id)}>
                <span className="touch-thumb"><Music2 />{node.song.coverPath && <img src={fileUrl(node.song.coverPath)} alt="" loading="lazy" onError={e => { e.currentTarget.style.visibility = "hidden"; }} />}</span>
                <span className="touch-track-meta"><strong>{node.song.title}</strong><small>{node.song.artist || "Unknown artist"}</small></span>
                {node.id === queue.current && <AudioLines className="touch-current-icon" />}
              </button>
              <AuraIconButton label={`Play ${node.song.title} next`} onClick={() => window.aura.next(node.id)}><ListPlus /></AuraIconButton>
              <AuraIconButton label={`Remove ${node.song.title} from queue`} onClick={() => window.aura.remove(node.id)}><X /></AuraIconButton>
            </div>)}
            {!nodes.length && <div className="touch-empty"><Music2 /><h3>{query ? "No matching tracks" : "Make room for music"}</h3><p>{query ? "Try another title or artist." : "Add audio files to start listening."}</p><button onClick={query ? () => setQuery("") : addMusic}>{query ? "Clear search" : "Add music"}</button></div>}
          </div>
          </div>
          <div id="touch-lyrics-content" className="touch-lyrics-content" hidden={view !== "lyrics"}>
            {active && view === "lyrics" && <NativeLyrics />}
          </div>
          <footer className="touch-view-footer">
            <div className="touch-source-switch touch-view-switch" role="group" aria-label="Queue or lyrics">
              <button id="touch-view-queue" aria-pressed={view === "queue"} aria-controls="touch-queue-content" onClick={() => changeView("queue")}><ListMusic />Queue</button>
              <button id="touch-view-lyrics" aria-pressed={view === "lyrics"} aria-controls="touch-lyrics-content" onClick={() => changeView("lyrics")}><AudioLines />Lyrics</button>
            </div>
          </footer>
        </section>}
        <section className="touch-volume touch-panel" aria-label="Volume">
          <AuraIconButton label={(media.master ? media.muted : !media.volume) ? "Unmute" : "Mute"} disabled={!media.available} onClick={() => click("vol-icon")}>{media.muted || !media.volume ? <VolumeX /> : <Volume2 />}</AuraIconButton>
          <input id="touch-volume" type="range" aria-label={media.master ? "Master volume" : "Volume"} aria-valuetext={!media.available ? "Master volume unavailable" : `${Math.round(media.volume * 100)} percent${media.muted ? ", muted" : ""}`} disabled={!media.available} aria-orientation="vertical" min={0} max={100} step={1} value={Math.round(media.volume * 100)} onChange={e => window.aura.touchVolume(Number(e.target.value) / 100)} style={{ "--progress": `${media.volume * 100}%` } as CSSProperties} />
          <output>{media.available ? `${Math.round(media.volume * 100)}%` : "—"}</output>
        </section>
      </div>
    </section>
  );
}
