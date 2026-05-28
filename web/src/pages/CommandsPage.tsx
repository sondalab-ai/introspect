import { ListDetail } from "../components/ListDetail.js";
import { useEndpoint } from "../useEndpoint.js";
import { ENDPOINTS, type CommandItem } from "../api.js";

export function CommandsPage() {
  const state = useEndpoint<CommandItem[]>(ENDPOINTS.commands);
  if (state.status === "loading") return <div className="loading">Caricamento…</div>;
  if (state.status === "error") return <div className="error">Errore: {state.error}</div>;

  const items = state.data.map((it) => ({
    id: it.path,
    title: `/${it.name}`,
    subtitle: it.description,
    raw: it,
  }));

  return (
    <div className="canvas-body">
      <ListDetail
        items={items}
        listTitle="Slash commands"
        emptyMessage="Nessun command trovato."
        renderDetail={(item) => (
          <>
            <h2>/{item.raw.name}</h2>
            <div className="meta">{item.raw.path}</div>
            <dl className="kv">
              <dt>description</dt><dd>{item.raw.description || "—"}</dd>
            </dl>
            <pre style={{ marginTop: 14 }}>{item.raw.bodyPreview}</pre>
          </>
        )}
      />
    </div>
  );
}
