import { useState } from "react";
import { EventStream } from "../components/EventStream.js";
import { ExecutionGraph } from "../components/ExecutionGraph.js";
import { ExecutionWaterfall } from "../components/ExecutionWaterfall.js";
import { useEndpoint } from "../useEndpoint.js";
import { ENDPOINTS, type Transcript } from "../api.js";
import { prettyProjectName } from "../projectName.js";
import { sessionTitle } from "../sessionLabel.js";

type View = "timeline" | "events" | "graph";

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
    : { overflow: "auto" as const, padding: "0 12px" };

  return (
    <div className={embedded ? "" : "canvas-body"} style={containerStyle}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        {onBack ? (
          <button className="tool-chip" onClick={onBack} style={{ cursor: "pointer" }}>← back</button>
        ) : null}
        <h2 style={{ margin: 0 }}>{sessionTitle(meta)}</h2>
      </div>
      <div className="meta" title={slug}>{prettyProjectName(meta.cwd, slug)} · {meta.sessionId}</div>
      <dl className="kv">
        <dt>first</dt><dd>{formatDate(meta.firstTs)}</dd>
        <dt>last</dt><dd>{formatDate(meta.lastTs)}</dd>
        <dt>cwd</dt><dd>{meta.cwd ?? "—"}</dd>
        <dt>git branch</dt><dd>{meta.gitBranch ?? "—"}</dd>
        <dt>models</dt><dd>{meta.models.join(", ") || "—"}</dd>
        <dt>messages</dt>
        <dd>
          user {meta.messageCounts.user} · assistant {meta.messageCounts.assistant}
          {" · "}sidechain {meta.messageCounts.sidechain}
        </dd>
        <dt>tool calls</dt><dd>{totalTools}</dd>
        <dt>subagents</dt><dd>{meta.subagentCount}</dd>
        <dt>tokens</dt><dd>{meta.totalUsageTokens}</dd>
      </dl>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 24, marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>
          {view === "events" ? `Events (${events.length})` : VIEW_TITLE[view]}
        </h3>
        <div className="view-toggle">
          <button
            className={`view-toggle-btn${view === "timeline" ? " on" : ""}`}
            onClick={() => setView("timeline")}
          >Timeline</button>
          <button
            className={`view-toggle-btn${view === "events" ? " on" : ""}`}
            onClick={() => setView("events")}
          >Events</button>
          <button
            className={`view-toggle-btn${view === "graph" ? " on" : ""}`}
            onClick={() => setView("graph")}
          >Graph</button>
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
