import { useMemo, useState, type ReactNode } from "react";
import { useResizableWidth } from "../useResizableWidth.js";

export interface ListDetailItem {
  /** Stable identifier — also the React key. */
  id: string;
  /** Primary label shown in the list. */
  title: string;
  /** Secondary line shown under the title. */
  subtitle?: string;
  /** Indent depth (0 = root). Used to render hierarchy in the list. */
  level?: number;
}

export interface ListDetailProps<T extends ListDetailItem> {
  items: T[];
  /** Renders the right pane for the currently selected item. */
  renderDetail: (item: T) => ReactNode;
  /** Title shown above the list. */
  listTitle: string;
  /** Shown when items is empty (no query). */
  emptyMessage?: string;
  /**
   * Namespace for persisted UI state (list width, etc). Pass a stable string
   * per page, e.g. `"memories"`. Defaults to a shared namespace.
   */
  storageKey?: string;
  /** Whether to render the free-text search input above the list. Default true. */
  searchable?: boolean;
}

/** Match each whitespace-separated token as a case-insensitive substring of `title + subtitle`. */
function matches(item: ListDetailItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return true;
  const hay = `${item.title} ${item.subtitle ?? ""}`.toLowerCase();
  for (const token of q.split(/\s+/)) {
    if (token === "") continue;
    if (!hay.includes(token)) return false;
  }
  return true;
}

const MIN_W = 200;
const MAX_W = 640;
const DEFAULT_W = 300;

export function ListDetail<T extends ListDetailItem>({
  items,
  renderDetail,
  listTitle,
  emptyMessage = "Niente da mostrare.",
  storageKey = "default",
  searchable = true,
}: ListDetailProps<T>) {
  const { width, handlers } = useResizableWidth({
    storageKey: `ld-w:${storageKey}`,
    min: MIN_W,
    max: MAX_W,
    initial: DEFAULT_W,
  });

  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(items[0]?.id ?? null);

  const filtered = useMemo(() => items.filter((i) => matches(i, query)), [items, query]);
  const selected = filtered.find((i) => i.id === selectedId) ?? filtered[0];

  return (
    <div className="ld" style={{ gridTemplateColumns: `${width}px 8px 1fr` }}>
      <div className="ld-list">
        <div className="ld-list-title">{listTitle}</div>
        {searchable ? (
          <input
            className="ld-search"
            placeholder="Cerca…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
          />
        ) : null}
        {filtered.length === 0 ? (
          <div className="ld-empty">{query.trim() ? "Nessun risultato." : emptyMessage}</div>
        ) : (
          filtered.map((item) => {
            const lvl = item.level ?? 0;
            const padLeft = 10 + lvl * 16;
            return (
              <div
                key={item.id}
                className={`ld-item${item.id === (selected?.id ?? "") ? " on" : ""}${lvl > 0 ? " is-child" : ""}`}
                style={{ paddingLeft: padLeft }}
                onClick={() => setSelectedId(item.id)}
              >
                <div className="ld-item-title">{item.title}</div>
                {item.subtitle ? <div className="ld-item-sub">{item.subtitle}</div> : null}
              </div>
            );
          })
        )}
      </div>
      <div
        className="resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize list pane"
        {...handlers}
      >
        <div className="resizer-grip" />
      </div>
      <div className="ld-detail">{selected ? renderDetail(selected) : null}</div>
    </div>
  );
}
