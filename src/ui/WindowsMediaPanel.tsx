import { AppWindow, AudioLines, Check, MonitorSpeaker, Radio } from "lucide-react";
import type { useWindowsMedia } from "./windows-media";
import { SessionLyrics } from "./SessionLyrics";

export function WindowsMediaPanel({ media }: { media: ReturnType<typeof useWindowsMedia> }) {
  return <section className="touch-system-panel" aria-label="Windows media">
    <SessionLyrics media={media} />
    <section className="touch-panel system-sessions" aria-label="Windows media sessions">
      <header className="system-section-heading"><div><small>CONNECTED APPS</small><h2><Radio />Media sessions <span>{media.sessions.length}</span></h2></div><span className={`system-connection ${media.available ? "is-online" : ""}`}>{media.available ? "Connected" : media.error ? "Unavailable" : "Connecting"}</span></header>
      <div className="system-session-list" role="group" aria-label="Select a media session">
        {media.sessions.map(session => <button key={session.id} className={`system-session-card ${session.id === media.selected?.id ? "is-selected" : ""}`} aria-pressed={session.id === media.selected?.id} onClick={() => media.select(session.id)}>
          <span className="system-session-art"><AppWindow />{session.thumbnail && <img src={session.thumbnail} alt="" onError={e => { e.currentTarget.style.visibility = "hidden"; }} />}</span>
          <span className="system-session-meta"><span className="system-app-name">{session.appName || session.source}</span><strong>{session.title || "Untitled media"}</strong><span className="system-session-artist">{session.artist || session.album || "Media session"}</span><span className="system-playback-status">{session.playing ? <><AudioLines /> Playing</> : "Paused"}</span></span>
          <span className="system-selected-mark">{session.id === media.selected?.id && <Check />}</span>
        </button>)}
        {!media.sessions.length && <div className="system-empty"><MonitorSpeaker /><h3>{media.available ? "Your apps appear here" : "Windows media isn’t available"}</h3><p>{media.available ? "Play something in Spotify, a browser, or another media app. Select its card to take control." : media.error === "access-denied" ? "Windows didn’t allow media-session access. Reopen AURA in your normal Windows session." : media.error === "bridge-missing" ? "The Windows media helper is missing. Reinstall AURA to restore it." : "Waiting for Windows media services. AURA playback is still available."}</p>{!media.available && media.error && <details className="system-connection-details"><summary>Connection details</summary>{media.diagnostic && <p>{media.diagnostic}</p>}<button onClick={() => window.electronAPI?.openWindowsMediaLog?.()}>Open connection log</button></details>}</div>}
      </div>
    </section>
    {media.message && <p className="system-control-message" role="status">{media.message}</p>}
  </section>;
}
