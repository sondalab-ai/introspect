import { Markdown } from "./Markdown.js";
import { JsonView } from "./JsonView.js";
import type { SessionEvent } from "../api.js";

export const KIND_COLOR: Record<SessionEvent["kind"], string> = {
  thinking: "#b08cff",
  text: "#cfe1dd",
  user: "#7cc4ff",
  tool_use: "#2ee6c0",
  tool_result: "#8fa3b0",
  subagent_spawn: "#ffb87c",
  skill_use: "#7cc4ff",
  meta: "#6e8088",
};

/** Short human label for an event, used in graph nodes, waterfall rows, and detail. */
export function eventLabel(ev: SessionEvent): string {
  switch (ev.kind) {
    case "tool_use": return ev.name;
    case "subagent_spawn": return ev.subagentType;
    case "skill_use": return ev.skill;
    case "tool_result": return ev.ok ? "ok" : "err";
    case "user": return "user";
    case "thinking": return "think";
    case "text": return "say";
    case "meta": return ev.key;
  }
}

function fmtTime(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function KindFields({ ev }: { ev: SessionEvent }) {
  switch (ev.kind) {
    case "tool_use":
      return <><dt>tool</dt><dd>{ev.name}</dd><dt>toolUseId</dt><dd><code>{ev.toolUseId}</code></dd></>;
    case "tool_result":
      return (
        <>
          <dt>status</dt><dd>{ev.ok ? "ok" : "error"}</dd>
          <dt>toolUseId</dt><dd><code>{ev.toolUseId}</code></dd>
        </>
      );
    case "subagent_spawn":
      return (
        <>
          <dt>subagent</dt><dd>{ev.subagentType}</dd>
          <dt>toolUseId</dt><dd><code>{ev.toolUseId}</code></dd>
        </>
      );
    case "skill_use":
      return <><dt>skill</dt><dd>{ev.skill}</dd></>;
    case "meta":
      return <><dt>key</dt><dd>{ev.key}</dd></>;
    default:
      return null;
  }
}

function Body({ ev }: { ev: SessionEvent }) {
  switch (ev.kind) {
    case "thinking":
    case "text":
    case "user":
      return ev.text ? (
        <div className="exec-detail-body exec-detail-md">
          <Markdown>{ev.text}</Markdown>
        </div>
      ) : <div className="exec-detail-body exec-detail-empty">(empty)</div>;
    case "subagent_spawn":
      return ev.description ? (
        <div className="exec-detail-body exec-detail-md">
          <Markdown>{ev.description}</Markdown>
        </div>
      ) : null;
    case "tool_use":
      return <JsonView value={ev.input} className="exec-detail-body" />;
    case "tool_result":
      return ev.preview ? (
        <pre className="exec-detail-body exec-detail-pre">{ev.preview}</pre>
      ) : null;
    case "meta":
      if (typeof ev.value === "string") {
        return <pre className="exec-detail-body exec-detail-pre">{ev.value}</pre>;
      }
      return <JsonView value={ev.value} className="exec-detail-body" />;
    default:
      return null;
  }
}

/** Shared detail card for a single session event (graph + waterfall reuse it). */
export function EventDetail({ ev }: { ev: SessionEvent }) {
  return (
    <div className="exec-detail">
      <div className="exec-detail-head">
        <span className="exec-detail-kind" style={{ background: KIND_COLOR[ev.kind], color: "#0a1014" }}>
          {ev.kind}
        </span>
        <span className="exec-detail-label">{eventLabel(ev)}</span>
        {ev.isSidechain ? <span className="exec-detail-tag">sidechain</span> : null}
      </div>
      <dl className="kv exec-detail-kv">
        <dt>time</dt><dd>{fmtTime(ev.ts)}</dd>
        <dt>uuid</dt><dd><code>{ev.uuid}</code></dd>
        {ev.parentUuid ? (<><dt>parent</dt><dd><code>{ev.parentUuid}</code></dd></>) : null}
        {ev.requestId ? (<><dt>requestId</dt><dd><code>{ev.requestId}</code></dd></>) : null}
        <KindFields ev={ev} />
      </dl>
      <Body ev={ev} />
    </div>
  );
}
