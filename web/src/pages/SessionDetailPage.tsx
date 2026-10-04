import { useState } from "react";
import { EventStream } from "../components/EventStream.js";
import { ExecutionGraph } from "../components/ExecutionGraph.js";
import { ExecutionWaterfall } from "../components/ExecutionWaterfall.js";
import { useEndpoint } from "../useEndpoint.js";
import { ENDPOINTS, type Transcript } from "../api.js";
import { prettyProjectName } from "../projectName.js";
import { sessionTitle, fmtNum } from "../sessionLabel.js";

type View = "timeline" | "events" | "graph";

const VIEW_TAB: Record<View, string> = {
  timeline: "Timeline",
  events: "Events",
  graph: "Graph",
};

const VIEW_TITLE: Record<View, string> = {
  timeline: "Timeline",
  events: "Events",
  graph: "Execution graph",
};

export interface SessionDetailPageProps {
  slug: string;
  sessionId: string;
  onBack?: () => void;
  /** When true, the component fits inside a ListDetail right pane (no outer padding). */
  embedded?: boolean;
}

function formatDate(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

export function SessionDetailPage({ slug, sessionId, onBack, embedded }: SessionDetailPageProps) {
  const [view, setView] = useState<View>("timeline");
  const [focusUuid, setFocusUuid] = useState<string | null>(null);
  const state = useEndpoint<Transcript>(ENDPOINTS.session(slug, sessionId));
  if (state.status === "loading") return <div className="loading">Caricamento…</div>;
  if (state.status === "error") return <div className="error">Errore: {state.error}</div>;

  const { meta, events, tree } = state.data;
  const totalTools = Object.values(meta.toolCounts).reduce((a, b) => a + b, 0);

  function jumpToEvent(uuid: string): void {
    setFocusUuid(uuid);
    setView("events");
  }

  const containerStyle = embedded
    ? { overflow: "visible" as const, padding: 0 }
    : { overflow: "auto" as const, padding: "8px 12px" };

  return (
    <div className={embedded ? "" : "canvas-body"} style={containerStyle}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        {onBack ? (
          <button type="button" className="sl-btn sl-btn--ghost sl-btn--sm" onClick={onBack}>← Back</button>
        ) : null}
        <h2 style={{ margin: 0 }}>{sessionTitle(meta)}</h2>
      </div>
      <div className="meta" title={slug}>{prettyProjectName(meta.cwd, slug)} · {meta.sessionId}</div>
      <dl className="sl-kv">
        <dt>first</dt><dd>{formatDate(meta.firstTs)}</dd>
        <dt>last</dt><dd>{formatDate(meta.lastTs)}</dd>
        <dt>cwd</dt><dd>{meta.cwd ?? "—"}</dd>
        <dt>git branch</dt><dd>{meta.gitBranch ?? "—"}</dd>
        <dt>models</dt><dd>{meta.models.join(", ") || "—"}</dd>
        <dt>messages</dt>
        <dd>
          user {fmtNum(meta.messageCounts.user)} · assistant {fmtNum(meta.messageCounts.assistant)}
          {" · "}sidechain {fmtNum(meta.messageCounts.sidechain)}
        </dd>
        <dt>tool calls</dt><dd>{fmtNum(totalTools)}</dd>
        <dt>subagents</dt><dd>{fmtNum(meta.subagentCount)}</dd>
        <dt>tokens</dt><dd>{fmtNum(meta.totalUsageTokens)}</dd>
      </dl>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 24, marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>
          {view === "events" ? `Events (${events.length})` : VIEW_TITLE[view]}
        </h3>
        <div className="sl-segmented" role="tablist" aria-label="Session view">
          {(["timeline", "events", "graph"] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              className="sl-segmented__item"
              aria-selected={view === v}
              onClick={() => setView(v)}
            >{VIEW_TAB[v]}</button>
          ))}
        </div>
      </div>
      {view === "timeline" ? (
        <ExecutionWaterfall events={events} onSelectEvent={jumpToEvent} />
      ) : view === "events" ? (
        <EventStream events={events} focusUuid={focusUuid} />
      ) : (
        <ExecutionGraph tree={tree} onSelectEvent={jumpToEvent} />
      )}
    </div>
  );
}
