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
            {item.raw.description ? (
              <div className="detail-lead">{item.raw.description}</div>
            ) : null}
            {item.raw.tools ? (
              <div className="tools-row">
                {item.raw.tools
                  .split(",")
                  .map((t) => t.trim())
                  .filter(Boolean)
                  .map((t) => (
                    <span className="tool-chip" key={t}>{t}</span>
                  ))}
              </div>
            ) : null}
            <Markdown>{item.raw.body}</Markdown>
          </>
        )}
      />
    </div>
  );
}
