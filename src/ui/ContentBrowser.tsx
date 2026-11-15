import { useMemo, useState } from "react";
import { SegmentedControl, SearchField } from "glisse";
import {
  ListMusic,
  Library,
  Globe2,
  ArrowUpRight,
  Plus,
  FolderPlus,
  FileAudio,
  FolderCog,
  RefreshCw,
  ArrowDownWideNarrow,
  Check,
  Trash2,
} from "lucide-react";
import { AuraIconButton, AuraLiquidButton } from "./materials";
import {
  AuraContextMenu,
  type MenuPosition,
  type MenuAction,
} from "./AuraContextMenu";
import { TrackList } from "./TrackList";
import { useQueue } from "./queue-store";
import { useLibrary } from "./library-store";
export function ContentBrowser() {
  const queue = useQueue();
  const library = useLibrary();
  const [view, setView] = useState("queue");
  const [libraryQuery, setLibraryQuery] = useState("");
  const [sort, setSort] = useState("title");
  const [menu, setMenu] = useState<{
    kind: "add" | "sort" | "tools";
    position: MenuPosition;
  } | null>(null);
  const open = (
    kind: "add" | "sort" | "tools",
    event: React.MouseEvent<HTMLButtonElement>,
  ) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setMenu({
      kind,
      position: {
        x: rect.right - 224,
        y: rect.bottom + 6,
        restore: event.currentTarget,
      },
    });
  };
  const tracks = useMemo(
    () =>
      [...library.songs]
        .sort((a, b) =>
          sort === "title"
            ? a.title.localeCompare(b.title)
            : sort === "artist"
              ? a.artist.localeCompare(b.artist)
              : sort === "album"
                ? (a.album || "").localeCompare(b.album || "")
                : (b.scannedAt || 0) - (a.scannedAt || 0),
        )
        .map((song) => ({ id: song.filePath, song })),
    [library.songs, sort],
  );
  const queueSort = queue.sortKeys || [];
  const items: (MenuAction | "separator")[] =
    menu?.kind === "add"
      ? [
          {
            label: "Add files",
            icon: <FileAudio />,
            action: () => document.getElementById("btn-add-files")?.click(),
          },
          {
            label: "Add folder",
            icon: <FolderPlus />,
            action: () => document.getElementById("btn-add-folder")?.click(),
          },
        ]
      : menu?.kind === "tools"
        ? [
            {
              label: "Manage music sources",
              icon: <FolderCog />,
              action: () => document.getElementById("btn-library")?.click(),
            },
            {
              label: "Rescan library",
              icon: <RefreshCw />,
              action: () => document.getElementById("btn-rescan")?.click(),
            },
            ...(view === "queue"
              ? [
                  "separator" as const,
                  {
                    label: "Clear queue",
                    icon: <Trash2 />,
                    destructive: true,
                    disabled: !queue.nodes.length,
                    action: () =>
                      document.getElementById("btn-clear-queue")?.click(),
                  },
                ]
              : []),
          ]
        : view === "queue"
          ? ["artist", "album", "date"].map((key) => ({
              label:
                key === "date"
                  ? `Date added${queueSort.includes(key) ? (queue.dateDir === -1 ? " · newest first" : " · oldest first") : ""}`
                  : key[0].toUpperCase() + key.slice(1),
              checked: queueSort.includes(key),
              action: () => document.getElementById(`sort-${key}`)?.click(),
            }))
          : ["title", "artist", "album", "date"].map((key) => ({
              label:
                key === "date"
                  ? "Recently added"
                  : key[0].toUpperCase() + key.slice(1),
              checked: key === sort,
              action: () => setSort(key),
            }));
  return (
    <section
      className="content-browser"
      id="queue-panel"
      data-view={view}
      aria-label="Music browser"
    >
      <header className="browser-nav">
        <SegmentedControl
          aria-label="Music view"
          value={view}
          items={[
            {
              value: "queue",
              label: (
                <>
                  <ListMusic />
                  Queue
                </>
              ),
            },
            {
              value: "library",
              label: (
                <>
                  <Library />
                  Library
                </>
              ),
            },
          ]}
          onValueChange={setView}
        />
        <button
          id="btn-search-online"
          className="discover-action"
          title="Open online search"
          aria-haspopup="dialog"
          aria-controls="youtube-dialog"
          aria-expanded={false}
        >
          <Globe2 />
          <span>Discover</span>
          <ArrowUpRight />
        </button>
      </header>
      <div className="browser-heading">
        <div>
          <h2>{view === "queue" ? "Up next" : "Library"}</h2>
          <span
            className="track-count"
            id={view === "queue" ? "q-count" : undefined}
          >
            {view === "queue" ? queue.nodes.length : library.songs.length}{" "}
            {(view === "queue" ? queue.nodes.length : library.songs.length) ===
            1
              ? "track"
              : "tracks"}
          </span>
        </div>
        <AuraLiquidButton
          icon={<Plus />}
          aria-haspopup="menu"
          onClick={(event) => open("add", event)}
        >
          Add music
        </AuraLiquidButton>
      </div>
      <div className="browser-toolbar">
        <div className="browser-search">
          <div hidden={view !== "queue"}>
            <SearchField
              id="queue-search"
              placeholder="Search queue"
              aria-label="Search queue"
              onValueChange={(value) =>
                window.aura?.search(value.toLowerCase().trim())
              }
            />
          </div>
          <div hidden={view !== "library"}>
            <SearchField
              placeholder="Search library"
              aria-label="Search library tracks"
              value={libraryQuery}
              onValueChange={setLibraryQuery}
            />
          </div>
        </div>
        <AuraIconButton
          className={`sort-action ${view === "queue" && queueSort.length ? "active" : ""}`}
          label={
            view === "queue"
              ? `Sort queue${queueSort.length ? ": " + queueSort.join(", ") : ""}`
              : "Sort library"
          }
          aria-haspopup="menu"
          onClick={(event) => open("sort", event)}
        >
          <ArrowDownWideNarrow />
        </AuraIconButton>
        <AuraIconButton
          label="Library and queue actions"
          aria-haspopup="menu"
          onClick={(event) => open("tools", event)}
        >
          <FolderCog />
        </AuraIconButton>
      </div>
      <div className="browser-views">
        <div
          className="browser-view"
          hidden={view !== "queue"}
          aria-label="Queue view"
        >
          <TrackList entries={queue.nodes} mode="queue" query={queue.query} />
        </div>
        <div
          className="browser-view"
          hidden={view !== "library"}
          aria-label="Library view"
        >
          <TrackList entries={tracks} mode="library" query={libraryQuery} />
        </div>
      </div>
      {view === "library" && (
        <div className="browser-footer">
          <button
            onClick={() => document.getElementById("btn-library")?.click()}
          >
            <FolderCog />
            {library.folders.length + library.files.length} music{" "}
            {library.folders.length + library.files.length === 1
              ? "source"
              : "sources"}
          </button>
        </div>
      )}
      {menu && (
        <AuraContextMenu
          label={menu.kind === "sort" ? "Sort tracks" : "Library actions"}
          position={menu.position}
          items={items}
          onClose={() => setMenu(null)}
        />
      )}
    </section>
  );
}
