import { useEffect, useMemo, useRef, useState, memo } from "react";
import {
  MoreHorizontal,
  Music2,
  GripVertical,
  Play,
  ListPlus,
  Plus,
  X,
  FolderPlus,
  SearchX,
} from "lucide-react";
import { useQueue, fileUrl, type Song } from "./queue-store";
import {
  AuraContextMenu,
  type MenuPosition,
  type MenuAction,
} from "./AuraContextMenu";
import { AuraIconButton, AuraLiquidButton, EmptyState } from "./materials";
import { useQueueDrag } from "./useQueueDrag";
export const TRACK_HEIGHT = 64;
export function durationLabel(value?: number) {
  return value && Number.isFinite(value)
    ? `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, "0")}`
    : "—";
}
type Entry = { id: string; song: Song };
export const TrackList = memo(function TrackList({
  entries,
  mode,
  query,
  listId,
}: {
  entries: Entry[];
  mode: "queue" | "library";
  query: string;
  listId?: string;
}) {
  const queue = useQueue();
  const list = useRef<HTMLDivElement>(null);
  const reorderBlocked = Boolean(query.trim() || queue.sortKeys?.length);
  const sortable = useQueueDrag(
    list,
    entries.map((entry) => entry.id),
    mode !== "queue" || reorderBlocked,
    TRACK_HEIGHT,
  );
  const [scroll, setScroll] = useState(0);
  const [height, setHeight] = useState(500);
  const [context, setContext] = useState<{
    entry: Entry;
    position: MenuPosition;
  } | null>(null);
  const filtered = useMemo(
    () =>
      entries.filter(
        (entry) =>
          !query ||
          `${entry.song.title} ${entry.song.artist} ${entry.song.album || ""}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      ),
    [entries, query],
  );
  const currentPath = queue.nodes.find((node) => node.id === queue.current)
    ?.song.filePath;
  const previous = useRef(queue.current);
  useEffect(() => {
    const element = list.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      setHeight(element.clientHeight);
      (element.previousElementSibling as HTMLElement)?.style.setProperty(
        "--track-scrollbar",
        `${element.getBoundingClientRect().width - (element.querySelector(".track-spacer")?.getBoundingClientRect().width ?? element.clientWidth)}px`,
      );
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (previous.current === queue.current) return;
    previous.current = queue.current;
    if (mode !== "queue" || query || !list.current) return;
    const index = filtered.findIndex((entry) => entry.id === queue.current);
    const top = index * TRACK_HEIGHT;
    const element = list.current;
    if (
      index >= 0 &&
      (top < element.scrollTop ||
        top + TRACK_HEIGHT > element.scrollTop + element.clientHeight)
    )
      element.scrollTo({
        top: Math.max(0, top - element.clientHeight / 2),
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
  }, [queue.current, filtered, mode, query]);
  useEffect(() => {
    list.current?.scrollTo({ top: 0 });
    setScroll(0);
  }, [query]);
  const start = Math.max(
    0,
    Math.min(filtered.length - 1, Math.floor(scroll / TRACK_HEIGHT) - 4),
  );
  const end = Math.min(
    filtered.length,
    start + Math.ceil(height / TRACK_HEIGHT) + 9,
  );
  const act = (entry: Entry, action: "play" | "next" | "append") =>
    mode === "queue"
      ? action === "play"
        ? window.aura.play(entry.id)
        : window.aura.next(entry.id)
      : window.aura.libraryTrack(entry.song.filePath, action);
  const actions = (entry: Entry): (MenuAction | "separator")[] => [
    { label: "Play", icon: <Play />, action: () => act(entry, "play") },
    {
      label: "Play next",
      icon: <ListPlus />,
      disabled:
        mode === "queue"
          ? entry.id === queue.current
          : entry.song.filePath === currentPath,
      action: () => act(entry, "next"),
    },
    ...(mode === "library"
      ? [
          {
            label: queue.nodes.some(
              (node) => node.song.filePath === entry.song.filePath,
            )
              ? "In queue"
              : "Add to queue",
            icon: <Plus />,
            disabled: queue.nodes.some(
              (node) => node.song.filePath === entry.song.filePath,
            ),
            action: () => act(entry, "append"),
          },
        ]
      : [
          "separator" as const,
          {
            label: "Remove from queue",
            icon: <X />,
            destructive: true,
            action: () => window.aura.remove(entry.id),
          },
        ]),
  ];
  return (
    <>
      <div className="track-columns" aria-hidden="true">
        <span>Title</span>
        <span>Album</span>
        <span>Time</span>
      </div>
      <div
        className="track-list"
        id={listId || (mode === "queue" ? "queue-list" : "library-track-list")}
        role="list"
        aria-label={mode === "queue" ? "Playback queue" : "Library tracks"}
        ref={list}
        onScroll={(event) => setScroll(event.currentTarget.scrollTop)}
      >
        {!entries.length ? (
          <EmptyState
            icon={<Music2 />}
            title={
              mode === "queue" ? "Your queue is empty" : "Your library is empty"
            }
            action={
              <AuraLiquidButton
                icon={<FolderPlus />}
                onClick={() =>
                  document.getElementById("btn-add-folder")?.click()
                }
              >
                Add music folder
              </AuraLiquidButton>
            }
          >
            Add files or a folder, or drop music into this window.
          </EmptyState>
        ) : !filtered.length ? (
          <EmptyState icon={<SearchX />} title="No matching tracks">
            Try another title, artist, or album.
          </EmptyState>
        ) : (
          <div
            className="track-spacer"
            style={{ height: filtered.length * TRACK_HEIGHT }}
          >
            {filtered.slice(start, end).map((entry, offset) => {
              const index = start + offset;
              const active =
                mode === "queue"
                  ? entry.id === queue.current
                  : entry.song.filePath === currentPath;
              return (
                <div
                  className={`track-row ${mode === "queue" ? "q-item" : ""} ${active ? "active" : ""}`}
                  key={entry.id}
                  role="listitem"
                  aria-current={active ? "true" : undefined}
                  data-id={entry.id}
                  style={{ top: index * TRACK_HEIGHT, height: TRACK_HEIGHT }}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setContext({
                      entry,
                      position: {
                        x: event.clientX,
                        y: event.clientY,
                        restore:
                          event.currentTarget.querySelector<HTMLButtonElement>(
                            ".track-hit",
                          ),
                      },
                    });
                  }}
                  onPointerDown={(event) => sortable.begin(event, entry.id)}
                  onDragStart={(event) => event.preventDefault()}
                  onClickCapture={(event) => {
                    if (sortable.suppressClick.current) {
                      event.preventDefault();
                      event.stopPropagation();
                    }
                  }}
                  onClick={(event) => {
                    if (
                      (event.target as HTMLElement).closest(".track-gutter") ||
                      event.target === event.currentTarget
                    )
                      act(entry, "play");
                  }}
                  data-index={index}
                >
                  <div className="track-gutter">
                    {active ? (
                      <span
                        className={`playing-bars ${queue.playing ? "" : "paused"}`}
                        aria-label={queue.playing ? "Playing" : "Paused"}
                      >
                        <i />
                        <i />
                        <i />
                      </span>
                    ) : (
                      <span className="track-number">{index + 1}</span>
                    )}
                    {mode === "queue" && (
                      <button
                        className="track-grip"
                        disabled={reorderBlocked}
                        aria-label={`Reorder ${entry.song.title}`}
                        title={
                          reorderBlocked
                            ? "Clear search and sorting to reorder"
                            : "Drag anywhere on the row · Alt + Up/Down"
                        }
                        onKeyDown={(event) => {
                          if (reorderBlocked) return;
                          if (
                            event.altKey &&
                            ["ArrowUp", "ArrowDown"].includes(event.key)
                          ) {
                            event.preventDefault();
                            event.stopPropagation();
                            const original = queue.nodes.findIndex(
                              (node) => node.id === entry.id,
                            );
                            const target =
                              queue.nodes[
                                event.key === "ArrowUp"
                                  ? original - 1
                                  : original + 2
                              ];
                            if (event.key === "ArrowUp" && original === 0)
                              return;
                            window.aura.move(entry.id, target?.id);
                          }
                        }}
                      >
                        <GripVertical />
                      </button>
                    )}
                  </div>
                  <button
                    className="track-hit"
                    aria-label={`Play ${entry.song.title} by ${entry.song.artist}`}
                    onClick={() => act(entry, "play")}
                  >
                    <span className="track-art">
                      <Music2 />
                      {entry.song.coverPath && (
                        <img
                          draggable={false}
                          src={fileUrl(entry.song.coverPath)}
                          loading="lazy"
                          alt=""
                          onError={(event) =>
                            (event.currentTarget.hidden = true)
                          }
                        />
                      )}
                    </span>
                    <span className="track-meta">
                      <span className="track-title" title={entry.song.title}>
                        {entry.song.title}
                      </span>
                      <span className="track-artist" title={entry.song.artist}>
                        {entry.song.artist || "Unknown artist"}
                      </span>
                    </span>
                    <span className="track-album" title={entry.song.album}>
                      {entry.song.album && entry.song.album !== "Unknown Album"
                        ? entry.song.album
                        : "—"}
                    </span>
                    <span className="track-duration">
                      {durationLabel(entry.song.duration)}
                    </span>
                  </button>
                  <AuraIconButton
                    className="track-menu"
                    label={`Actions for ${entry.song.title}`}
                    aria-haspopup="menu"
                    onClick={(event) => {
                      const rect = event.currentTarget.getBoundingClientRect();
                      setContext({
                        entry,
                        position: {
                          x: rect.right - 224,
                          y: rect.bottom + 4,
                          restore: event.currentTarget,
                        },
                      });
                    }}
                  >
                    <MoreHorizontal />
                  </AuraIconButton>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {mode === "queue" && (
        <>
          <p className="queue-reorder-hint" hidden={!reorderBlocked}>
            Clear search and sorting to reorder tracks.
          </p>
          <span className="queue-drag-status sr-only" aria-live="polite" />
        </>
      )}
      {context && (
        <AuraContextMenu
          position={context.position}
          items={actions(context.entry)}
          onClose={() => setContext(null)}
        />
      )}
    </>
  );
});
