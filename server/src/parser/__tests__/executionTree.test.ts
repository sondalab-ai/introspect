import { describe, it, expect } from "vitest";
import { buildTree } from "../executionTree.js";
import type { SessionEvent } from "../types.js";

function ev(over: Partial<SessionEvent> & { kind: SessionEvent["kind"]; uuid: string }): SessionEvent {
  const base = { isSidechain: false, ts: "x", parentUuid: undefined } as const;
  switch (over.kind) {
    case "text": return { ...base, ...over, kind: "text", text: "" } as SessionEvent;
    case "tool_use": return { ...base, ...over, kind: "tool_use", name: "Read", input: {}, toolUseId: "t" } as SessionEvent;
    case "subagent_spawn": return { ...base, ...over, kind: "subagent_spawn", toolUseId: "t", subagentType: "x", description: "" } as SessionEvent;
    case "user": return { ...base, ...over, kind: "user", text: "" } as SessionEvent;
    default: return { ...base, ...over, kind: "text", text: "" } as SessionEvent;
  }
}

describe("buildTree", () => {
  it("returns an empty array for no events", () => {
    expect(buildTree([])).toEqual([]);
  });

  it("nests events by parentUuid", () => {
    const events: SessionEvent[] = [
      ev({ kind: "text", uuid: "a" }),
      ev({ kind: "tool_use", uuid: "b", parentUuid: "a" }),
      ev({ kind: "user", uuid: "c", parentUuid: "b" }),
    ];
    const tree = buildTree(events);
    expect(tree).toHaveLength(1);
    expect(tree[0]!.event.uuid).toBe("a");
    expect(tree[0]!.children[0]!.event.uuid).toBe("b");
    expect(tree[0]!.children[0]!.children[0]!.event.uuid).toBe("c");
  });

  it("treats events with no parentUuid as roots and preserves order", () => {
    const events: SessionEvent[] = [
      ev({ kind: "text", uuid: "a" }),
      ev({ kind: "text", uuid: "b" }),
    ];
    expect(buildTree(events).map((n) => n.event.uuid)).toEqual(["a", "b"]);
  });

  it("places orphan events (parent not seen) at the root", () => {
    const events: SessionEvent[] = [
      ev({ kind: "text", uuid: "a", parentUuid: "ghost" }),
    ];
    expect(buildTree(events)).toHaveLength(1);
  });

  it("flags sidechain branches preserved through nesting", () => {
    const events: SessionEvent[] = [
      ev({ kind: "subagent_spawn", uuid: "a" }),
      ev({ kind: "text", uuid: "b", parentUuid: "a", isSidechain: true }),
    ];
    const tree = buildTree(events);
    expect(tree[0]!.children[0]!.event.isSidechain).toBe(true);
  });
});
