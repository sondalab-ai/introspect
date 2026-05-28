import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildServer } from "./server.js";

describe("buildServer", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "introspect-api-"));
    mkdirSync(join(dir, "agents"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("GET /health returns ok", async () => {
    const app = buildServer({ env: { CLAUDE_CONFIG_DIR: dir } });
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
    await app.close();
  });

  it("GET /sources returns resolved roots and their sources", async () => {
    const app = buildServer({ env: { CLAUDE_CONFIG_DIR: dir } });
    const res = await app.inject({ method: "GET", url: "/sources" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as Array<{ sources: Array<{ id: string; status: string }> }>;
    expect(body).toHaveLength(1);
    const agents = body[0]!.sources.find((s) => s.id === "agents")!;
    expect(agents.status).toBe("present");
    await app.close();
  });

  it("GET /sources returns [] when no config roots resolve", async () => {
    const app = buildServer({ env: { CLAUDE_CONFIG_DIR: "/definitely/does/not/exist" }, homeDir: "/also/missing" });
    const res = await app.inject({ method: "GET", url: "/sources" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
    await app.close();
  });

  it("exposes all Slice-1 endpoints with status 200", async () => {
    // dir already has an `agents/` subdir created in beforeEach.
    const app = buildServer({ env: { CLAUDE_CONFIG_DIR: dir } });
    for (const path of [
      "/instructions",
      "/agents",
      "/commands",
      "/skills",
      "/memories",
      "/plugins",
      "/settings",
    ]) {
      const res = await app.inject({ method: "GET", url: path });
      expect(res.statusCode, `expected 200 from ${path}`).toBe(200);
      expect(Array.isArray(res.json())).toBe(true);
    }
    await app.close();
  });

  it("GET /projects returns aggregated projects", async () => {
    const slug = "-test-proj";
    const projDir = `${dir}/projects/${slug}`;
    const { mkdirSync, writeFileSync } = await import("node:fs");
    mkdirSync(projDir, { recursive: true });
    writeFileSync(`${projDir}/abc.jsonl`, "{}\n");
    const app = buildServer({ env: { CLAUDE_CONFIG_DIR: dir } });
    const res = await app.inject({ method: "GET", url: "/projects" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as Array<{ slug: string }>;
    expect(body.some((p) => p.slug === slug)).toBe(true);
    await app.close();
  });

  it("GET /projects/:slug/sessions returns session metadata", async () => {
    const slug = "-test-proj-2";
    const projDir = `${dir}/projects/${slug}`;
    const { mkdirSync, writeFileSync } = await import("node:fs");
    mkdirSync(projDir, { recursive: true });
    writeFileSync(
      `${projDir}/sess1.jsonl`,
      JSON.stringify({ type: "assistant", uuid: "u", isSidechain: false, timestamp: "2026-05-28T00:00:00Z",
        message: { model: "opus-4-7", content: [] } }) + "\n",
    );
    const app = buildServer({ env: { CLAUDE_CONFIG_DIR: dir } });
    const res = await app.inject({ method: "GET", url: `/projects/${encodeURIComponent(slug)}/sessions` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as Array<{ sessionId: string }>;
    expect(body.map((s) => s.sessionId)).toContain("sess1");
    await app.close();
  });

  it("GET /sessions/:slug/:id returns events + meta", async () => {
    const slug = "-test-proj-3";
    const projDir = `${dir}/projects/${slug}`;
    const { mkdirSync, writeFileSync } = await import("node:fs");
    mkdirSync(projDir, { recursive: true });
    writeFileSync(
      `${projDir}/sX.jsonl`,
      JSON.stringify({ type: "assistant", uuid: "u", isSidechain: false, timestamp: "2026-05-28T00:00:00Z",
        message: { model: "opus-4-7", content: [{ type: "text", text: "hi" }] } }) + "\n",
    );
    const app = buildServer({ env: { CLAUDE_CONFIG_DIR: dir } });
    const res = await app.inject({ method: "GET", url: `/sessions/${encodeURIComponent(slug)}/sX` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { meta: { sessionId: string }; events: unknown[] };
    expect(body.meta.sessionId).toBe("sX");
    expect(body.events.length).toBeGreaterThan(0);
    await app.close();
  });

  it("GET /sessions/:slug/:id returns 404 for unknown session", async () => {
    const app = buildServer({ env: { CLAUDE_CONFIG_DIR: dir } });
    const res = await app.inject({ method: "GET", url: "/sessions/-nope/x" });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
