import { Markdown } from "./Markdown.js";
import { JsonView } from "./JsonView.js";
import type { SessionEvent } from "../api.js";

/** Per-kind colour as a CSS var (defined per theme in theme.css). Usable in
 *  `style` only — SVG presentation attributes don't resolve var(). */
export const KIND_COLOR: Record<SessionEvent["kind"], string> = {
  thinking: "var(--k-thinking)",
  text: "var(--k-text)",
  user: "var(--k-user)",
  tool_use: "var(--k-tool_use)",
  tool_result: "var(--k-tool_result)",
  subagent_spawn: "var(--k-subagent_spawn)",
  skill_use: "var(--k-skill_use)",
  meta: "var(--k-meta)",
};

/** Sentence-case name of each kind, for controls (design-language L1: a
 *  control's label is written in sentence case at the source; the kit no
 *  longer upper-cases it). Rows and legends keep the kind identifier. */
export const KIND_LABEL: Record<SessionEvent["kind"], string> = {
  thinking: "Thinking",
  text: "Text",
  user: "User",
  tool_use: "Tool use",
  tool_result: "Tool result",
  subagent_spawn: "Subagent spawn",
  skill_use: "Skill use",
  meta: "Meta",
};

/** Failed tool_result colour (kit status-danger per theme). */
export const ERROR_COLOR = "var(--k-error)";

/** Palette key for an event: its kind, or "error" for a failed tool_result.
 *  Every surface colours through this (`--k-<key>` / `.k-<key>`), so a failed
 *  result reads as error in the graph, waterfall, detail, stream and rail. */
export function kindKey(ev: SessionEvent): SessionEvent["kind"] | "error" {
  return ev.kind === "tool_result" && !ev.ok ? "error" : ev.kind;
}

/** CSS colour for an event, per kindKey. Usable in `style` only. */
export function eventColor(ev: SessionEvent): string {
  const k = kindKey(ev);
  return k === "error" ? ERROR_COLOR : KIND_COLOR[k];
}

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
        <span className="exec-detail-kind" style={{ background: eventColor(ev), color: "var(--k-on)" }}>
          {ev.kind}
        </span>
        <span className="exec-detail-label">{eventLabel(ev)}</span>
        {ev.isSidechain ? <span className="exec-detail-tag">sidechain</span> : null}
      </div>
      <dl className="sl-kv exec-detail-kv">
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
