import { ListDetail } from "../components/ListDetail.js";
import { Markdown } from "../components/Markdown.js";
import { useEndpoint } from "../useEndpoint.js";
import { ENDPOINTS, type AgentItem } from "../api.js";

export function AgentsPage() {
  const state = useEndpoint<AgentItem[]>(ENDPOINTS.agents);
  if (state.status === "loading") return <div className="loading">Caricamento…</div>;
  if (state.status === "error") return <div className="error">Errore: {state.error}</div>;

  const items = state.data.map((it) => ({
    id: it.path,
    title: it.name,
    subtitle: it.description,
    raw: it,
  }));

  return (
    <div className="canvas-body">
      <ListDetail
        storageKey="agents"
        items={items}
        listTitle="Subagenti"
        emptyMessage="Nessun agente trovato."
        renderDetail={(item) => (
          <>
            <h2>{item.raw.name}</h2>
            <div className="meta">{item.raw.path}</div>
            <dl className="kv">
              <dt>description</dt><dd>{item.raw.description || "—"}</dd>
              <dt>tools</dt><dd>{item.raw.tools || "—"}</dd>
            </dl>
            <div style={{ marginTop: 14 }}><Markdown>{item.raw.body}</Markdown></div>
          </>
        )}
      />
    </div>
  );
}
