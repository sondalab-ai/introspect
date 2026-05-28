import { ListDetail } from "../components/ListDetail.js";
import { useEndpoint } from "../useEndpoint.js";
import { ENDPOINTS, type MemoryItem } from "../api.js";

function scopeLabel(s: string): string {
  if (s === "global") return "global";
  if (s.startsWith("discovered:")) return `discovered · ${s.slice("discovered:".length)}`;
  return `project · ${s}`;
}

export function MemoriesPage() {
  const state = useEndpoint<MemoryItem[]>(ENDPOINTS.memories);
  if (state.status === "loading") return <div className="loading">Caricamento…</div>;
  if (state.status === "error") return <div className="error">Errore: {state.error}</div>;

  const items = state.data.map((it) => ({
    id: it.path,
    title: it.name,
    subtitle: scopeLabel(it.scope),
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
            <div className="meta">
              {scopeLabel(item.raw.scope)} · {item.raw.path}
            </div>
            <pre>{item.raw.bodyPreview}</pre>
          </>
        )}
      />
    </div>
  );
}
