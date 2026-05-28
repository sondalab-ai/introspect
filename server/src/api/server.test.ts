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
});
