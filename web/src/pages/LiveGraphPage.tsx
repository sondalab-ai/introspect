import { useMemo, useState } from "react";
import { ExecutionWaterfall } from "../components/ExecutionWaterfall.js";
import { useLiveEvents } from "../useLiveEvents.js";
import { useEndpoint } from "../useEndpoint.js";
import { ENDPOINTS, type LiveFrame, type SessionEvent, type SessionListItem, type Transcript } from "../api.js";
import { prettyProjectName } from "../projectName.js";
import { sessionTitle, relativeTime, sessionDuration, projectBasename } from "../sessionLabel.js";

interface Target {
  slug: string;
  sessionId: string;
}

interface Option extends Target {
  label: string;
  lastTs?: string;
  live: boolean;
}

function pickActiveLive(frames: LiveFrame[]): Target | null {
  for (let i = frames.length - 1; i >= 0; i--) {
    const f = frames[i]!;
    if (f.type === "session-start" || f.type === "event") return { slug: f.slug, sessionId: f.sessionId };
  }
  return null;
}

/** Fetch and render an existing session's full transcript: human header + waterfall. */
function PinnedSession({ slug, sessionId, live }: Target & { live: boolean }) {
  const state = useEndpoint<Transcript>(ENDPOINTS.session(slug, sessionId));
  if (state.status === "loading") return <div className="loading">Caricamento…</div>;
  if (state.status === "error") return <div className="error">Errore: {state.error}</div>;
  const m = state.data.meta;
  const ctx = [
    relativeTime(m.lastTs),
    sessionDuration(m.firstTs, m.lastTs),
    projectBasename(m.cwd) || prettyProjectName(m.cwd, slug),
    `${m.messageCounts.user + m.messageCounts.assistant} msg`,
    live ? "live (snapshot)" : "",
  ].filter(Boolean).join(" · ");
  return (
    <>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 15, color: "var(--txt)" }} title={`${sessionId} · ${m.cwd ?? slug}`}>
          {sessionTitle(m)}
        </div>
        <div className="meta">{ctx}</div>
      </div>
      {state.data.events.length === 0
        ? <div className="loading">Sessione senza eventi.</div>
        : <ExecutionWaterfall events={state.data.events} />}
    </>
  );
}

export function LiveGraphPage() {
  const { frames, status } = useLiveEvents();
  const [pinned, setPinned] = useState<Target | null>(null);
  const allSessions = useEndpoint<SessionListItem[]>(ENDPOINTS.sessionsAll);

  // Sessions currently streaming over the websocket (may not be in the cached list yet).
  const liveKeys = useMemo(() => {
    const set = new Set<string>();
    for (const f of frames) if (f.type !== "hello") set.add(`${f.slug}::${f.sessionId}`);
    return set;
  }, [frames]);

  // Dropdown = every known session (history) ∪ live sessions, newest first.
  const options = useMemo(() => {
    const map = new Map<string, Option>();
    if (allSessions.status === "ready") {
      for (const s of allSessions.data) {
        const key = `${s.slug}::${s.sessionId}`;
        const ctx = [relativeTime(s.lastTs), sessionDuration(s.firstTs, s.lastTs), projectBasename(s.cwd)].filter(Boolean).join(" · ");
        map.set(key, {
          slug: s.slug, sessionId: s.sessionId, lastTs: s.lastTs, live: liveKeys.has(key),
          label: `${sessionTitle(s).slice(0, 56)}${ctx ? ` — ${ctx}` : ""}`,
        });
      }
    }
    for (const key of liveKeys) {
      if (map.has(key)) continue;
      const [slug, sessionId] = key.split("::");
      if (slug && sessionId) {
        map.set(key, { slug, sessionId, live: true, label: `${prettyProjectName(undefined, slug).slice(0, 40)} / ${sessionId.slice(0, 8)}` });
      }
    }
    return [...map.values()].sort((a, b) => (b.lastTs ?? "").localeCompare(a.lastTs ?? ""));
  }, [allSessions, liveKeys]);

  const activeLive = pickActiveLive(frames);
  const autoEvents = useMemo(() => {
    if (pinned || !activeLive) return [];
    const evs: SessionEvent[] = [];
    for (const f of frames) {
      if (f.type === "event" && f.slug === activeLive.slug && f.sessionId === activeLive.sessionId) evs.push(f.event);
    }
    return evs;
  }, [frames, pinned, activeLive]);

  const liveOption = activeLive
    ? options.find((o) => o.slug === activeLive.slug && o.sessionId === activeLive.sessionId)
    : undefined;

  return (
    <div className="canvas-body" style={{ overflow: "auto", padding: "0 4px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Live graph</h2>
        <span className={`lr-status lr-status-${status}`}>
          <span className="lr-dot" />
          {status === "open" ? "live" : status === "connecting" ? "connecting…" : "offline"}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <span className="meta" style={{ flex: "0 0 auto" }}>session</span>
        <select
          className="lr-filter"
          value={pinned ? `${pinned.slug}::${pinned.sessionId}` : ""}
          onChange={(e) => {
            const v = e.target.value;
            if (!v) { setPinned(null); return; }
            const [slug, sessionId] = v.split("::");
            if (slug && sessionId) setPinned({ slug, sessionId });
          }}
          style={{ maxWidth: 540 }}
        >
          <option value="">auto (ultima attiva)</option>
          {options.map((s) => (
            <option key={`${s.slug}::${s.sessionId}`} value={`${s.slug}::${s.sessionId}`}>
              {s.label}{s.live ? " · live" : ""}
            </option>
          ))}
        </select>
        {pinned ? (
          <button className="tool-chip" style={{ cursor: "pointer" }} onClick={() => setPinned(null)}>
            unpin
          </button>
        ) : null}
      </div>
      {!pinned && activeLive ? (
        <div className="meta" style={{ marginBottom: 12 }} title={activeLive.sessionId}>
          {liveOption?.label ?? `${prettyProjectName(undefined, activeLive.slug)} / ${activeLive.sessionId.slice(0, 8)}`} · live
        </div>
      ) : null}
      {pinned ? (
        <PinnedSession slug={pinned.slug} sessionId={pinned.sessionId} live={liveKeys.has(`${pinned.slug}::${pinned.sessionId}`)} />
      ) : autoEvents.length === 0 ? (
        <div className="loading">
          {status === "open"
            ? "in attesa di eventi live… (oppure scegli una sessione esistente)"
            : "WebSocket non connesso — scegli una sessione esistente dal menu."}
        </div>
      ) : (
        <ExecutionWaterfall events={autoEvents} />
      )}
    </div>
  );
}
