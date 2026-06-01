# Introspect — Slice 2: Parser + Projects/Sessions Explorer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Parse `.jsonl` session transcripts into a normalized `SessionEvent` stream + execution tree, expose Projects and Sessions over REST, and browse them in the web shell with a chronological event-stream detail view (graph replay deferred to Slice 2.5).

**Architecture:** A new `parser/` module owns transcript normalization: `jsonlReader` reads file contents incrementally by offset; `eventNormalizer` turns raw assistant/user/system lines into `SessionEvent` (discriminated union with `thinking`/`text`/`tool_use`/`tool_result`/`subagent_spawn`/`skill_use`/`user`/`meta`); `executionTree` reconstructs main→subagent→tool→file using `parentUuid` + `isSidechain`; `transcript.ts` composes them and produces a `SessionMeta` summary. Two new readers (`projects.ts`, `sessions.ts`) aggregate per-root project dirs and per-project session files (with metadata derived via the parser). API exposes `/projects`, `/projects/:id/sessions`, `/sessions/:id`. The web side adds `ProjectsPage` (list + drill into sessions), `SessionsPage` (flat session list across roots), and `SessionDetailPage` (event-stream view with chips for model/branch/cwd and chronological events).

**Tech Stack:** Node 20+, TypeScript, Fastify, Vitest. No new dependencies.

This is the fourth plan in the introspect series. Slice 1.5 is current on `slice-1.5-discovery` (66 server tests + 6 from settings array guards + 3 secrets + 1 markdownDir + 2 memories profile = 78 tests). **Slice 2 runs on a new branch `slice-2-projects-sessions`.**

---

## File Structure

```
server/src/
├── parser/
│   ├── types.ts                    # SessionEvent union, ExecutionNode, SessionMeta
│   ├── jsonlReader.ts              # readLinesFrom(file, offset) → { lines, nextOffset }
│   ├── eventNormalizer.ts          # normalize(rawLine) → SessionEvent[]
│   ├── executionTree.ts            # buildTree(events) → ExecutionNode[]
│   ├── transcript.ts               # readTranscript(path) → { events, tree, meta }
│   └── __tests__/
│       ├── jsonlReader.test.ts
│       ├── eventNormalizer.test.ts
│       ├── executionTree.test.ts
│       └── transcript.test.ts
├── readers/
│   ├── projects.ts                 # NEW
│   ├── sessions.ts                 # NEW
│   └── __tests__/
│       ├── projects.test.ts
│       └── sessions.test.ts
└── api/server.ts                   # MODIFY: add /projects, /projects/:id/sessions, /sessions/:id

web/src/
├── api.ts                          # MODIFY: add types + endpoints
├── pages/
│   ├── ProjectsPage.tsx            # NEW
│   ├── SessionsPage.tsx            # NEW
│   └── SessionDetailPage.tsx       # NEW (internal, used by ProjectsPage / SessionsPage)
├── components/
│   └── EventStream.tsx             # NEW: chronological event-list renderer
└── App.tsx                         # MODIFY: route "Projects" + "Sessions · History"
```

`MEMORY` reader pattern (helpers `collectFrom`/`listSubdirs`) is the model — each new file has one clear responsibility, real-fs tests, no mocks.

---

## Task 1: Branch + parser types

**Files:** `server/src/parser/types.ts`

- [ ] **Step 1: Branch**

```bash
cd /Users/marcello.barile/src/mine/introspect
git checkout -b slice-2-projects-sessions
```

- [ ] **Step 2: Create `server/src/parser/types.ts`**

```ts
/** Normalized event derived from a transcript `.jsonl` line. */
export type SessionEvent =
  | ThinkingEvent | TextEvent | ToolUseEvent | ToolResultEvent
  | SubagentSpawnEvent | SkillUseEvent | UserEvent | MetaEvent;

export interface EventBase {
  uuid: string;
  parentUuid?: string;
  isSidechain: boolean;
  ts: string;
  requestId?: string;
}

export interface ThinkingEvent extends EventBase { kind: "thinking"; text: string }
export interface TextEvent extends EventBase { kind: "text"; text: string }
export interface ToolUseEvent extends EventBase {
  kind: "tool_use";
  name: string;
  input: unknown;
  toolUseId: string;
}
export interface ToolResultEvent extends EventBase {
  kind: "tool_result";
  toolUseId: string;
  ok: boolean;
  preview: string;
}
export interface SubagentSpawnEvent extends EventBase {
  kind: "subagent_spawn";
  toolUseId: string;
  subagentType: string;
  description: string;
}
export interface SkillUseEvent extends EventBase {
  kind: "skill_use";
  toolUseId: string;
  skill: string;
}
export interface UserEvent extends EventBase { kind: "user"; text: string }
export interface MetaEvent extends EventBase { kind: "meta"; key: string; value: unknown }

/** Tree node for the main-thread → subagent → tool → file execution view. */
export interface ExecutionNode {
  event: SessionEvent;
  children: ExecutionNode[];
}

/** Per-session summary computed during normalization. */
export interface SessionMeta {
  sessionId: string;
  firstTs?: string;
  lastTs?: string;
  models: string[];
  cwd?: string;
  gitBranch?: string;
  messageCounts: { user: number; assistant: number; sidechain: number };
  toolCounts: Record<string, number>;
  subagentCount: number;
  totalUsageTokens: number;
}

export function emptyMeta(sessionId: string): SessionMeta {
  return {
    sessionId,
    models: [],
    messageCounts: { user: 0, assistant: 0, sidechain: 0 },
    toolCounts: {},
    subagentCount: 0,
    totalUsageTokens: 0,
  };
}
```

- [ ] **Step 3: Commit**

```bash
git add server/src/parser/types.ts
git commit -m "feat(parser): SessionEvent union, ExecutionNode, SessionMeta"
```

---

## Task 2: `jsonlReader` (incremental TDD)

**Files:** `server/src/parser/jsonlReader.ts` + test

- [ ] **Step 1: Failing test `server/src/parser/__tests__/jsonlReader.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readLinesFrom } from "../jsonlReader.js";

describe("readLinesFrom", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "jsonl-")); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it("returns [] and offset=0 for a missing file", () => {
    expect(readLinesFrom(join(dir, "nope.jsonl"), 0)).toEqual({ lines: [], nextOffset: 0 });
  });

  it("reads all complete lines from offset 0", () => {
    const f = join(dir, "a.jsonl");
    writeFileSync(f, '{"a":1}\n{"b":2}\n');
    const r = readLinesFrom(f, 0);
    expect(r.lines).toEqual(['{"a":1}', '{"b":2}']);
    expect(r.nextOffset).toBe(16);
  });

  it("resumes from a given offset and skips re-read content", () => {
    const f = join(dir, "b.jsonl");
    writeFileSync(f, '{"a":1}\n');
    const first = readLinesFrom(f, 0);
    appendFileSync(f, '{"b":2}\n');
    const second = readLinesFrom(f, first.nextOffset);
    expect(second.lines).toEqual(['{"b":2}']);
    expect(second.nextOffset).toBe(16);
  });

  it("withholds a trailing partial line (no terminating newline)", () => {
    const f = join(dir, "c.jsonl");
    writeFileSync(f, '{"a":1}\n{"par');
    const r = readLinesFrom(f, 0);
    expect(r.lines).toEqual(['{"a":1}']);
    expect(r.nextOffset).toBe(8); // before the partial line
  });
});
```

- [ ] **Step 2: Red** — `npm test --workspace server -- jsonlReader` → FAIL.

- [ ] **Step 3: Implement `server/src/parser/jsonlReader.ts`**

```ts
import { existsSync, statSync, openSync, readSync, closeSync } from "node:fs";

export interface ReadResult {
  lines: string[];
  /** Byte offset of the first unread byte (start of any partial trailing line). */
  nextOffset: number;
}

const CHUNK = 64 * 1024;

/** Read complete `\n`-terminated lines from `offset`, withholding any trailing partial. */
export function readLinesFrom(path: string, offset: number): ReadResult {
  if (!existsSync(path)) return { lines: [], nextOffset: 0 };
  const size = statSync(path).size;
  if (offset >= size) return { lines: [], nextOffset: offset };

  const fd = openSync(path, "r");
  let buf = "";
  let pos = offset;
  const chunk = Buffer.alloc(CHUNK);
  try {
    while (pos < size) {
      const read = readSync(fd, chunk, 0, Math.min(CHUNK, size - pos), pos);
      if (read <= 0) break;
      buf += chunk.subarray(0, read).toString("utf8");
      pos += read;
    }
  } finally {
    closeSync(fd);
  }

  const lines: string[] = [];
  let cursor = 0;
  let consumed = 0;
  while (true) {
    const nl = buf.indexOf("\n", cursor);
    if (nl < 0) break;
    lines.push(buf.slice(cursor, nl));
    cursor = nl + 1;
    consumed = cursor;
  }
  return { lines, nextOffset: offset + Buffer.byteLength(buf.slice(0, consumed), "utf8") };
}
```

- [ ] **Step 4: Green** — +4 tests.

- [ ] **Step 5: Commit**

```bash
git add server/src/parser/jsonlReader.ts server/src/parser/__tests__/jsonlReader.test.ts
git commit -m "feat(parser): incremental jsonl line reader by byte offset"
```

---

## Task 3: `eventNormalizer` (TDD)

**Files:** `server/src/parser/eventNormalizer.ts` + test

- [ ] **Step 1: Failing test `server/src/parser/__tests__/eventNormalizer.test.ts`**

```ts
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
```

- [ ] **Step 2: Red** — FAIL.

- [ ] **Step 3: Implement `server/src/parser/eventNormalizer.ts`**

```ts
import type { SessionEvent } from "./types.js";

interface RawEnvelope {
  type?: string;
  uuid?: string;
  parentUuid?: string;
  isSidechain?: boolean;
  timestamp?: string;
  requestId?: string;
  message?: { content?: unknown[] };
}

const PREVIEW_LIMIT = 200;

function s(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function asObj(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function previewOfResult(c: unknown): string {
  if (typeof c === "string") return c.replace(/\s+/g, " ").trim().slice(0, PREVIEW_LIMIT);
  if (Array.isArray(c)) {
    const text = c
      .map((b) => {
        const o = asObj(b);
        return o && typeof o.text === "string" ? o.text : "";
      })
      .join(" ");
    return text.replace(/\s+/g, " ").trim().slice(0, PREVIEW_LIMIT);
  }
  return "";
}

/** Normalize a single transcript JSONL line into 0+ `SessionEvent`s. */
export function normalizeLine(raw: string): SessionEvent[] {
  let env: RawEnvelope;
  try { env = JSON.parse(raw) as RawEnvelope; } catch { return []; }
  if (env === null || typeof env !== "object") return [];

  const base = {
    uuid: s(env.uuid),
    parentUuid: env.parentUuid ? s(env.parentUuid) : undefined,
    isSidechain: env.isSidechain === true,
    ts: s(env.timestamp),
    requestId: env.requestId ? s(env.requestId) : undefined,
  };

  if (env.type === "assistant") return normalizeAssistant(env, base);
  if (env.type === "user") return normalizeUser(env, base);
  return [];
}

function normalizeAssistant(env: RawEnvelope, base: ReturnType<typeof baseShape>): SessionEvent[] {
  const out: SessionEvent[] = [];
  const content = Array.isArray(env.message?.content) ? env.message!.content! : [];
  for (const block of content) {
    const o = asObj(block);
    if (!o) continue;
    switch (o.type) {
      case "thinking":
        out.push({ ...base, kind: "thinking", text: s(o.thinking) });
        break;
      case "text":
        out.push({ ...base, kind: "text", text: s(o.text) });
        break;
      case "tool_use": {
        const name = s(o.name);
        const toolUseId = s(o.id);
        out.push({ ...base, kind: "tool_use", name, input: o.input, toolUseId });
        if (name === "Task" || name === "Agent") {
          const inp = asObj(o.input) ?? {};
          out.push({
            ...base, kind: "subagent_spawn", toolUseId,
            subagentType: s(inp.subagent_type),
            description: s(inp.description),
          });
        } else if (name === "Skill") {
          const inp = asObj(o.input) ?? {};
          out.push({ ...base, kind: "skill_use", toolUseId, skill: s(inp.skill) });
        }
        break;
      }
      default:
        // ignore unknown blocks
        break;
    }
  }
  return out;
}

function normalizeUser(env: RawEnvelope, base: ReturnType<typeof baseShape>): SessionEvent[] {
  const out: SessionEvent[] = [];
  const content = env.message?.content;
  if (typeof content === "string") {
    out.push({ ...base, kind: "user", text: content });
    return out;
  }
  if (!Array.isArray(content)) return out;
  let textParts = "";
  for (const block of content) {
    const o = asObj(block);
    if (!o) continue;
    if (o.type === "tool_result") {
      out.push({
        ...base, kind: "tool_result",
        toolUseId: s(o.tool_use_id),
        ok: o.is_error !== true,
        preview: previewOfResult(o.content),
      });
    } else if (o.type === "text") {
      textParts += (textParts ? " " : "") + s(o.text);
    }
  }
  if (textParts) out.push({ ...base, kind: "user", text: textParts });
  return out;
}

// helper so TS infers the base shape for the per-event helpers
function baseShape(env: RawEnvelope) {
  return {
    uuid: s(env.uuid),
    parentUuid: env.parentUuid ? s(env.parentUuid) : undefined,
    isSidechain: env.isSidechain === true,
    ts: s(env.timestamp),
    requestId: env.requestId ? s(env.requestId) : undefined,
  };
}
```

- [ ] **Step 4: Green** — `npm test --workspace server` → +6 tests.

- [ ] **Step 5: Commit**

```bash
git add server/src/parser/eventNormalizer.ts server/src/parser/__tests__/eventNormalizer.test.ts
git commit -m "feat(parser): normalize transcript lines to SessionEvent union"
```

---

## Task 4: `executionTree` (TDD)

**Files:** `server/src/parser/executionTree.ts` + test

- [ ] **Step 1: Failing test `server/src/parser/__tests__/executionTree.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { buildTree } from "../executionTree.js";
import type { SessionEvent } from "../types.js";

function ev(over: Partial<SessionEvent> & { kind: SessionEvent["kind"]; uuid: string }): SessionEvent {
  // Minimal shape per kind; tests only care about uuid/parentUuid/isSidechain wiring.
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
```

- [ ] **Step 2: Red** — FAIL.

- [ ] **Step 3: Implement `server/src/parser/executionTree.ts`**

```ts
import type { ExecutionNode, SessionEvent } from "./types.js";

/** Build a forest from `parentUuid` links; events with no/unknown parent are roots. */
export function buildTree(events: SessionEvent[]): ExecutionNode[] {
  const nodes = new Map<string, ExecutionNode>();
  for (const event of events) {
    if (!event.uuid) continue;
    nodes.set(event.uuid, { event, children: [] });
  }
  const roots: ExecutionNode[] = [];
  for (const event of events) {
    const node = nodes.get(event.uuid);
    if (!node) continue;
    const parent = event.parentUuid ? nodes.get(event.parentUuid) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}
```

- [ ] **Step 4: Green** — +5 tests.

- [ ] **Step 5: Commit**

```bash
git add server/src/parser/executionTree.ts server/src/parser/__tests__/executionTree.test.ts
git commit -m "feat(parser): build execution forest from parentUuid"
```

---

## Task 5: `transcript` composer (TDD)

**Files:** `server/src/parser/transcript.ts` + test

- [ ] **Step 1: Failing test `server/src/parser/__tests__/transcript.test.ts`**

```ts
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
```

- [ ] **Step 2: Red** — FAIL.

- [ ] **Step 3: Implement `server/src/parser/transcript.ts`**

```ts
import { basename } from "node:path";
import { readLinesFrom } from "./jsonlReader.js";
import { normalizeLine } from "./eventNormalizer.js";
import { buildTree } from "./executionTree.js";
import { emptyMeta, type ExecutionNode, type SessionEvent, type SessionMeta } from "./types.js";

export interface Transcript {
  events: SessionEvent[];
  tree: ExecutionNode[];
  meta: SessionMeta;
}

function asObj(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function s(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function sessionIdFromFile(path: string): string {
  const base = basename(path);
  return base.endsWith(".jsonl") ? base.slice(0, -".jsonl".length) : base;
}

/** Parse a full transcript file in one pass. */
export function readTranscript(path: string): Transcript {
  const { lines } = readLinesFrom(path, 0);
  const sessionId = sessionIdFromFile(path);
  const meta = emptyMeta(sessionId);
  const events: SessionEvent[] = [];
  const modelsSeen = new Set<string>();

  for (const raw of lines) {
    let env: Record<string, unknown> | null;
    try { env = asObj(JSON.parse(raw)); } catch { env = null; }
    if (env) {
      if (env.type === "assistant") meta.messageCounts.assistant += 1;
      else if (env.type === "user") meta.messageCounts.user += 1;
      if (env.isSidechain === true) meta.messageCounts.sidechain += 1;
      const msg = asObj(env.message);
      if (msg) {
        const model = s(msg.model);
        if (model && !modelsSeen.has(model)) { modelsSeen.add(model); meta.models.push(model); }
        const usage = asObj(msg.usage);
        if (usage) {
          const inT = typeof usage.input_tokens === "number" ? usage.input_tokens : 0;
          const outT = typeof usage.output_tokens === "number" ? usage.output_tokens : 0;
          meta.totalUsageTokens += inT + outT;
        }
      }
      const cwd = s(env.cwd);
      if (cwd && !meta.cwd) meta.cwd = cwd;
      const gb = s(env.gitBranch);
      if (gb && !meta.gitBranch) meta.gitBranch = gb;
      const ts = s(env.timestamp);
      if (ts) {
        if (!meta.firstTs) meta.firstTs = ts;
        meta.lastTs = ts;
      }
    }

    const normalized = normalizeLine(raw);
    for (const e of normalized) {
      events.push(e);
      if (e.kind === "tool_use") {
        meta.toolCounts[e.name] = (meta.toolCounts[e.name] ?? 0) + 1;
      } else if (e.kind === "subagent_spawn") {
        meta.subagentCount += 1;
      }
    }
  }

  return { events, tree: buildTree(events), meta };
}
```

- [ ] **Step 4: Green** — +1 test (now 16 net new in parser).

- [ ] **Step 5: Commit**

```bash
git add server/src/parser/transcript.ts server/src/parser/__tests__/transcript.test.ts
git commit -m "feat(parser): transcript composer with SessionMeta summary"
```

---

## Task 6: `projects` reader (TDD)

**Files:** `server/src/readers/projects.ts` + test

- [ ] **Step 1: Failing test `server/src/readers/__tests__/projects.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readProjects } from "../projects.js";
import type { ResolvedRoot } from "../../sources/types.js";

function rootOf(dir: string): ResolvedRoot {
  return { root: { declaredPath: dir, realPath: realpathSync(dir), inode: 0 }, sources: [] };
}

describe("readProjects", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "proj-")); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it("returns [] when no projects/ dir exists", () => {
    expect(readProjects([rootOf(dir)])).toEqual([]);
  });

  it("lists project slugs with session counts and last activity", () => {
    const p1 = join(dir, "projects", "-Users-a-repo-foo");
    mkdirSync(p1, { recursive: true });
    writeFileSync(join(p1, "s1.jsonl"), "{}\n");
    writeFileSync(join(p1, "s2.jsonl"), "{}\n");
    const items = readProjects([rootOf(dir)]);
    expect(items).toHaveLength(1);
    expect(items[0]!.slug).toBe("-Users-a-repo-foo");
    expect(items[0]!.sessionCount).toBe(2);
    expect(items[0]!.lastActivityMs).toBeGreaterThan(0);
  });

  it("aggregates projects across multiple roots", () => {
    const a = mkdtempSync(join(tmpdir(), "proj-a-"));
    const b = mkdtempSync(join(tmpdir(), "proj-b-"));
    mkdirSync(join(a, "projects", "-p1"), { recursive: true });
    mkdirSync(join(b, "projects", "-p2"), { recursive: true });
    try {
      const items = readProjects([rootOf(a), rootOf(b)]);
      expect(items.map((i) => i.slug).sort()).toEqual(["-p1", "-p2"]);
    } finally {
      rmSync(a, { recursive: true, force: true });
      rmSync(b, { recursive: true, force: true });
    }
  });

  it("encodes a stable id combining rootPath and slug", () => {
    mkdirSync(join(dir, "projects", "-p"), { recursive: true });
    const items = readProjects([rootOf(dir)]);
    expect(items[0]!.id).toContain("-p");
    expect(items[0]!.id).toContain(realpathSync(dir));
  });
});
```

- [ ] **Step 2: Red** — FAIL.

- [ ] **Step 3: Implement `server/src/readers/projects.ts`**

```ts
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { ResolvedRoot } from "../sources/types.js";

export interface ProjectItem {
  /** Stable id = `${rootRealPath}::${slug}` so the URL is unambiguous across roots. */
  id: string;
  rootPath: string;
  slug: string;
  sessionCount: number;
  /** Epoch ms of the newest `.jsonl` mtime; 0 if no sessions. */
  lastActivityMs: number;
}

function listSessions(projectDir: string): { count: number; lastMs: number } {
  let count = 0;
  let lastMs = 0;
  let entries: string[];
  try { entries = readdirSync(projectDir); } catch { return { count, lastMs }; }
  for (const entry of entries) {
    if (!entry.endsWith(".jsonl")) continue;
    const p = join(projectDir, entry);
    try {
      const st = statSync(p);
      if (!st.isFile()) continue;
      count += 1;
      const ms = st.mtimeMs;
      if (ms > lastMs) lastMs = ms;
    } catch {
      // skip
    }
  }
  return { count, lastMs };
}

/** Read project directories under `<root>/projects/`. */
export function readProjects(roots: ResolvedRoot[]): ProjectItem[] {
  const out: ProjectItem[] = [];
  for (const { root } of roots) {
    const projectsDir = join(root.realPath, "projects");
    if (!existsSync(projectsDir)) continue;
    let entries: string[];
    try { entries = readdirSync(projectsDir); } catch { continue; }
    for (const slug of entries) {
      const p = join(projectsDir, slug);
      try {
        if (!statSync(p).isDirectory()) continue;
      } catch { continue; }
      const { count, lastMs } = listSessions(p);
      out.push({
        id: `${root.realPath}::${slug}`,
        rootPath: root.realPath,
        slug,
        sessionCount: count,
        lastActivityMs: lastMs,
      });
    }
  }
  out.sort((a, b) => b.lastActivityMs - a.lastActivityMs);
  return out;
}
```

- [ ] **Step 4: Green** — +4 tests.

- [ ] **Step 5: Commit**

```bash
git add server/src/readers/projects.ts server/src/readers/__tests__/projects.test.ts
git commit -m "feat(readers): list project dirs with session counts + last activity"
```

---

## Task 7: `sessions` reader (TDD)

**Files:** `server/src/readers/sessions.ts` + test

- [ ] **Step 1: Failing test `server/src/readers/__tests__/sessions.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync, statSync } from "node:fs";
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
```

- [ ] **Step 2: Red** — FAIL.

- [ ] **Step 3: Implement `server/src/readers/sessions.ts`**

```ts
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { readTranscript, type Transcript } from "../parser/transcript.js";
import type { SessionMeta } from "../parser/types.js";
import type { ResolvedRoot } from "../sources/types.js";

export interface SessionListItem extends SessionMeta {
  rootPath: string;
  slug: string;
  filePath: string;
  fileSize: number;
}

function listJsonl(projectDir: string): { name: string; path: string; size: number }[] {
  if (!existsSync(projectDir)) return [];
  const out: { name: string; path: string; size: number }[] = [];
  for (const entry of readdirSync(projectDir)) {
    if (!entry.endsWith(".jsonl")) continue;
    const p = join(projectDir, entry);
    try {
      const st = statSync(p);
      if (!st.isFile()) continue;
      out.push({ name: entry, path: p, size: st.size });
    } catch {
      // skip
    }
  }
  return out;
}

function findProjectDir(roots: ResolvedRoot[], slug: string): { rootPath: string; dir: string } | null {
  for (const { root } of roots) {
    const dir = join(root.realPath, "projects", slug);
    if (existsSync(dir)) return { rootPath: root.realPath, dir };
  }
  return null;
}

export function readSessions(roots: ResolvedRoot[], slug: string): SessionListItem[] {
  const target = findProjectDir(roots, slug);
  if (!target) return [];
  const out: SessionListItem[] = [];
  for (const f of listJsonl(target.dir)) {
    const t = readTranscript(f.path);
    out.push({
      ...t.meta,
      rootPath: target.rootPath,
      slug,
      filePath: f.path,
      fileSize: f.size,
    });
  }
  // newest first by lastTs (fallback: filename)
  out.sort((a, b) => (b.lastTs ?? "").localeCompare(a.lastTs ?? ""));
  return out;
}

export function readSession(
  roots: ResolvedRoot[], slug: string, sessionId: string,
): Transcript | null {
  const target = findProjectDir(roots, slug);
  if (!target) return null;
  const path = join(target.dir, `${sessionId}.jsonl`);
  if (!existsSync(path)) return null;
  return readTranscript(path);
}
```

- [ ] **Step 4: Green** — +4 tests.

- [ ] **Step 5: Commit**

```bash
git add server/src/readers/sessions.ts server/src/readers/__tests__/sessions.test.ts
git commit -m "feat(readers): list sessions per project + read a single session"
```

---

## Task 8: API endpoints + integration test

**Files:** modify `server/src/api/server.ts` and `server/src/api/server.test.ts`.

- [ ] **Step 1: Append failing integration tests to `server/src/api/server.test.ts`**

```ts
  it("GET /projects returns aggregated projects", async () => {
    // beforeEach creates `agents/`; add a project too
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
```

- [ ] **Step 2: Red** — FAIL (404s on new paths).

- [ ] **Step 3: Modify `server/src/api/server.ts`** — add the new imports and routes. Add these imports near the existing reader imports:

```ts
import { readProjects } from "../readers/projects.js";
import { readSessions, readSession } from "../readers/sessions.js";
```

Add these routes inside `buildServer` after the existing `/settings` registration:

```ts
  app.get("/projects", async () => readProjects(resolveSources(opts)));

  app.get<{ Params: { slug: string } }>("/projects/:slug/sessions", async (req) =>
    readSessions(resolveSources(opts), req.params.slug),
  );

  app.get<{ Params: { slug: string; id: string } }>(
    "/sessions/:slug/:id",
    async (req, reply) => {
      const t = readSession(resolveSources(opts), req.params.slug, req.params.id);
      if (!t) return reply.code(404).send({ error: "not found" });
      return t;
    },
  );
```

- [ ] **Step 4: Green** — `npm test --workspace server` → +4 tests.

- [ ] **Step 5: Commit**

```bash
git add server/src/api/server.ts server/src/api/server.test.ts
git commit -m "feat(api): expose /projects, /projects/:slug/sessions, /sessions/:slug/:id"
```

---

## Task 9: Web types + endpoints

**Files:** modify `web/src/api.ts`.

- [ ] **Step 1: Append to `web/src/api.ts`** — add new interfaces and endpoints. Insert after the existing `SettingsItem` block, before `ENDPOINTS`:

```ts
export interface ProjectItem {
  id: string;
  rootPath: string;
  slug: string;
  sessionCount: number;
  lastActivityMs: number;
}

export type SessionEvent =
  | { kind: "thinking"; uuid: string; parentUuid?: string; isSidechain: boolean; ts: string; text: string }
  | { kind: "text"; uuid: string; parentUuid?: string; isSidechain: boolean; ts: string; text: string }
  | { kind: "tool_use"; uuid: string; parentUuid?: string; isSidechain: boolean; ts: string; name: string; input: unknown; toolUseId: string }
  | { kind: "tool_result"; uuid: string; parentUuid?: string; isSidechain: boolean; ts: string; toolUseId: string; ok: boolean; preview: string }
  | { kind: "subagent_spawn"; uuid: string; parentUuid?: string; isSidechain: boolean; ts: string; toolUseId: string; subagentType: string; description: string }
  | { kind: "skill_use"; uuid: string; parentUuid?: string; isSidechain: boolean; ts: string; toolUseId: string; skill: string }
  | { kind: "user"; uuid: string; parentUuid?: string; isSidechain: boolean; ts: string; text: string }
  | { kind: "meta"; uuid: string; parentUuid?: string; isSidechain: boolean; ts: string; key: string; value: unknown };

export interface SessionMeta {
  sessionId: string;
  firstTs?: string;
  lastTs?: string;
  models: string[];
  cwd?: string;
  gitBranch?: string;
  messageCounts: { user: number; assistant: number; sidechain: number };
  toolCounts: Record<string, number>;
  subagentCount: number;
  totalUsageTokens: number;
}

export interface SessionListItem extends SessionMeta {
  rootPath: string;
  slug: string;
  filePath: string;
  fileSize: number;
}

export interface Transcript {
  events: SessionEvent[];
  meta: SessionMeta;
}
```

Then replace the `ENDPOINTS` block with:

```ts
export const ENDPOINTS = {
  instructions: "/instructions",
  agents: "/agents",
  commands: "/commands",
  skills: "/skills",
  memories: "/memories",
  plugins: "/plugins",
  settings: "/settings",
  projects: "/projects",
  sessionsOf: (slug: string) => `/projects/${encodeURIComponent(slug)}/sessions`,
  session: (slug: string, id: string) => `/sessions/${encodeURIComponent(slug)}/${encodeURIComponent(id)}`,
} as const;
```

- [ ] **Step 2: Update vite proxy regex** in `web/vite.config.ts` to include the new paths. Replace the API_ROUTES line with:

```ts
const API_ROUTES =
  "^/(health|sources|instructions|agents|commands|skills|memories|plugins|settings|projects|sessions)(/|$)";
```

- [ ] **Step 3: Typecheck**

`cd web && npx tsc --noEmit -p tsconfig.json` → exit 0.

- [ ] **Step 4: Commit**

```bash
git add web/src/api.ts web/vite.config.ts
git commit -m "feat(web): API types + endpoint helpers for projects/sessions"
```

---

## Task 10: `EventStream` component

**Files:** `web/src/components/EventStream.tsx`, append CSS to `web/src/theme.css`.

- [ ] **Step 1: Create `web/src/components/EventStream.tsx`**

```tsx
import type { SessionEvent } from "../api.js";

const KIND_LABEL: Record<SessionEvent["kind"], string> = {
  thinking: "thinking",
  text: "text",
  tool_use: "tool",
  tool_result: "result",
  subagent_spawn: "subagent",
  skill_use: "skill",
  user: "user",
  meta: "meta",
};

function summary(e: SessionEvent): string {
  switch (e.kind) {
    case "thinking":
    case "text":
    case "user":
      return e.text.slice(0, 200);
    case "tool_use":
      return e.name;
    case "tool_result":
      return e.preview;
    case "subagent_spawn":
      return `${e.subagentType} — ${e.description}`;
    case "skill_use":
      return e.skill;
    case "meta":
      return e.key;
  }
}

function fmtTime(ts: string): string {
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts.slice(11, 19);
  return d.toISOString().slice(11, 19);
}

export function EventStream({ events }: { events: SessionEvent[] }) {
  return (
    <div className="evs">
      {events.map((e, i) => (
        <div
          key={`${e.uuid}-${i}`}
          className={`evs-row evs-${e.kind}${e.isSidechain ? " is-sidechain" : ""}`}
        >
          <span className="evs-ts">{fmtTime(e.ts)}</span>
          <span className="evs-kind">{KIND_LABEL[e.kind]}</span>
          <span className="evs-summary">{summary(e)}</span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Append styles to `web/src/theme.css`**

```css
.evs { font-family: "IBM Plex Mono"; font-size: 12.5px; line-height: 1.5; }
.evs-row { display: grid; grid-template-columns: 64px 78px 1fr; gap: 10px;
  padding: 6px 0; border-bottom: 1px solid #0e1820; align-items: baseline; }
.evs-ts { color: var(--mut); font-size: 11px; }
.evs-kind { font-size: 10px; text-transform: uppercase; letter-spacing: .12em;
  color: var(--mut); padding: 2px 6px; border-radius: 3px; border: 1px solid var(--line);
  text-align: center; }
.evs-summary { color: var(--txt); white-space: pre-wrap; word-break: break-word; }
.evs-thinking .evs-kind { color: var(--cy); border-color: rgba(46,230,192,.3); }
.evs-tool_use .evs-kind { color: #5ad1ff; border-color: rgba(90,209,255,.3); }
.evs-tool_result .evs-kind { color: #b08cff; border-color: rgba(176,140,255,.3); }
.evs-subagent_spawn .evs-kind { color: #ffd166; border-color: rgba(255,209,102,.3); }
.evs-skill_use .evs-kind { color: #ff9b6b; border-color: rgba(255,155,107,.3); }
.evs-user .evs-kind { color: #cfe1dd; border-color: rgba(207,225,221,.3); }
.evs-row.is-sidechain { background: linear-gradient(90deg, rgba(176,140,255,.05), transparent);
  padding-left: 8px; }
```

- [ ] **Step 3: Typecheck**

`cd web && npx tsc --noEmit -p tsconfig.json` → exit 0.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/EventStream.tsx web/src/theme.css
git commit -m "feat(web): EventStream component + themed styles"
```

---

## Task 11: `SessionDetailPage`

**Files:** `web/src/pages/SessionDetailPage.tsx`.

- [ ] **Step 1: Create `web/src/pages/SessionDetailPage.tsx`**

```tsx
import { EventStream } from "../components/EventStream.js";
import { useEndpoint } from "../useEndpoint.js";
import { ENDPOINTS, type Transcript } from "../api.js";

export function SessionDetailPage({ slug, sessionId, onBack }: {
  slug: string; sessionId: string; onBack: () => void;
}) {
  const state = useEndpoint<Transcript>(ENDPOINTS.session(slug, sessionId));
  if (state.status === "loading") return <div className="loading">Caricamento sessione…</div>;
  if (state.status === "error") return <div className="error">Errore: {state.error}</div>;

  const { meta, events } = state.data;
  const tools = Object.entries(meta.toolCounts).sort((a, b) => b[1] - a[1]);

  return (
    <div className="canvas-body" style={{ overflowY: "auto" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 10 }}>
        <button className="back-btn" onClick={onBack}>← indietro</button>
        <h2 style={{ fontFamily: "Space Grotesk", fontSize: 18, color: "#e6f3f0" }}>{meta.sessionId}</h2>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
        {meta.models.map((m) => <span key={m} className="glass-chip"><span className="chip-text">{m}</span></span>)}
        {meta.gitBranch ? <span className="tool-chip">branch · {meta.gitBranch}</span> : null}
        {meta.cwd ? <span className="tool-chip">cwd · {meta.cwd}</span> : null}
      </div>
      <div className="meta" style={{ marginBottom: 14 }}>
        {meta.messageCounts.assistant} assistant · {meta.messageCounts.user} user
        {meta.messageCounts.sidechain > 0 ? ` · ${meta.messageCounts.sidechain} sidechain` : ""}
        {meta.subagentCount > 0 ? ` · ${meta.subagentCount} subagent` : ""}
        {meta.totalUsageTokens > 0 ? ` · ${meta.totalUsageTokens} tok` : ""}
      </div>
      {tools.length > 0 ? (
        <div className="tools-row">
          {tools.map(([name, n]) => <span key={name} className="tool-chip">{name} · {n}</span>)}
        </div>
      ) : null}
      <EventStream events={events} />
    </div>
  );
}
```

- [ ] **Step 2: Append `.back-btn` style to `web/src/theme.css`**

```css
.back-btn { font-family: "IBM Plex Mono"; font-size: 11px; color: var(--mut);
  background: transparent; border: 1px solid var(--line); border-radius: 4px;
  padding: 4px 10px; cursor: pointer;
  transition: color .12s ease, border-color .12s ease, background .12s ease; }
.back-btn:hover { color: var(--cy); border-color: rgba(46,230,192,.4);
  background: rgba(46,230,192,.05); }
```

- [ ] **Step 3: Typecheck** → exit 0.

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/SessionDetailPage.tsx web/src/theme.css
git commit -m "feat(web): session detail page with metadata chips + event stream"
```

---

## Task 12: `ProjectsPage` + `SessionsPage`

**Files:** `web/src/pages/ProjectsPage.tsx`, `web/src/pages/SessionsPage.tsx`.

- [ ] **Step 1: Create `web/src/pages/ProjectsPage.tsx`**

```tsx
import { useState } from "react";
import { ListDetail } from "../components/ListDetail.js";
import { useEndpoint } from "../useEndpoint.js";
import { ENDPOINTS, type ProjectItem, type SessionListItem } from "../api.js";
import { SessionDetailPage } from "./SessionDetailPage.js";

function fmtAge(ms: number): string {
  if (!ms) return "—";
  const delta = Date.now() - ms;
  const day = 1000 * 60 * 60 * 24;
  if (delta < day) return "oggi";
  const days = Math.round(delta / day);
  return `${days} g fa`;
}

function decodeSlug(slug: string): string {
  return slug.startsWith("-") ? slug.slice(1).replace(/-/g, "/") : slug.replace(/-/g, "/");
}

function ProjectSessionsList({ slug, onPick }: { slug: string; onPick: (id: string) => void }) {
  const state = useEndpoint<SessionListItem[]>(ENDPOINTS.sessionsOf(slug));
  if (state.status === "loading") return <div className="loading">Caricamento sessioni…</div>;
  if (state.status === "error") return <div className="error">Errore: {state.error}</div>;
  if (state.data.length === 0) return <div className="ld-empty">Nessuna sessione in questo progetto.</div>;
  return (
    <div className="sess-list">
      {state.data.map((s) => (
        <div key={s.filePath} className="sess-item" onClick={() => onPick(s.sessionId)}>
          <div className="sess-id">{s.sessionId.slice(0, 8)}</div>
          <div className="sess-meta">
            {s.models.join(", ") || "—"} · {s.messageCounts.assistant + s.messageCounts.user} msg
            {s.subagentCount > 0 ? ` · ${s.subagentCount} subagent` : ""}
          </div>
          <div className="sess-ts">{s.lastTs ?? "—"}</div>
        </div>
      ))}
    </div>
  );
}

export function ProjectsPage() {
  const state = useEndpoint<ProjectItem[]>(ENDPOINTS.projects);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [openedSession, setOpenedSession] = useState<{ slug: string; id: string } | null>(null);

  if (openedSession) {
    return (
      <SessionDetailPage
        slug={openedSession.slug}
        sessionId={openedSession.id}
        onBack={() => setOpenedSession(null)}
      />
    );
  }

  if (state.status === "loading") return <div className="loading">Caricamento progetti…</div>;
  if (state.status === "error") return <div className="error">Errore: {state.error}</div>;

  const items = state.data.map((p) => ({
    id: p.id,
    title: decodeSlug(p.slug),
    subtitle: `${p.sessionCount} sessioni · ${fmtAge(p.lastActivityMs)}`,
    raw: p,
  }));

  return (
    <div className="canvas-body">
      <ListDetail
        storageKey="projects"
        items={items}
        listTitle={`Progetti (${items.length})`}
        emptyMessage="Nessun progetto trovato."
        renderDetail={(item) => {
          if (selectedSlug !== item.raw.slug) setSelectedSlug(item.raw.slug);
          return (
            <>
              <h2 style={{ wordBreak: "break-all" }}>{decodeSlug(item.raw.slug)}</h2>
              <div className="meta">{item.raw.rootPath} · {item.raw.sessionCount} sessioni</div>
              <ProjectSessionsList
                slug={item.raw.slug}
                onPick={(id) => setOpenedSession({ slug: item.raw.slug, id })}
              />
            </>
          );
        }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Create `web/src/pages/SessionsPage.tsx`** — flat list across roots, clicking opens the detail.

```tsx
import { useMemo, useState } from "react";
import { ListDetail } from "../components/ListDetail.js";
import { useEndpoint } from "../useEndpoint.js";
import { ENDPOINTS, type ProjectItem, type SessionListItem } from "../api.js";
import { SessionDetailPage } from "./SessionDetailPage.js";

function decodeSlug(slug: string): string {
  return slug.startsWith("-") ? slug.slice(1).replace(/-/g, "/") : slug.replace(/-/g, "/");
}

function useAllSessions(projects: ProjectItem[]): SessionListItem[] {
  // One fetch per project, then flatten.
  const states = projects.map((p) => useEndpoint<SessionListItem[]>(ENDPOINTS.sessionsOf(p.slug)));
  return useMemo(() => {
    const all: SessionListItem[] = [];
    for (const s of states) if (s.status === "ready") all.push(...s.data);
    all.sort((a, b) => (b.lastTs ?? "").localeCompare(a.lastTs ?? ""));
    return all;
  }, [states]);
}

export function SessionsPage() {
  const projects = useEndpoint<ProjectItem[]>(ENDPOINTS.projects);
  const [opened, setOpened] = useState<{ slug: string; id: string } | null>(null);

  if (projects.status === "loading") return <div className="loading">Caricamento…</div>;
  if (projects.status === "error") return <div className="error">Errore: {projects.error}</div>;

  if (opened) {
    return <SessionDetailPage slug={opened.slug} sessionId={opened.id} onBack={() => setOpened(null)} />;
  }

  return <SessionsListAcrossProjects projects={projects.data} onPick={(slug, id) => setOpened({ slug, id })} />;
}

function SessionsListAcrossProjects({ projects, onPick }: {
  projects: ProjectItem[]; onPick: (slug: string, id: string) => void;
}) {
  const sessions = useAllSessions(projects);
  const items = sessions.map((s) => ({
    id: s.filePath,
    title: s.sessionId.slice(0, 8),
    subtitle: `${decodeSlug(s.slug)} · ${s.lastTs ?? "—"}`,
    raw: s,
  }));
  return (
    <div className="canvas-body">
      <ListDetail
        storageKey="sessions"
        items={items}
        listTitle={`Sessioni (${items.length})`}
        emptyMessage="Nessuna sessione trovata."
        renderDetail={(item) => (
          <>
            <h2>{item.raw.sessionId.slice(0, 8)}</h2>
            <div className="meta">
              {decodeSlug(item.raw.slug)} · {item.raw.lastTs ?? "—"}
              {item.raw.models.length ? ` · ${item.raw.models.join(", ")}` : ""}
            </div>
            <button className="back-btn" onClick={() => onPick(item.raw.slug, item.raw.sessionId)}>
              apri →
            </button>
          </>
        )}
      />
    </div>
  );
}
```

- [ ] **Step 3: Append session-list styles to `web/src/theme.css`**

```css
.sess-list { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }
.sess-item { padding: 10px 12px; border: 1px solid var(--line); border-radius: 6px;
  cursor: pointer; transition: border-color .12s ease, background .12s ease, box-shadow .12s ease; }
.sess-item:hover { border-color: rgba(46,230,192,.3);
  background: rgba(46,230,192,.04); box-shadow: 0 0 0 1px rgba(46,230,192,.18); }
.sess-id { font-family: "IBM Plex Mono"; color: var(--cy); font-size: 13px; }
.sess-meta { font-size: 12px; color: var(--txt); margin-top: 4px; }
.sess-ts { font-size: 11px; color: var(--mut); margin-top: 4px; }
```

- [ ] **Step 4: Typecheck** → exit 0.

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/ProjectsPage.tsx web/src/pages/SessionsPage.tsx web/src/theme.css
git commit -m "feat(web): projects page (drill into sessions) + flat sessions page"
```

---

## Task 13: Routing — nav labels → pages

**Files:** modify `web/src/App.tsx`.

- [ ] **Step 1: Update `web/src/App.tsx`** — add imports and routes.

Add imports:
```tsx
import { ProjectsPage } from "./pages/ProjectsPage.js";
import { SessionsPage } from "./pages/SessionsPage.js";
```

Update `PAGES` map (add two entries; keep existing entries):
```tsx
const PAGES: Record<string, () => ReactNode> = {
  "System prompt": () => <InstructionsPage />,
  "Skills": () => <SkillsPage />,
  "Agents": () => <AgentsPage />,
  "Commands": () => <CommandsPage />,
  "Memories": () => <MemoriesPage />,
  "Hooks · Perms · Env": () => <HooksPermsEnvPage />,
  "Plugins": () => <PluginsPage />,
  "Projects": () => <ProjectsPage />,
  "Sessions · History": () => <SessionsPage />,
};
```

- [ ] **Step 2: Verify e2e** — typecheck + build + smoke.

```bash
cd web && npx tsc --noEmit -p tsconfig.json && cd ..
npm run build --workspace web
```
Then run dev server + dev web; click "Projects" (sees your real projects with session counts), pick one (sees session list), click a session (sees event stream + chips). Stop both.

- [ ] **Step 3: Commit**

```bash
git add web/src/App.tsx
git commit -m "feat(web): route Projects and Sessions · History nav items"
```

---

## Self-Review

**Spec coverage:**
- Parser types (`SessionEvent`, `ExecutionNode`, `SessionMeta`) → Task 1. ✓
- jsonl incremental reader → Task 2. ✓
- Event normalizer (assistant content blocks, tool_use derivations for Task/Skill, user tool_result) → Task 3. ✓
- Execution tree via `parentUuid` → Task 4. ✓
- Transcript composer producing events + tree + meta → Task 5. ✓
- Projects reader with session counts + last activity → Task 6. ✓
- Sessions reader per project + single-session reader → Task 7. ✓
- API endpoints — `/projects`, `/projects/:slug/sessions`, `/sessions/:slug/:id` → Task 8. ✓
- Web types + endpoint helpers + vite proxy update → Task 9. ✓
- Event-stream component → Task 10. ✓
- Session detail page → Task 11. ✓
- Projects + Sessions pages → Task 12. ✓
- Nav routing wired → Task 13. ✓
- Graph replay deferred to Slice 2.5 — noted in Goal/Architecture.

**Placeholder scan:** every code step ships full code. Tests use real fs.

**Type consistency:** `SessionEvent` discriminant `kind` matches between server and web; `ProjectItem`, `SessionListItem`, `SessionMeta`, `Transcript` mirrored. `ENDPOINTS` helpers used everywhere. Vite proxy regex updated alongside endpoint additions.

---

## Out of scope (next plans)

- **Slice 2.5** — Graph replay component (`<TranscriptGraph events={…} tree={…} />`) shown in `SessionDetailPage`.
- **Slice 3** — Live (`watcher` + WebSocket + real-time graph + reasoning rail).
- **Slice 4** — Export bundle (will include `profile.json` + selected configs).
- **Slice 1.6** — Wire the real `claude` CLI for `--with-claude`.
