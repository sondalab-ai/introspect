import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readTranscript } from "../transcript.js";

function writeFixture(path: string): void {
  const lines: unknown[] = [
    { type: "queue-operation" },
    { type: "assistant", uuid: "a", isSidechain: false, timestamp: "2026-05-28T10:00:00Z",
      message: { model: "opus-4-7", content: [
        { type: "thinking", thinking: "hmm" },
        { type: "tool_use", id: "tu1", name: "Read", input: { file_path: "/x" } },
      ], usage: { input_tokens: 100, output_tokens: 20 } } },
    { type: "user", uuid: "b", isSidechain: false, timestamp: "2026-05-28T10:00:01Z",
      message: { content: [
        { type: "tool_result", tool_use_id: "tu1", is_error: false, content: "ok" },
      ] } },
    { type: "assistant", uuid: "c", isSidechain: false, timestamp: "2026-05-28T10:00:02Z",
      message: { model: "opus-4-7", content: [
        { type: "tool_use", id: "tu2", name: "Task", input: { subagent_type: "x", description: "y" } },
      ], usage: { input_tokens: 50, output_tokens: 5 } } },
  ];
  writeFileSync(path, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
}

describe("readTranscript", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "tr-")); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it("returns events, tree, and meta computed from the file", () => {
    const f = join(dir, "abc.jsonl");
    writeFixture(f);
    const t = readTranscript(f);
    expect(t.events.length).toBeGreaterThanOrEqual(4);
    expect(t.tree.length).toBeGreaterThan(0);
    expect(t.meta.sessionId).toBe("abc");
    expect(t.meta.firstTs).toBe("2026-05-28T10:00:00Z");
    expect(t.meta.lastTs).toBe("2026-05-28T10:00:02Z");
    expect(t.meta.models).toEqual(["opus-4-7"]);
    expect(t.meta.toolCounts.Read).toBe(1);
    expect(t.meta.toolCounts.Task).toBe(1);
    expect(t.meta.subagentCount).toBe(1);
    expect(t.meta.totalUsageTokens).toBe(175);
    expect(t.meta.messageCounts.assistant).toBe(2);
    expect(t.meta.messageCounts.user).toBe(1);
  });
});
