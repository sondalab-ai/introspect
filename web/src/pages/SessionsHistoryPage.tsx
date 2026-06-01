import { ListDetail } from "../components/ListDetail.js";
import { useEndpoint } from "../useEndpoint.js";
import { ENDPOINTS, type SessionListItem } from "../api.js";
import { sessionTitle, sessionContext } from "../sessionLabel.js";
import { SessionDetailPage } from "./SessionDetailPage.js";

export function SessionsHistoryPage() {
  const state = useEndpoint<SessionListItem[]>(ENDPOINTS.sessionsAll);

  if (state.status === "loading") return <div className="loading">Caricamento…</div>;
  if (state.status === "error") return <div className="error">Errore: {state.error}</div>;

  const items = state.data.map((s) => ({
    id: `${s.slug}::${s.sessionId}`,
    title: sessionTitle(s),
    subtitle: sessionContext(s),
    raw: s,
  }));

  return (
    <div className="canvas-body">
      <ListDetail
        storageKey="sessions-history"
        items={items}
        listTitle={`Sessions (${items.length})`}
        emptyMessage="Nessuna sessione."
        renderDetail={(item) => (
          <SessionDetailPage slug={item.raw.slug} sessionId={item.raw.sessionId} embedded />
        )}
      />
    </div>
  );
}
