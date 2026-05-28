import { ListDetail } from "../components/ListDetail.js";
import { Markdown } from "../components/Markdown.js";
import { useEndpoint } from "../useEndpoint.js";
import { ENDPOINTS, type MemoryItem } from "../api.js";

type ScopeKind = "global" | "project" | "discovered";

function scopeChip(s: string): { label: string; kind: ScopeKind } {
  if (s === "global") return { label: "global", kind: "global" };
  if (s.startsWith("discovered:")) {
    const path = s.slice("discovered:".length);
    return { label: path, kind: "discovered" };
  }
  return { label: s, kind: "project" };
}

function ScopeChip({ scope }: { scope: string }) {
  const c = scopeChip(scope);
  return (
    <span className={`glass-chip is-${c.kind}`} title={scope}>
      <span className="chip-text">{c.label}</span>
    </span>
  );
}

export function MemoriesPage() {
  const state = useEndpoint<MemoryItem[]>(ENDPOINTS.memories);
  if (state.status === "loading") return <div className="loading">Caricamento…</div>;
  if (state.status === "error") return <div className="error">Errore: {state.error}</div>;

  const items = state.data.map((it) => ({
    id: it.path,
    title: it.name,
    subtitle: scopeChip(it.scope).label,
    raw: it,
  }));

  return (
    <div className="canvas-body">
      <ListDetail
        storageKey="memories"
        items={items}
        listTitle={`Memories (${items.length})`}
        emptyMessage="Nessuna memoria trovata."
        renderDetail={(item) => (
          <>
            <h2>{item.raw.name}</h2>
            <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "2px 0 16px" }}>
              <ScopeChip scope={item.raw.scope} />
            </div>
            <div className="meta">{item.raw.path}</div>
            <Markdown>{item.raw.body}</Markdown>
          </>
        )}
      />
    </div>
  );
}
