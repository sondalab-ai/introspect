import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AddressInfo } from "node:net";
import WebSocket from "ws";
import { attachLive, WS_PATH, type LiveHandle } from "../attach.js";

function jsonl(uuid: string, text: string): string {
  return JSON.stringify({
    type: "assistant", uuid, isSidechain: false, timestamp: "2026-05-29T00:00:00Z",
    message: { model: "opus-4-7", content: [{ type: "text", text }] },
  }) + "\n";
}

interface Collector {
  msgs: string[];
  waitFor(predicate: (msg: string) => boolean, timeoutMs?: number): Promise<string>;
}

function collect(ws: WebSocket): Collector {
  const msgs: string[] = [];
  const waiters: { predicate: (m: string) => boolean; resolve: (m: string) => void }[] = [];
  ws.on("message", (data) => {
    const s = data.toString();
    msgs.push(s);
    for (let i = waiters.length - 1; i >= 0; i--) {
      if (waiters[i]!.predicate(s)) {
        waiters[i]!.resolve(s);
        waiters.splice(i, 1);
      }
    }
  });
  return {
    msgs,
    waitFor(predicate, timeoutMs = 4000) {
      const existing = msgs.find(predicate);
      if (existing) return Promise.resolve(existing);
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error("waitFor timeout")), timeoutMs);
        waiters.push({
          predicate,
          resolve: (m) => { clearTimeout(t); resolve(m); },
        });
      });
    },
  };
}

describe("attachLive", () => {
  let dir: string;
  let app: FastifyInstance;
  let handle: LiveHandle;
  let port: number;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "live-"));
    mkdirSync(join(dir, "projects", "-foo"), { recursive: true });
    app = Fastify({ logger: false });
    handle = attachLive(app, { env: { CLAUDE_CONFIG_DIR: dir } });
    await app.listen({ port: 0, host: "127.0.0.1" });
    port = (app.server.address() as AddressInfo).port;
    await handle.watcher.start();
  });

  afterEach(async () => {
    await handle.stop();
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("rejects upgrades on unknown paths", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/nope`);
    await new Promise<void>((resolve) => {
      ws.once("error", () => resolve());
      ws.once("close", () => resolve());
    });
    expect(ws.readyState).not.toBe(WebSocket.OPEN);
  });

  it("delivers a hello frame on connect and live events on writes", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}${WS_PATH}`);
    const c = collect(ws);
    await new Promise<void>((resolve, reject) => {
      ws.once("open", () => resolve());
      ws.once("error", reject);
    });
    const hello = JSON.parse(await c.waitFor((m) => m.includes('"hello"')));
    expect(hello.type).toBe("hello");
    writeFileSync(join(dir, "projects", "-foo", "abc.jsonl"), jsonl("u1", "hi"));
    const start = JSON.parse(await c.waitFor((m) => m.includes('"session-start"')));
    expect(start.type).toBe("session-start");
    expect(start.slug).toBe("-foo");
    const event = JSON.parse(await c.waitFor((m) =>
      m.includes('"event"') && m.includes('"u1"'),
    ));
    expect(event.type).toBe("event");
    expect(event.event.uuid).toBe("u1");
    ws.close();
  });
});

describe("attachLive heartbeat", () => {
  let dir: string;
  let app: FastifyInstance;
  let handle: LiveHandle;
  let port: number;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "live-hb-"));
    mkdirSync(join(dir, "projects", "-foo"), { recursive: true });
    app = Fastify({ logger: false });
    handle = attachLive(app, { env: { CLAUDE_CONFIG_DIR: dir }, heartbeatMs: 60 });
    await app.listen({ port: 0, host: "127.0.0.1" });
    port = (app.server.address() as AddressInfo).port;
    await handle.watcher.start();
  });
  afterEach(async () => {
    await handle.stop();
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("delivers pings to a live client (default ws lib auto-pongs)", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}${WS_PATH}`);
    await new Promise<void>((resolve, reject) => {
      ws.once("open", () => resolve());
      ws.once("error", reject);
    });
    const pinged = await new Promise<boolean>((resolve) => {
      const t = setTimeout(() => resolve(false), 500);
      ws.once("ping", () => { clearTimeout(t); resolve(true); });
    });
    expect(pinged).toBe(true);
    ws.close();
  });
});
