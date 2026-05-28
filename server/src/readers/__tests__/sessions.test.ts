import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readSessions, readSession } from "../sessions.js";
import type { ResolvedRoot } from "../../sources/types.js";

function rootOf(dir: string): ResolvedRoot {
  return { root: { declaredPath: dir, realPath: realpathSync(dir), inode: 0 }, sources: [] };
}

function writeFixture(path: string): void {
  const lines: unknown[] = [
    { type: "assistant", uuid: "a", isSidechain: false, timestamp: "2026-05-28T10:00:00Z",
      message: { model: "opus-4-7", content: [
        { type: "tool_use", id: "tu1", name: "Read", input: { file_path: "/x" } },
      ], usage: { input_tokens: 10, output_tokens: 2 } } },
    { type: "user", uuid: "b", isSidechain: false, timestamp: "2026-05-28T10:00:01Z",
      message: { content: [{ type: "tool_result", tool_use_id: "tu1", is_error: false, content: "ok" }] } },
  ];
  writeFileSync(path, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
}

describe("readSessions", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "sess-")); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it("returns [] for an unknown project", () => {
    expect(readSessions([rootOf(dir)], "missing")).toEqual([]);
  });

  it("lists sessions for a project with meta from the parser", () => {
    const p = join(dir, "projects", "-foo");
    mkdirSync(p, { recursive: true });
    writeFixture(join(p, "abc.jsonl"));
    const items = readSessions([rootOf(dir)], "-foo");
    expect(items).toHaveLength(1);
    expect(items[0]!.sessionId).toBe("abc");
    expect(items[0]!.models).toEqual(["opus-4-7"]);
    expect(items[0]!.toolCounts.Read).toBe(1);
    expect(items[0]!.fileSize).toBeGreaterThan(0);
  });
});

describe("readSession", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "sess-one-")); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it("returns null for an unknown session id", () => {
    expect(readSession([rootOf(dir)], "missing", "x")).toBeNull();
  });

  it("returns events + meta for an existing session", () => {
    const p = join(dir, "projects", "-foo");
    mkdirSync(p, { recursive: true });
    writeFixture(join(p, "abc.jsonl"));
    const s = readSession([rootOf(dir)], "-foo", "abc");
    expect(s).not.toBeNull();
    expect(s!.meta.sessionId).toBe("abc");
    expect(s!.events.length).toBeGreaterThan(0);
  });
});
