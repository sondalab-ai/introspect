import { useEffect, useRef } from "react";
import { Markdown } from "./Markdown.js";
import type { SessionEvent } from "../api.js";

function truncate(s: string, n = 240): string {
  if (s.length <= n) return s;
  return s.slice(0, n) + "…";
}

function previewInput(input: unknown): string {
  if (input == null) return "";
  if (typeof input === "string") return truncate(input);
  try {
    return truncate(JSON.stringify(input));
  } catch {
    return "[unserializable]";
  }
}

function kindClass(kind: SessionEvent["kind"]): string {
  return `ev-kind k-${kind}`;
}

function EventRow({ ev, focused }: { ev: SessionEvent; focused: boolean }) {
  const time = ev.ts ? new Date(ev.ts).toISOString().slice(11, 19) : "";
  const sidechain = ev.isSidechain ? <span className="ev-side" title="sidechain">↳</span> : null;
  return (
    <li
      data-uuid={ev.uuid}
      className={`ev-row ev-${ev.kind}${ev.isSidechain ? " is-side" : ""}${focused ? " is-focus" : ""}`}
    >
      <div className="ev-head">
        <span className={kindClass(ev.kind)}>{ev.kind}</span>
        {time ? <span className="ev-time">{time}</span> : null}
        {sidechain}
      </div>
      <div className="ev-body">
        {renderBody(ev)}
      </div>
    </li>
  );
}

function renderBody(ev: SessionEvent) {
  switch (ev.kind) {
    case "thinking":
    case "text":
      return ev.text ? <Markdown>{ev.text}</Markdown> : <span className="ev-empty">(empty)</span>;
    case "user":
      return ev.text ? <Markdown>{ev.text}</Markdown> : <span className="ev-empty">(empty)</span>;
    case "tool_use":
      return (
        <>
          <span className="tool-chip">{ev.name}</span>
          <code className="ev-input">{previewInput(ev.input)}</code>
        </>
      );
    case "tool_result":
      return (
        <>
          <span className={`ev-status ${ev.ok ? "ok" : "err"}`}>{ev.ok ? "ok" : "error"}</span>
          {ev.preview ? <code className="ev-input">{truncate(ev.preview)}</code> : null}
        </>
      );
    case "subagent_spawn":
      return (
        <>
          <span className="tool-chip">{ev.subagentType}</span>
          <code className="ev-input">{truncate(ev.description)}</code>
        </>
      );
    case "skill_use":
      return <span className="tool-chip">{ev.skill}</span>;
    case "meta":
      return (
        <code className="ev-input">
          {ev.key}={truncate(typeof ev.value === "string" ? ev.value : JSON.stringify(ev.value ?? ""))}
        </code>
      );
  }
}

export interface EventStreamProps {
  events: SessionEvent[];
  /** When set, scroll the matching row into view and highlight it briefly. */
  focusUuid?: string | null;
}

export function EventStream({ events, focusUuid }: EventStreamProps) {
  const ulRef = useRef<HTMLUListElement | null>(null);

  useEffect(() => {
    if (!focusUuid || !ulRef.current) return;
    const row = ulRef.current.querySelector<HTMLLIElement>(`[data-uuid="${focusUuid}"]`);
    if (row) row.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusUuid]);

  if (events.length === 0) {
    return <div className="ld-empty">Nessun evento.</div>;
  }
  return (
    <ul className="evs" ref={ulRef}>
      {events.map((ev, i) => (
        // uuid isn't unique: one message yields several events (text + tool_use…),
        // so the index keeps the key stable and collision-free.
        <EventRow key={`${ev.uuid}#${i}`} ev={ev} focused={ev.uuid === focusUuid} />
      ))}
    </ul>
  );
}
