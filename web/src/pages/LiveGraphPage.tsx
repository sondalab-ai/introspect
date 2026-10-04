import { useMemo, useState } from "react";
import { ExecutionWaterfall } from "../components/ExecutionWaterfall.js";
import { useLiveEvents } from "../useLiveEvents.js";
import { useEndpoint } from "../useEndpoint.js";
import { ENDPOINTS, type LiveFrame, type SessionListItem, type Transcript } from "../api.js";
import { prettyProjectName } from "../projectName.js";
import { sessionTitle, relativeTime, sessionDuration, projectBasename, fmtNum } from "../sessionLabel.js";

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

/**
 * Fetches full transcript from API and merges in any WS events not yet
 * persisted (deduped by uuid). This means the view is always complete even
 * when the WS connected after the session started.
 */
function LiveSession({ slug, sessionId, isLive, liveFrames }: Target & { isLive: boolean; liveFrames: LiveFrame[] }) {
  const state = useEndpoint<Transcript>(ENDPOINTS.session(slug, sessionId));

  const liveEvents = useMemo(() => {
    return liveFrames
      .filter((f): f is Extract<LiveFrame, { type: "event" }> =>
        f.type === "event" && f.slug === slug && f.sessionId === sessionId)
      .map((f) => f.event);
  }, [liveFrames, slug, sessionId]);

  const events = useMemo(() => {
    const base = state.status === "ready" ? state.data.events : [];
    if (liveEvents.length === 0) return base;
    const seen = new Set(base.map((e) => e.uuid));
    const fresh = liveEvents.filter((e) => !seen.has(e.uuid));
    return fresh.length === 0 ? base : [...base, ...fresh];
  }, [state, liveEvents]);

  if (state.status === "loading" && events.length === 0) return <div className="loading">Caricamento…</div>;
  if (state.status === "error") return <div className="error">Errore: {state.error}</div>;

  const m = state.status === "ready" ? state.data.meta : null;
  const ctx = m
    ? [
        relativeTime(m.lastTs),
        sessionDuration(m.firstTs, m.lastTs),
        projectBasename(m.cwd) || prettyProjectName(m.cwd, slug),
        `${fmtNum(m.messageCounts.user + m.messageCounts.assistant)} msg`,
        isLive ? "live" : "snapshot",
      ]
        .filter(Boolean)
        .join(" · ")
    : null;

  return (
    <>
      {m && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 15, color: "var(--txt)" }} title={`${sessionId} · ${m.cwd ?? slug}`}>
            {sessionTitle(m)}
          </div>
          {ctx && <div className="meta">{ctx}</div>}
        </div>
      )}
      {events.length === 0
        ? <div className="loading">Sessione senza eventi.</div>
        : <ExecutionWaterfall events={events} />}
    </>
  );
}

/** Static pinned session — no live merge. */
function PinnedSession({ slug, sessionId, live }: Target & { live: boolean }) {
  const state = useEndpoint<Transcript>(ENDPOINTS.session(slug, sessionId));
  if (state.status === "loading") return <div className="loading">Caricamento…</div>;
  if (state.status === "error") return <div className="error">Errore: {state.error}</div>;
  const m = state.data.meta;
  const ctx = [
    relativeTime(m.lastTs),
    sessionDuration(m.firstTs, m.lastTs),
    projectBasename(m.cwd) || prettyProjectName(m.cwd, slug),
    `${fmtNum(m.messageCounts.user + m.messageCounts.assistant)} msg`,
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

  const liveKeys = useMemo(() => {
    const set = new Set<string>();
    for (const f of frames) if (f.type !== "hello") set.add(`${f.slug}::${f.sessionId}`);
    return set;
  }, [frames]);

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

  // In auto mode: prefer the session receiving WS events; fall back to the most
  // recently active session from history so the view is never blank on load.
  const effectiveTarget = useMemo<Target | null>(() => {
    if (activeLive) return activeLive;
    const first = options[0];
    if (first) return { slug: first.slug, sessionId: first.sessionId };
    return null;
  }, [activeLive, options]);

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
        <span className="meta" style={{ flex: "0 0 auto" }}>Session</span>
        <span className="sl-field__control sl-select lr-filter" style={{ maxWidth: 540 }}>
          <select
            className="sl-field__input"
            aria-label="Session"
            value={pinned ? `${pinned.slug}::${pinned.sessionId}` : ""}
            onChange={(e) => {
              const v = e.target.value;
              if (!v) { setPinned(null); return; }
              const [slug, sessionId] = v.split("::");
              if (slug && sessionId) setPinned({ slug, sessionId });
            }}
          >
            <option value="">Auto (ultima attiva)</option>
            {options.map((s) => (
              <option key={`${s.slug}::${s.sessionId}`} value={`${s.slug}::${s.sessionId}`}>
                {s.label}{s.live ? " · live" : ""}
              </option>
            ))}
          </select>
        </span>
        {pinned ? (
          <button type="button" className="sl-btn sl-btn--ghost sl-btn--sm" onClick={() => setPinned(null)}>
            Unpin
          </button>
        ) : null}
      </div>
      {pinned ? (
        <PinnedSession
          slug={pinned.slug}
          sessionId={pinned.sessionId}
          live={liveKeys.has(`${pinned.slug}::${pinned.sessionId}`)}
        />
      ) : effectiveTarget ? (
        <LiveSession
          slug={effectiveTarget.slug}
          sessionId={effectiveTarget.sessionId}
          isLive={!!activeLive}
          liveFrames={frames}
        />
      ) : (
        <div className="loading">
          {status === "open"
            ? "in attesa di eventi live… (oppure scegli una sessione esistente)"
            : "WebSocket non connesso — scegli una sessione esistente dal menu."}
        </div>
      )}
    </div>
  );
}
