import { useMemo, useRef, useState } from "react";
import { Markdown } from "./Markdown.js";
import { JsonView } from "./JsonView.js";
import { useLiveEvents, type LiveStatus } from "../useLiveEvents.js";
import type { LiveFrame, LiveEvent, SessionEvent } from "../api.js";
import { prettyProjectName } from "../projectName.js";

const STATUS_LABEL: Record<LiveStatus, string> = {
  connecting: "connecting…",
  open: "live",
  closed: "offline",
};

const ALL = "__all__";
const HIDDEN_KINDS_KEY = "rail-hidden-kinds";

type ToolStatus = "running" | "ok" | "err";
type EventKind = SessionEvent["kind"];

function loadHidden(): Set<EventKind> {
  try {
    const raw = localStorage.getItem(HIDDEN_KINDS_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((s): s is EventKind => typeof s === "string") as EventKind[]);
  } catch { return new Set(); }
}

function saveHidden(s: Set<EventKind>): void {
  try { localStorage.setItem(HIDDEN_KINDS_KEY, JSON.stringify([...s])); } catch { /* skip */ }
}

function frameKey(f: LiveFrame, fallbackIdx: number): string {
  if (f.type === "hello") return `hello-${fallbackIdx}`;
  if (f.type === "session-start") return `start-${f.slug}-${f.sessionId}`;
  // Several events of one message share a uuid (text + tool_use, ...), so the
  // row index keeps the React key unique.
  return `${f.event.uuid || "ev"}#${fallbackIdx}`;
}

function eventLabel(f: LiveEvent): string {
  switch (f.event.kind) {
    case "tool_use": return f.event.name;
    case "subagent_spawn": return f.event.subagentType;
    case "skill_use": return f.event.skill;
    case "tool_result": return f.event.ok ? "ok" : "err";
    case "text": return f.event.text.slice(0, 60);
    case "thinking": return f.event.text.slice(0, 60);
    case "user": return f.event.text.slice(0, 60);
    case "meta": return f.event.key;
  }
}

function timeLabel(iso: string): string {
  if (!iso) return "";
  return new Date(iso).toISOString().slice(11, 19);
}

function shortSlug(s: string, n = 32): string {
  const pretty = prettyProjectName(undefined, s);
  if (pretty.length <= n) return pretty;
  return pretty.slice(0, n) + "…";
}

type BodyMode = "md" | "pre" | "json";
interface ExpandedBody { mode: BodyMode; value: string; data?: unknown }

function expandedBody(ev: SessionEvent): ExpandedBody | null {
  switch (ev.kind) {
    case "thinking":
    case "text":
    case "user":
      return ev.text ? { mode: "md", value: ev.text } : null;
    case "subagent_spawn":
      return ev.description ? { mode: "md", value: ev.description } : null;
    case "tool_use":
      return { mode: "json", value: "", data: ev.input };
    case "tool_result":
      return ev.preview ? { mode: "pre", value: ev.preview } : null;
    case "skill_use":
      return { mode: "pre", value: ev.skill };
    case "meta":
      if (typeof ev.value === "string") return { mode: "pre", value: ev.value };
      return { mode: "json", value: "", data: ev.value };
  }
}

interface FrameRowProps {
  frame: LiveFrame;
  isExpanded: boolean;
  onToggle: () => void;
  showSlug: boolean;
  toolStatus: Map<string, ToolStatus>;
}

function FrameRow({ frame, isExpanded, onToggle, showSlug, toolStatus }: FrameRowProps) {
  if (frame.type === "hello") {
    return <div className="lr-row lr-row-meta">Connected · {frame.clients} client(s)</div>;
  }
  if (frame.type === "session-start") {
    return (
      <div className="lr-row lr-row-start">
        <span className="lr-kind">start</span>
        <span className="lr-slug" title={frame.slug}>{shortSlug(frame.slug, 24)}</span>
        <span className="lr-sid" title={frame.sessionId}>{frame.sessionId.slice(0, 8)}</span>
      </div>
    );
  }
  const ev = frame.event;
  const isRunningToolUse = ev.kind === "tool_use" && toolStatus.get(ev.toolUseId) === "running";
  const body = isExpanded ? expandedBody(ev) : null;
  return (
    <div
      className={`lr-row lr-row-clickable${isExpanded ? " expanded" : ""}`}
      onClick={onToggle}
    >
      <div className="lr-row-head">
        <span className={`lr-kind k-${ev.kind}`}>{ev.kind}</span>
        <span className="lr-time">{timeLabel(ev.ts)}</span>
        <span className="lr-label" title={eventLabel(frame)}>{eventLabel(frame)}</span>
        {isRunningToolUse ? <span className="lr-running" title="In esecuzione">●</span> : null}
      </div>
      {showSlug ? (
        <div className="lr-row-meta-line" title={`${frame.slug} / ${frame.sessionId}`}>
          {shortSlug(frame.slug, 28)}
        </div>
      ) : null}
      {body ? (
        body.mode === "md" ? (
          <div
            className="lr-expand lr-expand-md"
            onClick={(e) => e.stopPropagation()}
          >
            <Markdown>{body.value}</Markdown>
          </div>
        ) : body.mode === "json" ? (
          <div onClick={(e) => e.stopPropagation()}>
            <JsonView value={body.data} className="lr-expand lr-expand-json" />
          </div>
        ) : (
          <pre
            className="lr-expand"
            onClick={(e) => e.stopPropagation()}
          >{body.value}</pre>
        )
      ) : null}
    </div>
  );
}

function frameSlug(f: LiveFrame): string | null {
  if (f.type === "hello") return null;
  return f.slug;
}

/** Map each `toolUseId` to its current status by scanning frames in order. */
function buildToolStatus(frames: LiveFrame[]): Map<string, ToolStatus> {
  const m = new Map<string, ToolStatus>();
  for (const f of frames) {
    if (f.type !== "event") continue;
    const ev = f.event;
    if (ev.kind === "tool_use") {
      if (!m.has(ev.toolUseId)) m.set(ev.toolUseId, "running");
    } else if (ev.kind === "tool_result") {
      m.set(ev.toolUseId, ev.ok ? "ok" : "err");
    }
  }
  return m;
}

export function LiveRail() {
  const { frames, status } = useLiveEvents();
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState<string>(ALL);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [hiddenKinds, setHiddenKinds] = useState<Set<EventKind>>(() => loadHidden());
  const snapshotRef = useRef<LiveFrame[] | null>(null);

  if (paused && snapshotRef.current === null) snapshotRef.current = frames.slice();
  if (!paused && snapshotRef.current !== null) snapshotRef.current = null;

  const source = paused ? (snapshotRef.current ?? frames) : frames;

  const slugs = useMemo(() => {
    const s = new Set<string>();
    for (const f of source) {
      const sg = frameSlug(f);
      if (sg) s.add(sg);
    }
    return [...s].sort();
  }, [source]);

  const slugFiltered = filter === ALL
    ? source
    : source.filter((f) => frameSlug(f) === filter);

  // toolStatus computed over slug-filtered (not kind-filtered) so running counts stay accurate
  const toolStatus = useMemo(() => buildToolStatus(slugFiltered), [slugFiltered]);

  const seenKinds = useMemo(() => {
    const s = new Set<EventKind>();
    for (const f of slugFiltered) if (f.type === "event") s.add(f.event.kind);
    return [...s].sort();
  }, [slugFiltered]);

  const kindFiltered = slugFiltered.filter((f) =>
    f.type !== "event" || !hiddenKinds.has(f.event.kind),
  );

  const showSlug = filter === ALL && slugs.length > 1;
  // `hello` frames are connection acks, not events — drop them from the feed
  // (each reconnect emits one, so they'd pile up as "Connected · N" rows).
  const recent = kindFiltered.filter((f) => f.type !== "hello").slice(-50).reverse();

  function toggleKind(k: EventKind): void {
    setHiddenKinds((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      saveHidden(next);
      return next;
    });
  }

  function toggle(uuid: string): void {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(uuid)) next.delete(uuid);
      else next.add(uuid);
      return next;
    });
  }

  const runningCount = [...toolStatus.values()].filter((s) => s === "running").length;
  let clients = 0;
  for (let i = frames.length - 1; i >= 0; i--) {
    const f = frames[i]!;
    if (f.type === "hello") { clients = f.clients; break; }
  }

  return (
    <>
      <div className="lr-head">
        <h4>EVENT STREAM</h4>
        <span className={`lr-status lr-status-${status}`}>
          <span className="lr-dot" /> {STATUS_LABEL[status]}
          {status === "open" && clients > 0 ? ` · ${clients}` : ""}
        </span>
      </div>
      <div className="lr-controls">
        <select
          className="lr-filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          title="Filter by project slug"
        >
          <option value={ALL}>tutti i progetti</option>
          {slugs.map((s) => (
            <option key={s} value={s}>{shortSlug(s, 28)}</option>
          ))}
        </select>
        <button
          className={`lr-pause${paused ? " on" : ""}`}
          onClick={() => setPaused((p) => !p)}
          title={paused ? "Resume" : "Pause"}
        >
          {paused ? "▶" : "❚❚"}
        </button>
      </div>
      {runningCount > 0 ? (
        <div className="lr-runbar" title="Tool calls senza tool_result">
          <span className="lr-running">●</span> {runningCount} in corso
        </div>
      ) : null}
      {seenKinds.length > 0 ? (
        <div className="lr-kinds">
          {seenKinds.map((k) => {
            const off = hiddenKinds.has(k);
            return (
              <button
                key={k}
                className={`lr-kind-toggle k-${k}${off ? " off" : ""}`}
                onClick={() => toggleKind(k)}
                title={off ? `Mostra ${k}` : `Nascondi ${k}`}
              >{k}</button>
            );
          })}
        </div>
      ) : null}
      <div className="lr-list">
        {recent.length === 0 ? (
          <div className="lr-empty">
            {status === "open"
              ? (filter === ALL ? "in attesa di eventi…" : "nessun evento per questo filtro")
              : "—"}
          </div>
        ) : (
          recent.map((f, i) => {
            const key = frameKey(f, kindFiltered.length - i);
            const uuid = f.type === "event" ? f.event.uuid : "";
            return (
              <FrameRow
                key={key}
                frame={f}
                isExpanded={!!uuid && expanded.has(uuid)}
                onToggle={() => uuid && toggle(uuid)}
                showSlug={showSlug}
                toolStatus={toolStatus}
              />
            );
          })
        )}
      </div>
    </>
  );
}
