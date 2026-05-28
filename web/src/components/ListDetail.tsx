import { useState, type ReactNode } from "react";

export interface ListDetailItem {
  /** Stable identifier — also the React key. */
  id: string;
  /** Primary label shown in the list. */
  title: string;
  /** Secondary line shown under the title. */
  subtitle?: string;
}

export interface ListDetailProps<T extends ListDetailItem> {
  items: T[];
  /** Renders the right pane for the currently selected item. */
  renderDetail: (item: T) => ReactNode;
  /** Title shown above the list. */
  listTitle: string;
  /** Shown when items is empty. */
  emptyMessage?: string;
}

export function ListDetail<T extends ListDetailItem>({
  items,
  renderDetail,
  listTitle,
  emptyMessage = "Niente da mostrare.",
}: ListDetailProps<T>) {
  const [selectedId, setSelectedId] = useState<string | null>(items[0]?.id ?? null);
  const selected = items.find((i) => i.id === selectedId) ?? items[0];

  return (
    <div className="ld">
      <div className="ld-list">
        <div className="ld-list-title">{listTitle}</div>
        {items.length === 0 ? (
          <div className="ld-empty">{emptyMessage}</div>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className={`ld-item${item.id === (selected?.id ?? "") ? " on" : ""}`}
              onClick={() => setSelectedId(item.id)}
            >
              <div className="ld-item-title">{item.title}</div>
              {item.subtitle ? <div className="ld-item-sub">{item.subtitle}</div> : null}
            </div>
          ))
        )}
      </div>
      <div className="ld-detail">{selected ? renderDetail(selected) : null}</div>
    </div>
  );
}
