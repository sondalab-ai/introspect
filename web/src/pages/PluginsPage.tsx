import { ListDetail } from "../components/ListDetail.js";
import { useEndpoint } from "../useEndpoint.js";
import { ENDPOINTS, type PluginItem } from "../api.js";

export function PluginsPage() {
  const state = useEndpoint<PluginItem[]>(ENDPOINTS.plugins);
  if (state.status === "loading") return <div className="loading">Caricamento…</div>;
  if (state.status === "error") return <div className="error">Errore: {state.error}</div>;

  const items = state.data.map((it) => ({
    id: `${it.rootPath}::${it.id}`,
    title: it.id,
    subtitle: it.enabled ? "enabled" : "disabled",
    raw: it,
  }));

  return (
    <div className="canvas-body">
      <ListDetail
        items={items}
        listTitle="Plugin installati"
        emptyMessage="Nessun plugin trovato."
        renderDetail={(item) => (
          <>
            <h2>{item.raw.id}</h2>
            <div className="meta">{item.raw.rootPath}</div>
            <dl className="kv">
              <dt>source</dt><dd>{item.raw.source || "—"}</dd>
              <dt>version</dt><dd>{item.raw.version || "—"}</dd>
              <dt>enabled</dt><dd>{String(item.raw.enabled)}</dd>
            </dl>
          </>
        )}
      />
    </div>
  );
}
