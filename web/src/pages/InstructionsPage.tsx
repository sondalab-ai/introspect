import { ListDetail } from "../components/ListDetail.js";
import { useEndpoint } from "../useEndpoint.js";
import { ENDPOINTS, type InstructionsItem } from "../api.js";

export function InstructionsPage() {
  const state = useEndpoint<InstructionsItem[]>(ENDPOINTS.instructions);
  if (state.status === "loading") return <div className="loading">Caricamento…</div>;
  if (state.status === "error") return <div className="error">Errore: {state.error}</div>;

  const items = state.data.map((it) => ({
    id: it.path,
    title: it.path.split("/").slice(-2).join("/"),
    subtitle: it.rootPath,
    raw: it,
  }));

  return (
    <div className="canvas-body">
      <ListDetail
        items={items}
        listTitle="CLAUDE.md per config root"
        emptyMessage="Nessun CLAUDE.md trovato."
        renderDetail={(item) => (
          <>
            <h2>{item.title}</h2>
            <div className="meta">{item.raw.path}</div>
            <pre>{item.raw.content}</pre>
          </>
        )}
      />
    </div>
  );
}
