import { describe, it, expect } from "vitest";
import { normalizeLine } from "../eventNormalizer.js";

describe("normalizeLine", () => {
  it("returns [] for malformed JSON", () => {
    expect(normalizeLine("{not json")).toEqual([]);
  });

  it("normalizes assistant content blocks to thinking/text/tool_use events", () => {
    const line = JSON.stringify({
      type: "assistant",
      uuid: "u1",
      parentUuid: "u0",
      isSidechain: false,
      timestamp: "2026-05-28T10:00:00Z",
      requestId: "r1",
      message: {
        model: "claude-opus-4-7",
        content: [
          { type: "thinking", thinking: "let me think" },
          { type: "text", text: "hello" },
          { type: "tool_use", id: "tu1", name: "Read", input: { file_path: "/a" } },
        ],
      },
    });
    const out = normalizeLine(line);
    expect(out.map((e) => e.kind)).toEqual(["thinking", "text", "tool_use"]);
    expect((out[0] as { text: string }).text).toBe("let me think");
    expect((out[2] as { name: string }).name).toBe("Read");
    expect((out[2] as { toolUseId: string }).toolUseId).toBe("tu1");
  });

  it("emits subagent_spawn for Task/Agent tool_use", () => {
    const line = JSON.stringify({
      type: "assistant",
      uuid: "u2", isSidechain: false, timestamp: "2026-05-28T10:00:01Z",
      message: { content: [
        { type: "tool_use", id: "tu2", name: "Task",
          input: { subagent_type: "code-reviewer", description: "review diff" } }
      ]},
    });
    const out = normalizeLine(line);
    expect(out).toHaveLength(2);
    expect(out[0]!.kind).toBe("tool_use");
    expect(out[1]!.kind).toBe("subagent_spawn");
    expect((out[1] as { subagentType: string }).subagentType).toBe("code-reviewer");
  });

  it("emits skill_use for Skill tool_use", () => {
    const line = JSON.stringify({
      type: "assistant", uuid: "u3", isSidechain: false, timestamp: "x",
      message: { content: [
        { type: "tool_use", id: "tu3", name: "Skill", input: { skill: "writing-plans" } }
      ]},
    });
    const out = normalizeLine(line);
    expect(out.find((e) => e.kind === "skill_use")).toBeDefined();
  });

  it("normalizes user lines including tool_result content blocks", () => {
    const line = JSON.stringify({
      type: "user", uuid: "u4", isSidechain: false, timestamp: "x",
      message: { content: [
        { type: "tool_result", tool_use_id: "tu1", is_error: false, content: "ok output" },
        { type: "text", text: "thanks" },
      ]},
    });
    const out = normalizeLine(line);
    const tr = out.find((e) => e.kind === "tool_result") as { ok: boolean; preview: string; toolUseId: string } | undefined;
    expect(tr).toBeDefined();
    expect(tr!.ok).toBe(true);
    expect(tr!.toolUseId).toBe("tu1");
    expect(out.find((e) => e.kind === "user")).toBeDefined();
  });

  it("skips line types it does not care about (queue-operation, attachment, etc.)", () => {
    expect(normalizeLine(JSON.stringify({ type: "queue-operation" }))).toEqual([]);
    expect(normalizeLine(JSON.stringify({ type: "attachment" }))).toEqual([]);
  });
});
