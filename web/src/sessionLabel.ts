import type { SessionListItem, SessionMeta } from "./api.js";

/** Last path segment of a real cwd, e.g. /Users/x/src/camunda-hub → camunda-hub. */
export function projectBasename(cwd?: string): string {
  if (!cwd) return "";
  const parts = cwd.replace(/\/+$/, "").split("/");
  return parts[parts.length - 1] ?? "";
}

/** Human title for a session: Claude summary / first prompt, else a short id. */
export function sessionTitle(meta: Pick<SessionMeta, "title" | "sessionId">): string {
  return meta.title?.trim() || `sessione ${meta.sessionId.slice(0, 8)}`;
}

/** Italian relative time: "ora", "5 min fa", "3 h fa", "ieri", "4 g fa", or a date. */
export function relativeTime(iso?: string): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const diff = Date.now() - t;
  const min = Math.round(diff / 60_000);
  if (min < 1) return "ora";
  if (min < 60) return `${min} min fa`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h fa`;
  const d = Math.round(h / 24);
  if (d === 1) return "ieri";
  if (d < 7) return `${d} g fa`;
  return new Date(t).toLocaleDateString();
}

/** Human duration between first and last activity, e.g. "12 min", "1 h 4 min". */
export function sessionDuration(firstTs?: string, lastTs?: string): string {
  if (!firstTs || !lastTs) return "";
  const a = Date.parse(firstTs);
  const b = Date.parse(lastTs);
  if (Number.isNaN(a) || Number.isNaN(b) || b <= a) return "";
  const sec = Math.round((b - a) / 1000);
  if (sec < 60) return `${sec} s`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Context line: "relative date · duration · project · N msg". */
export function sessionContext(item: SessionListItem): string {
  const parts = [
    relativeTime(item.lastTs),
    sessionDuration(item.firstTs, item.lastTs),
    projectBasename(item.cwd),
    `${item.messageCounts.user + item.messageCounts.assistant} msg`,
  ].filter(Boolean);
  return parts.join(" · ");
}
