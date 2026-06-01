import type { LiveFrame } from "./api.js";

export type LiveStatus = "connecting" | "open" | "closed";

const MAX = 1000;
const RETRY_MS = [500, 1000, 2000, 4000, 8000];

interface Snapshot {
  frames: LiveFrame[];
  status: LiveStatus;
}

let snapshot: Snapshot = { frames: [], status: "connecting" };
const listeners = new Set<() => void>();
let ws: WebSocket | null = null;
let retryAttempt = 0;
let started = false;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

function emit(): void {
  for (const cb of listeners) cb();
}

function setStatus(s: LiveStatus): void {
  if (snapshot.status === s) return;
  snapshot = { frames: snapshot.frames, status: s };
  emit();
}

function pushFrame(frame: LiveFrame): void {
  const arr = snapshot.frames.length >= MAX
    ? snapshot.frames.slice(snapshot.frames.length - MAX + 1)
    : snapshot.frames.slice();
  arr.push(frame);
  snapshot = { frames: arr, status: snapshot.status };
  emit();
}

function connect(): void {
  if (typeof window === "undefined") return;
  setStatus("connecting");
  const scheme = location.protocol === "https:" ? "wss" : "ws";
  const url = `${scheme}://${location.host}/ws/live`;
  ws = new WebSocket(url);
  ws.onopen = () => {
    setStatus("open");
    retryAttempt = 0;
  };
  ws.onmessage = (e) => {
    try {
      const frame = JSON.parse(typeof e.data === "string" ? e.data : "") as LiveFrame;
      pushFrame(frame);
    } catch { /* ignore non-JSON */ }
  };
  ws.onclose = () => {
    setStatus("closed");
    const delay = RETRY_MS[Math.min(retryAttempt, RETRY_MS.length - 1)]!;
    retryAttempt += 1;
    retryTimer = setTimeout(connect, delay);
  };
  ws.onerror = () => {
    try { ws?.close(); } catch { /* skip */ }
  };
}

function start(): void {
  if (started) return;
  started = true;
  connect();
}

export const liveStore = {
  /** Subscribe to changes; returns the unsubscribe function. Starts the WS lazily. */
  subscribe(cb: () => void): () => void {
    start();
    listeners.add(cb);
    return () => { listeners.delete(cb); };
  },
  getSnapshot(): Snapshot {
    return snapshot;
  },
  /** Test/dev helper — not used in production code. */
  _reset(): void {
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
    try { ws?.close(); } catch { /* skip */ }
    ws = null;
    started = false;
    retryAttempt = 0;
    snapshot = { frames: [], status: "connecting" };
    listeners.clear();
  },
};
