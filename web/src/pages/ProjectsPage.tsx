import { useState } from "react";
import { ListDetail } from "../components/ListDetail.js";
import { useEndpoint } from "../useEndpoint.js";
import { ENDPOINTS, type ProjectItem, type SessionListItem } from "../api.js";
import { prettyProjectName } from "../projectName.js";
import { sessionTitle, sessionContext } from "../sessionLabel.js";
import { SessionDetailPage } from "./SessionDetailPage.js";

function formatTs(ms: number): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleString();
}

/** Sessions of a project, inline in its detail pane: list → click → session detail. */
function ProjectSessions({ slug }: { slug: string }) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const state = useEndpoint<SessionListItem[]>(ENDPOINTS.sessionsOf(slug));
  if (state.status === "loading") return <div className="loading">Caricamento…</div>;
  if (state.status === "error") return <div className="error">Errore: {state.error}</div>;

  if (sessionId) {
    return (
      <div style={{ marginTop: 14 }}>
        <button className="tool-chip" style={{ cursor: "pointer", marginBottom: 10 }} onClick={() => setSessionId(null)}>
          ← sessioni
        </button>
        <SessionDetailPage slug={slug} sessionId={sessionId} embedded />
      </div>
    );
  }

  if (state.data.length === 0) return <div className="meta" style={{ marginTop: 14 }}>Nessuna sessione.</div>;

  return (
    <div style={{ marginTop: 18 }}>
      <div className="ld-list-title">Sessions ({state.data.length})</div>
      {state.data.map((s) => (
        <div key={s.sessionId} className="ld-item" onClick={() => setSessionId(s.sessionId)}>
          <div className="ld-item-title">{sessionTitle(s)}</div>
          <div className="ld-item-sub">{sessionContext(s)}</div>
        </div>
      ))}
    </div>
  );
}

export function ProjectsPage() {
  const state = useEndpoint<ProjectItem[]>(ENDPOINTS.projects);
  if (state.status === "loading") return <div className="loading">Caricamento…</div>;
  if (state.status === "error") return <div className="error">Errore: {state.error}</div>;

  const items = state.data.map((p) => ({
    id: p.id,
    title: prettyProjectName(p.cwd, p.slug),
    subtitle: `${p.sessionCount} sessioni · ${formatTs(p.lastActivityMs)}${p.cwdExists === false ? " · ⚠ cartella rimossa" : ""}`,
    raw: p,
  }));

  return (
    <div className="canvas-body">
      <ListDetail
        storageKey="projects"
        items={items}
        listTitle={`Projects (${items.length})`}
        emptyMessage="Nessun progetto trovato."
        renderDetail={(item) => (
          <>
            <h2>{prettyProjectName(item.raw.cwd, item.raw.slug)}</h2>
            <div className="meta" title={item.raw.slug}>
              {item.raw.cwd ?? item.raw.slug}
              {item.raw.cwdExists === false ? " · ⚠ cartella non più esistente" : ""}
            </div>
            <ProjectSessions key={item.raw.slug} slug={item.raw.slug} />
          </>
        )}
      />
    </div>
  );
}
