import { useEffect, useState } from "react";
import { Switch, SegmentedControl } from "glisse";
import {
  AudioLines,
  Settings2,
  PanelRightClose,
  PanelRightOpen,
  Minus,
  Square,
  Copy,
  X,
  ArrowDownToLine,
  RefreshCw,
  Hand,
} from "lucide-react";
import { AuraIconButton } from "./materials";
import { NowPlaying, AudioPanel, Immersive } from "./Player";
import { ContentBrowser } from "./ContentBrowser";
import { Secondary } from "./SecondarySurfaces";
import { ConfirmDialog } from "./ConfirmDialog";
import { TouchPlayer } from "./TouchPlayer";
import { observePlayerLayout } from "./layout";
import { MusicQueue } from "../core/music-queue.mjs";
import { parseLRC, parseLRCTime } from "../core/lyrics.mjs";
import { EqualizerEngine } from "../core/equalizer.mjs";
import { mediaUrl } from "../core/media-url.mjs";
import "./library-store";
import controllerUrl from "../renderer.js?url";
import onlineUrl from "../youtube-ui.js?url";
Object.assign(window, {
  AuraDomain: { MusicQueue, parseLRC, parseLRCTime, EqualizerEngine, mediaUrl },
});
export function App() {
  const [controlsStyle, setControlsStyle] = useState(() =>
    localStorage.getItem("aura-controls-style") === "classic"
      ? "classic"
      : "sculpted",
  );
  useEffect(() => {
    document.documentElement.dataset.controls = controlsStyle;
    localStorage.setItem("aura-controls-style", controlsStyle);
  }, [controlsStyle]);
  useEffect(() => {
    document.documentElement.dataset.input = "keyboard";
    const pointer = () => {
      document.documentElement.dataset.input = "pointer";
    };
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Tab")
        document.documentElement.dataset.input = "keyboard";
    };
    document.addEventListener("pointerdown", pointer, true);
    document.addEventListener("keydown", keyboard, true);
    return () => {
      document.removeEventListener("pointerdown", pointer, true);
      document.removeEventListener("keydown", keyboard, true);
    };
  }, []);
  const [reduced, setReduced] = useState(
    () => localStorage.getItem("aura-reduced-effects") === "true",
  );
  useEffect(() => {
    document.documentElement.dataset.effects = reduced ? "reduced" : "full";
    localStorage.setItem("aura-reduced-effects", String(reduced));
  }, [reduced]);
  useEffect(() => {
    const stop = observePlayerLayout();
    if (window.aura) {
      location.reload();
      return stop;
    }
    const script = document.createElement("script");
    script.src = controllerUrl;
    script.onload = () => {
      const online = document.createElement("script");
      online.src = onlineUrl;
      document.body.append(online);
      window.dispatchEvent(new Event("aura-ready"));
    };
    script.onerror = () => {
      document.getElementById("loading-text")!.textContent =
        "AURA could not start. Restart the app to try again.";
    };
    document.body.append(script);
    return stop;
  }, []);
  return (
    <div id="root">
      <div id="player-bg" className="ambient-background">
        <img id="ambient-art" alt="" aria-hidden="true" />
        <img id="ambient-art-previous" alt="" aria-hidden="true" />
        <div className="ambient-shade" />
      </div>
      <header id="titlebar">
        <div id="app-brand">
          <AudioLines />
          <span>AURA</span>
        </div>
        <div className="titlebar-actions">
          <AuraIconButton id="btn-update" label="Update available" hidden>
            <ArrowDownToLine id="icon-update-download" />
            <span id="icon-update-restart" hidden>
              <RefreshCw />
            </span>
          </AuraIconButton>
          <AuraIconButton
            id="btn-touch-mode"
            label="Touch screen mode"
            onClick={() => window.aura?.touchMode(true)}
          >
            <Hand />
          </AuraIconButton>
          <AuraIconButton
            id="btn-settings"
            label="Settings"
            aria-expanded={false}
            aria-controls="settings-popover"
          >
            <Settings2 />
          </AuraIconButton>
          <AuraIconButton id="btn-queue-toggle" label="Collapse browser">
            <PanelRightClose id="icon-compress" />
            <PanelRightOpen id="icon-expand" style={{ display: "none" }} />
          </AuraIconButton>
          <span className="window-controls">
            <AuraIconButton id="btn-min" label="Minimize">
              <Minus />
            </AuraIconButton>
            <AuraIconButton id="btn-maximize" label="Maximize">
              <Square id="icon-maximize" />
              <Copy id="icon-restore" style={{ display: "none" }} />
            </AuraIconButton>
            <AuraIconButton id="btn-close" label="Close">
              <X />
            </AuraIconButton>
          </span>
        </div>
      </header>
      <main id="layout">
        <NowPlaying />
        <ContentBrowser />
      </main>
      <Secondary>
        <div className="settings-row">
          <span>Player controls</span>
          <SegmentedControl
            className="preference-segments controls-style-segments"
            aria-label="Player controls style"
            value={controlsStyle}
            onValueChange={setControlsStyle}
            items={[
              { value: "classic", label: "Classic" },
              { value: "sculpted", label: "Sculpted" },
            ]}
          />
        </div>
        <div className="settings-row">
          <label htmlFor="reduced-effects">Reduced effects</label>
          <Switch
            id="reduced-effects"
            checked={reduced}
            onCheckedChange={setReduced}
            aria-label="Reduced visual effects"
          />
        </div>
      </Secondary>
      <AudioPanel />
      <Immersive />
      <TouchPlayer />
      <ConfirmDialog />
      <div id="loading-overlay" role="status">
        <div id="loading-spinner" />
        <span id="loading-text">Loading library…</span>
      </div>
      <div id="toast" role="status" aria-live="polite" />
      <div hidden aria-hidden="true" id="controller-actions">
        <button id="btn-add-files" />
        <button id="btn-add-folder" />
        <button id="btn-rescan" />
        <button id="btn-library" />
        <button id="btn-clear-queue" />
        <div id="queue-sort-bar">
          <button id="sort-artist" />
          <button id="sort-album" />
          <button id="sort-date">
            <span id="sort-date-dir" />
          </button>
        </div>
      </div>
      <audio id="audio" crossOrigin="anonymous" />
    </div>
  );
}
