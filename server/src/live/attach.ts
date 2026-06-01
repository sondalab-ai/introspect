import { WebSocketServer, type WebSocket } from "ws";
import type { FastifyInstance } from "fastify";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { createWatcher, type LiveWatcher, type LiveFrame } from "./watcher.js";
import { resolveSources, type ResolveOptions } from "../sources/index.js";

export interface LiveHandle {
  watcher: LiveWatcher;
  wss: WebSocketServer;
  /** Stop the watcher and close all WS clients. Safe to call multiple times. */
  stop(): Promise<void>;
}

export interface LiveOptions extends ResolveOptions {
  /** Heartbeat interval in ms. 0 disables heartbeats. Default 25_000. */
  heartbeatMs?: number;
}

export const WS_PATH = "/ws/live";

/**
 * Wire a chokidar watcher and a WebSocket endpoint at /ws/live to `app`.
 * Returns a handle; callers must `await handle.watcher.start()` before/after listen.
 */
export function attachLive(app: FastifyInstance, opts: LiveOptions = {}): LiveHandle {
  const roots = resolveSources(opts);
  const watcher = createWatcher(roots);
  const wss = new WebSocketServer({ noServer: true });
  const clients = new Set<WebSocket>();
  const alive = new WeakSet<WebSocket>();

  watcher.onFrame((frame: LiveFrame) => {
    const payload = JSON.stringify(frame);
    for (const ws of clients) {
      if (ws.readyState === ws.OPEN) ws.send(payload);
    }
  });

  app.server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (req.url !== WS_PATH) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      clients.add(ws);
      alive.add(ws);
      ws.on("pong", () => alive.add(ws));
      ws.on("close", () => clients.delete(ws));
      ws.send(JSON.stringify({ type: "hello", clients: clients.size }));
    });
  });

  const heartbeatMs = opts.heartbeatMs ?? 25_000;
  let heartbeat: NodeJS.Timeout | null = null;
  if (heartbeatMs > 0) {
    heartbeat = setInterval(() => {
      for (const ws of clients) {
        if (!alive.has(ws)) {
          // missed the previous round-trip — drop the zombie
          ws.terminate();
          clients.delete(ws);
          continue;
        }
        alive.delete(ws);
        try { ws.ping(); } catch { /* terminate on next tick */ }
      }
    }, heartbeatMs);
    heartbeat.unref?.();
  }

  let stopped = false;
  return {
    watcher,
    wss,
    async stop() {
      if (stopped) return;
      stopped = true;
      if (heartbeat) clearInterval(heartbeat);
      for (const ws of clients) ws.close();
      clients.clear();
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      await watcher.stop();
    },
  };
}
