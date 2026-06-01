# Introspect — Slice 1: Static Config Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Read-only inspection of Claude's static configuration sources — instructions (CLAUDE.md), agents, commands, skills, memories, plugins, and settings (hooks/permissions/env) — exposed via REST endpoints and rendered in the existing web shell as List+Detail pages.

**Architecture:** Each source has a small focused reader in `server/src/readers/`. Shared utilities — `markdownDir` (lists `*.md` with parsed frontmatter via `gray-matter`) and `secrets` (key-based redaction) — are TDD'd first and reused. Readers consume the `ResolvedRoot[]` produced by `resolveSources` (Slice 0) and aggregate items across roots. The API exposes one endpoint per source. The web side adds a tiny `useEndpoint` hook, a reusable `<ListDetail>` component themed with the existing Observatory tokens, one page per source, and label-based routing in `App.tsx`. Note: the transcript `parser/` belongs to Slice 2 (it powers the Sessions/Live views, not the static config pages) and is **not** in this slice.

**Tech Stack:** Node 20+, TypeScript, Fastify, Vitest, `gray-matter` (new dep), Vite, React.

This is the second plan in the introspect series. Slice 0 (foundation: monorepo, `sources/`, API skeleton, web shell) is complete on branch `slice-0-foundation`. **This slice runs on a new branch `slice-1-static-config`.**

---

## File Structure

```
server/src/
├── readers/
│   ├── markdownDir.ts                # list *.md in a dir, parse frontmatter
│   ├── secrets.ts                    # redactSecrets() — key-based
│   ├── instructions.ts               # CLAUDE.md per root
│   ├── agents.ts                     # agents/*.md per root
│   ├── commands.ts                   # commands/*.md per root
│   ├── skills.ts                     # plugins/**/SKILL.md (capped depth)
│   ├── memories.ts                   # files at the memories path
│   ├── plugins.ts                    # installed_plugins.json
│   ├── settings.ts                   # settings.json (+ .local) with redaction
│   └── __tests__/
│       ├── markdownDir.test.ts
│       ├── secrets.test.ts
│       ├── instructions.test.ts
│       ├── agents.test.ts
│       ├── commands.test.ts
│       ├── skills.test.ts
│       ├── memories.test.ts
│       ├── plugins.test.ts
│       └── settings.test.ts
└── api/server.ts                     # add 7 endpoints + integration test

web/src/
├── api.ts                            # endpoint URLs + shared types
├── useEndpoint.ts                    # generic fetch hook
├── components/
│   └── ListDetail.tsx                # left list + right detail panel
├── pages/
│   ├── InstructionsPage.tsx
│   ├── AgentsPage.tsx
│   ├── CommandsPage.tsx
│   ├── SkillsPage.tsx
│   ├── MemoriesPage.tsx
│   ├── PluginsPage.tsx
│   ├── HooksPermsEnvPage.tsx
│   └── PlaceholderPage.tsx           # for labels not in this slice
├── App.tsx                           # MODIFY: route active label → page
└── theme.css                         # MODIFY: list-detail styles
```

Each file has one responsibility. Readers are independent and parallel-shaped. Pages are thin wrappers around `<ListDetail>` + `useEndpoint`.

---

## Task 1: Branch + add gray-matter dependency

**Files:**
- Modify: `server/package.json`

- [ ] **Step 1: Create slice branch from current `slice-0-foundation`**

```bash
cd /Users/marcello.barile/src/mine/introspect
git checkout -b slice-1-static-config
```

- [ ] **Step 2: Add `gray-matter` to server dependencies**

Edit `server/package.json` `dependencies` to add `"gray-matter": "^4.0.3"`. The resulting `dependencies` block:

```json
  "dependencies": {
    "fastify": "^5.2.0",
    "gray-matter": "^4.0.3"
  },
```

- [ ] **Step 3: Install**

Run: `npm install`
Expected: `gray-matter` resolves; existing tests still pass.

- [ ] **Step 4: Verify nothing regressed**

Run: `npm test --workspace server`
Expected: PASS — 15/15 (unchanged from Slice 0).

- [ ] **Step 5: Commit**

```bash
git add server/package.json package-lock.json
git commit -m "chore(server): add gray-matter for frontmatter parsing"
```

---

## Task 2: `markdownDir` utility

**Files:**
- Create: `server/src/readers/markdownDir.ts`
- Test: `server/src/readers/__tests__/markdownDir.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readMarkdownDir } from "../markdownDir.js";

describe("readMarkdownDir", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "md-dir-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns [] when the directory does not exist", () => {
    expect(readMarkdownDir(join(dir, "nope"))).toEqual([]);
  });

  it("lists .md files with parsed frontmatter and body preview, sorted by name", () => {
    writeFileSync(
      join(dir, "b.md"),
      "---\nname: bravo\ndescription: B does B\n---\nBravo body content here.\n"
    );
    writeFileSync(
      join(dir, "a.md"),
      "---\nname: alpha\n---\nAlpha body that is long enough to be previewed up to ~200 chars but not longer in this fixture.\n"
    );
    writeFileSync(join(dir, "ignore.txt"), "skip me");

    const items = readMarkdownDir(dir);
    expect(items.map((i) => i.name)).toEqual(["a", "b"]);
    expect(items[0]!.meta).toEqual({ name: "alpha" });
    expect(items[0]!.path).toBe(join(dir, "a.md"));
    expect(items[0]!.body.startsWith("Alpha body")).toBe(true);
    expect(items[0]!.bodyPreview.length).toBeLessThanOrEqual(200);
    expect(items[1]!.meta).toEqual({ name: "bravo", description: "B does B" });
  });

  it("returns body and empty meta when there is no frontmatter", () => {
    writeFileSync(join(dir, "plain.md"), "no frontmatter here, just body.");
    const items = readMarkdownDir(dir);
    expect(items).toHaveLength(1);
    expect(items[0]!.meta).toEqual({});
    expect(items[0]!.body).toBe("no frontmatter here, just body.");
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test --workspace server -- markdownDir`
Expected: FAIL — `Cannot find module '../markdownDir.js'`.

- [ ] **Step 3: Implement `markdownDir.ts`**

```ts
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import matter from "gray-matter";

export interface MarkdownItem {
  /** Filename without the `.md` extension. */
  name: string;
  /** Absolute path to the file. */
  path: string;
  /** Parsed YAML frontmatter (empty object if absent). */
  meta: Record<string, unknown>;
  /** Markdown body (without frontmatter). */
  body: string;
  /** First ~200 characters of the body, single-line, trimmed. */
  bodyPreview: string;
}

const PREVIEW_LIMIT = 200;

/** List `*.md` files in a directory, parse frontmatter, sort by name. */
export function readMarkdownDir(dirPath: string): MarkdownItem[] {
  if (!existsSync(dirPath)) return [];
  const entries = readdirSync(dirPath);
  const items: MarkdownItem[] = [];
  for (const entry of entries) {
    if (!entry.endsWith(".md")) continue;
    const path = join(dirPath, entry);
    if (!statSync(path).isFile()) continue;
    const raw = readFileSync(path, "utf8");
    const parsed = matter(raw);
    const body = parsed.content.trimStart();
    items.push({
      name: entry.slice(0, -3),
      path,
      meta: parsed.data ?? {},
      body,
      bodyPreview: body.replace(/\s+/g, " ").trim().slice(0, PREVIEW_LIMIT),
    });
  }
  items.sort((a, b) => a.name.localeCompare(b.name));
  return items;
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npm test --workspace server`
Expected: PASS — all prior + 3 new (markdownDir).

- [ ] **Step 5: Commit**

```bash
git add server/src/readers/markdownDir.ts server/src/readers/__tests__/markdownDir.test.ts
git commit -m "feat(readers): markdownDir lists *.md with parsed frontmatter"
```

---

## Task 3: `secrets` redaction utility

**Files:**
- Create: `server/src/readers/secrets.ts`
- Test: `server/src/readers/__tests__/secrets.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { redactSecrets } from "../secrets.js";

describe("redactSecrets", () => {
  it("redacts string values for keys that look secret", () => {
    const input = {
      apiKey: "abc123",
      token: "xyz",
      password: "pw",
      auth_secret: "s",
      nested: { authToken: "t", harmless: "ok" },
      array: [{ secretValue: "shh" }],
    };
    const { value, redactedKeys } = redactSecrets(input);
    expect(value).toEqual({
      apiKey: "[REDACTED]",
      token: "[REDACTED]",
      password: "[REDACTED]",
      auth_secret: "[REDACTED]",
      nested: { authToken: "[REDACTED]", harmless: "ok" },
      array: [{ secretValue: "[REDACTED]" }],
    });
    expect(redactedKeys.sort()).toEqual(
      ["apiKey", "array[0].secretValue", "auth_secret", "nested.authToken", "password", "token"].sort()
    );
  });

  it("leaves non-string secret-key values alone but records the key", () => {
    const { value, redactedKeys } = redactSecrets({ token: 0, ok: 1 });
    expect(value).toEqual({ token: "[REDACTED]", ok: 1 });
    expect(redactedKeys).toEqual(["token"]);
  });

  it("returns an empty redactedKeys list when nothing matches", () => {
    const { value, redactedKeys } = redactSecrets({ a: 1, b: { c: "ok" } });
    expect(value).toEqual({ a: 1, b: { c: "ok" } });
    expect(redactedKeys).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test --workspace server -- secrets`
Expected: FAIL — `Cannot find module '../secrets.js'`.

- [ ] **Step 3: Implement `secrets.ts`**

```ts
/** Keys whose values are redacted by default (case-insensitive substring). */
const SECRET_PATTERNS = [/token/i, /secret/i, /password/i, /apikey/i, /api[-_]?key/i, /auth/i];

export interface Redacted<T> {
  value: T;
  /** Dotted/bracketed paths to keys that were redacted. */
  redactedKeys: string[];
}

function isSecretKey(key: string): boolean {
  return SECRET_PATTERNS.some((re) => re.test(key));
}

/** Deep-clone-and-redact: replaces secret values with "[REDACTED]". */
export function redactSecrets<T>(input: T): Redacted<T> {
  const redactedKeys: string[] = [];
  function walk(node: unknown, path: string): unknown {
    if (node === null || typeof node !== "object") return node;
    if (Array.isArray(node)) {
      return node.map((item, i) => walk(item, `${path}[${i}]`));
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node)) {
      const childPath = path === "" ? k : `${path}.${k}`;
      if (isSecretKey(k)) {
        redactedKeys.push(childPath);
        out[k] = "[REDACTED]";
      } else {
        out[k] = walk(v, childPath);
      }
    }
    return out;
  }
  return { value: walk(input, "") as T, redactedKeys };
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npm test --workspace server`
Expected: PASS — all prior + 3 new (secrets).

- [ ] **Step 5: Commit**

```bash
git add server/src/readers/secrets.ts server/src/readers/__tests__/secrets.test.ts
git commit -m "feat(readers): redactSecrets utility"
```

---

## Task 4: `instructions` reader (CLAUDE.md)

**Files:**
- Create: `server/src/readers/instructions.ts`
- Test: `server/src/readers/__tests__/instructions.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readInstructions } from "../instructions.js";
import type { ResolvedRoot } from "../../sources/types.js";

function rootOf(dir: string): ResolvedRoot {
  return {
    root: { declaredPath: dir, realPath: realpathSync(dir), inode: 0 },
    sources: [],
  };
}

describe("readInstructions", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "instr-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns the CLAUDE.md content when present", () => {
    writeFileSync(join(dir, "CLAUDE.md"), "# Hello\nbody");
    const items = readInstructions([rootOf(dir)]);
    expect(items).toHaveLength(1);
    expect(items[0]!.content).toBe("# Hello\nbody");
    expect(items[0]!.path).toBe(join(realpathSync(dir), "CLAUDE.md"));
  });

  it("skips roots without a CLAUDE.md", () => {
    const items = readInstructions([rootOf(dir)]);
    expect(items).toEqual([]);
  });

  it("aggregates across multiple roots", () => {
    const a = mkdtempSync(join(tmpdir(), "instr-a-"));
    const b = mkdtempSync(join(tmpdir(), "instr-b-"));
    writeFileSync(join(a, "CLAUDE.md"), "A");
    writeFileSync(join(b, "CLAUDE.md"), "B");
    try {
      const items = readInstructions([rootOf(a), rootOf(b)]);
      expect(items.map((i) => i.content).sort()).toEqual(["A", "B"]);
    } finally {
      rmSync(a, { recursive: true, force: true });
      rmSync(b, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test --workspace server -- instructions`
Expected: FAIL — `Cannot find module '../instructions.js'`.

- [ ] **Step 3: Implement `instructions.ts`**

```ts
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ResolvedRoot } from "../sources/types.js";

export interface InstructionsItem {
  rootPath: string;
  path: string;
  content: string;
}

const FILENAME = "CLAUDE.md";

/** Read CLAUDE.md from each resolved root that has one. */
export function readInstructions(roots: ResolvedRoot[]): InstructionsItem[] {
  const out: InstructionsItem[] = [];
  for (const { root } of roots) {
    const path = join(root.realPath, FILENAME);
    if (!existsSync(path)) continue;
    out.push({ rootPath: root.realPath, path, content: readFileSync(path, "utf8") });
  }
  return out;
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npm test --workspace server`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/readers/instructions.ts server/src/readers/__tests__/instructions.test.ts
git commit -m "feat(readers): instructions reader (CLAUDE.md per root)"
```

---

## Task 5: `agents` reader

**Files:**
- Create: `server/src/readers/agents.ts`
- Test: `server/src/readers/__tests__/agents.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readAgents } from "../agents.js";
import type { ResolvedRoot } from "../../sources/types.js";

function rootOf(dir: string): ResolvedRoot {
  return {
    root: { declaredPath: dir, realPath: realpathSync(dir), inode: 0 },
    sources: [],
  };
}

describe("readAgents", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "agents-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns [] when the agents dir is absent", () => {
    expect(readAgents([rootOf(dir)])).toEqual([]);
  });

  it("returns agent items with name, description, tools from frontmatter", () => {
    mkdirSync(join(dir, "agents"));
    writeFileSync(
      join(dir, "agents", "code-reviewer.md"),
      "---\nname: code-reviewer\ndescription: Reviews diffs\ntools: Read, Grep\n---\nbody"
    );
    const items = readAgents([rootOf(dir)]);
    expect(items).toHaveLength(1);
    expect(items[0]!.name).toBe("code-reviewer");
    expect(items[0]!.description).toBe("Reviews diffs");
    expect(items[0]!.tools).toBe("Read, Grep");
    expect(items[0]!.rootPath).toBe(realpathSync(dir));
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test --workspace server -- agents`
Expected: FAIL — `Cannot find module '../agents.js'`.

- [ ] **Step 3: Implement `agents.ts`**

```ts
import { join } from "node:path";
import { readMarkdownDir } from "./markdownDir.js";
import type { ResolvedRoot } from "../sources/types.js";

export interface AgentItem {
  rootPath: string;
  path: string;
  name: string;
  description: string;
  tools: string;
  bodyPreview: string;
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** Read agent definitions from `<root>/agents/*.md`. */
export function readAgents(roots: ResolvedRoot[]): AgentItem[] {
  const out: AgentItem[] = [];
  for (const { root } of roots) {
    const items = readMarkdownDir(join(root.realPath, "agents"));
    for (const it of items) {
      out.push({
        rootPath: root.realPath,
        path: it.path,
        name: asString(it.meta.name) || it.name,
        description: asString(it.meta.description),
        tools: asString(it.meta.tools),
        bodyPreview: it.bodyPreview,
      });
    }
  }
  return out;
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npm test --workspace server`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/readers/agents.ts server/src/readers/__tests__/agents.test.ts
git commit -m "feat(readers): agents reader (agents/*.md per root)"
```

---

## Task 6: `commands` reader

**Files:**
- Create: `server/src/readers/commands.ts`
- Test: `server/src/readers/__tests__/commands.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readCommands } from "../commands.js";
import type { ResolvedRoot } from "../../sources/types.js";

function rootOf(dir: string): ResolvedRoot {
  return {
    root: { declaredPath: dir, realPath: realpathSync(dir), inode: 0 },
    sources: [],
  };
}

describe("readCommands", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "commands-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns [] when the commands dir is absent", () => {
    expect(readCommands([rootOf(dir)])).toEqual([]);
  });

  it("returns slash-command items with description from frontmatter", () => {
    mkdirSync(join(dir, "commands"));
    writeFileSync(
      join(dir, "commands", "decision.md"),
      "---\ndescription: Record a decision\n---\nuse it like /decision"
    );
    const items = readCommands([rootOf(dir)]);
    expect(items).toHaveLength(1);
    expect(items[0]!.name).toBe("decision");
    expect(items[0]!.description).toBe("Record a decision");
    expect(items[0]!.bodyPreview.startsWith("use it like")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test --workspace server -- commands`
Expected: FAIL — `Cannot find module '../commands.js'`.

- [ ] **Step 3: Implement `commands.ts`**

```ts
import { join } from "node:path";
import { readMarkdownDir } from "./markdownDir.js";
import type { ResolvedRoot } from "../sources/types.js";

export interface CommandItem {
  rootPath: string;
  path: string;
  name: string;
  description: string;
  bodyPreview: string;
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** Read slash commands from `<root>/commands/*.md`. */
export function readCommands(roots: ResolvedRoot[]): CommandItem[] {
  const out: CommandItem[] = [];
  for (const { root } of roots) {
    const items = readMarkdownDir(join(root.realPath, "commands"));
    for (const it of items) {
      out.push({
        rootPath: root.realPath,
        path: it.path,
        name: it.name,
        description: asString(it.meta.description),
        bodyPreview: it.bodyPreview,
      });
    }
  }
  return out;
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npm test --workspace server`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/readers/commands.ts server/src/readers/__tests__/commands.test.ts
git commit -m "feat(readers): commands reader (commands/*.md per root)"
```

---

## Task 7: `skills` reader (capped recursive SKILL.md walk)

**Files:**
- Create: `server/src/readers/skills.ts`
- Test: `server/src/readers/__tests__/skills.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readSkills } from "../skills.js";
import type { ResolvedRoot } from "../../sources/types.js";

function rootOf(dir: string): ResolvedRoot {
  return {
    root: { declaredPath: dir, realPath: realpathSync(dir), inode: 0 },
    sources: [],
  };
}

describe("readSkills", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "skills-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns [] when no plugins dir exists", () => {
    expect(readSkills([rootOf(dir)])).toEqual([]);
  });

  it("finds SKILL.md files up to the depth cap and parses frontmatter", () => {
    const pluginsDir = join(dir, "plugins");
    mkdirSync(join(pluginsDir, "p1", "skills", "alpha"), { recursive: true });
    writeFileSync(
      join(pluginsDir, "p1", "skills", "alpha", "SKILL.md"),
      "---\nname: alpha\ndescription: Does alpha\n---\nbody"
    );
    mkdirSync(join(pluginsDir, "p2", "skills", "beta"), { recursive: true });
    writeFileSync(
      join(pluginsDir, "p2", "skills", "beta", "SKILL.md"),
      "---\nname: beta\n---\nbody2"
    );

    const items = readSkills([rootOf(dir)]).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
    expect(items.map((i) => i.name)).toEqual(["alpha", "beta"]);
    expect(items[0]!.description).toBe("Does alpha");
    expect(items[0]!.path.endsWith("SKILL.md")).toBe(true);
  });

  it("does not descend past the depth cap (4)", () => {
    const deep = join(dir, "plugins", "a", "b", "c", "d", "e");
    mkdirSync(deep, { recursive: true });
    writeFileSync(join(deep, "SKILL.md"), "---\nname: too-deep\n---\nx");
    expect(readSkills([rootOf(dir)])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test --workspace server -- skills`
Expected: FAIL — `Cannot find module '../skills.js'`.

- [ ] **Step 3: Implement `skills.ts`**

```ts
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import matter from "gray-matter";
import type { ResolvedRoot } from "../sources/types.js";

export interface SkillItem {
  rootPath: string;
  path: string;
  name: string;
  description: string;
  bodyPreview: string;
}

const SKILL_FILE = "SKILL.md";
/** Max nesting depth from the plugins root to look for SKILL.md. */
const MAX_DEPTH = 4;
const PREVIEW_LIMIT = 200;

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function walk(dir: string, depth: number, out: string[]): void {
  if (depth > MAX_DEPTH) return;
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      walk(p, depth + 1, out);
    } else if (entry === SKILL_FILE) {
      out.push(p);
    }
  }
}

/** Read skill definitions from `<root>/plugins/**\/SKILL.md`, capped depth. */
export function readSkills(roots: ResolvedRoot[]): SkillItem[] {
  const out: SkillItem[] = [];
  for (const { root } of roots) {
    const pluginsDir = join(root.realPath, "plugins");
    const files: string[] = [];
    walk(pluginsDir, 0, files);
    for (const path of files) {
      const raw = readFileSync(path, "utf8");
      const parsed = matter(raw);
      const meta = parsed.data ?? {};
      const body = parsed.content.trimStart();
      out.push({
        rootPath: root.realPath,
        path,
        name: asString(meta.name) || path,
        description: asString(meta.description),
        bodyPreview: body.replace(/\s+/g, " ").trim().slice(0, PREVIEW_LIMIT),
      });
    }
  }
  return out;
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npm test --workspace server`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/readers/skills.ts server/src/readers/__tests__/skills.test.ts
git commit -m "feat(readers): skills reader (plugins/**/SKILL.md, capped depth)"
```

---

## Task 8: `memories` reader

**Files:**
- Create: `server/src/readers/memories.ts`
- Test: `server/src/readers/__tests__/memories.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readMemories } from "../memories.js";
import type { ResolvedRoot } from "../../sources/types.js";

function rootOf(dir: string): ResolvedRoot {
  return {
    root: { declaredPath: dir, realPath: realpathSync(dir), inode: 0 },
    sources: [],
  };
}

describe("readMemories", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "memories-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns [] when the memory dir is absent", () => {
    expect(readMemories([rootOf(dir)])).toEqual([]);
  });

  it("lists immediate .md children with previews", () => {
    mkdirSync(join(dir, "memory"));
    writeFileSync(join(dir, "memory", "note.md"), "---\nname: note\n---\nthe note body");
    writeFileSync(join(dir, "memory", "ignore.bin"), "x");
    const items = readMemories([rootOf(dir)]);
    expect(items).toHaveLength(1);
    expect(items[0]!.name).toBe("note");
    expect(items[0]!.bodyPreview.startsWith("the note body")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test --workspace server -- memories`
Expected: FAIL — `Cannot find module '../memories.js'`.

- [ ] **Step 3: Implement `memories.ts`**

```ts
import { join } from "node:path";
import { readMarkdownDir } from "./markdownDir.js";
import type { ResolvedRoot } from "../sources/types.js";

export interface MemoryItem {
  rootPath: string;
  path: string;
  name: string;
  meta: Record<string, unknown>;
  bodyPreview: string;
}

/** Immediate `.md` children of `<root>/memory/`. Convention-variable; refined
 * by the discovery profile in Slice 1.5. */
export function readMemories(roots: ResolvedRoot[]): MemoryItem[] {
  const out: MemoryItem[] = [];
  for (const { root } of roots) {
    const items = readMarkdownDir(join(root.realPath, "memory"));
    for (const it of items) {
      out.push({
        rootPath: root.realPath,
        path: it.path,
        name: it.name,
        meta: it.meta,
        bodyPreview: it.bodyPreview,
      });
    }
  }
  return out;
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npm test --workspace server`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/readers/memories.ts server/src/readers/__tests__/memories.test.ts
git commit -m "feat(readers): memories reader (memory/*.md per root)"
```

---

## Task 9: `plugins` reader

**Files:**
- Create: `server/src/readers/plugins.ts`
- Test: `server/src/readers/__tests__/plugins.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readPlugins } from "../plugins.js";
import type { ResolvedRoot } from "../../sources/types.js";

function rootOf(dir: string): ResolvedRoot {
  return {
    root: { declaredPath: dir, realPath: realpathSync(dir), inode: 0 },
    sources: [],
  };
}

describe("readPlugins", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "plugins-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns [] when installed_plugins.json is absent", () => {
    expect(readPlugins([rootOf(dir)])).toEqual([]);
  });

  it("returns plugin entries normalized from installed_plugins.json (object form)", () => {
    mkdirSync(join(dir, "plugins"));
    writeFileSync(
      join(dir, "plugins", "installed_plugins.json"),
      JSON.stringify({
        "superpowers@official": { source: "official", enabled: true, version: "5.1.0" },
        "figma@official": { source: "official", enabled: false },
      })
    );
    const items = readPlugins([rootOf(dir)]).sort((a, b) => a.id.localeCompare(b.id));
    expect(items.map((i) => i.id)).toEqual(["figma@official", "superpowers@official"]);
    expect(items[1]!.enabled).toBe(true);
    expect(items[1]!.version).toBe("5.1.0");
  });

  it("returns plugin entries normalized from installed_plugins.json (array form)", () => {
    mkdirSync(join(dir, "plugins"));
    writeFileSync(
      join(dir, "plugins", "installed_plugins.json"),
      JSON.stringify([{ id: "p1", source: "x", enabled: true }])
    );
    const items = readPlugins([rootOf(dir)]);
    expect(items).toEqual([
      { rootPath: realpathSync(dir), id: "p1", source: "x", enabled: true, version: "" },
    ]);
  });

  it("returns [] and does not throw when JSON is malformed", () => {
    mkdirSync(join(dir, "plugins"));
    writeFileSync(join(dir, "plugins", "installed_plugins.json"), "{ not json");
    expect(readPlugins([rootOf(dir)])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test --workspace server -- plugins`
Expected: FAIL — `Cannot find module '../plugins.js'`.

- [ ] **Step 3: Implement `plugins.ts`**

```ts
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ResolvedRoot } from "../sources/types.js";

export interface PluginItem {
  rootPath: string;
  id: string;
  source: string;
  enabled: boolean;
  version: string;
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function asBool(v: unknown): boolean {
  return v === true;
}

function normalizeRecord(rootPath: string, id: string, raw: unknown): PluginItem | null {
  if (raw === null || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  return {
    rootPath,
    id,
    source: asString(obj.source),
    enabled: asBool(obj.enabled),
    version: asString(obj.version),
  };
}

/** Read installed plugins from `<root>/plugins/installed_plugins.json`. */
export function readPlugins(roots: ResolvedRoot[]): PluginItem[] {
  const out: PluginItem[] = [];
  for (const { root } of roots) {
    const path = join(root.realPath, "plugins", "installed_plugins.json");
    if (!existsSync(path)) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(path, "utf8"));
    } catch {
      continue;
    }
    if (Array.isArray(parsed)) {
      for (const entry of parsed) {
        if (entry === null || typeof entry !== "object") continue;
        const obj = entry as Record<string, unknown>;
        const id = asString(obj.id);
        if (!id) continue;
        const item = normalizeRecord(root.realPath, id, obj);
        if (item) out.push(item);
      }
    } else if (parsed !== null && typeof parsed === "object") {
      for (const [id, entry] of Object.entries(parsed as Record<string, unknown>)) {
        const item = normalizeRecord(root.realPath, id, entry);
        if (item) out.push(item);
      }
    }
  }
  return out;
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npm test --workspace server`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/readers/plugins.ts server/src/readers/__tests__/plugins.test.ts
git commit -m "feat(readers): plugins reader (installed_plugins.json)"
```

---

## Task 10: `settings` reader (hooks · permissions · env, redacted)

**Files:**
- Create: `server/src/readers/settings.ts`
- Test: `server/src/readers/__tests__/settings.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readSettings } from "../settings.js";
import type { ResolvedRoot } from "../../sources/types.js";

function rootOf(dir: string): ResolvedRoot {
  return {
    root: { declaredPath: dir, realPath: realpathSync(dir), inode: 0 },
    sources: [],
  };
}

describe("readSettings", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "settings-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns [] when no settings.json exists", () => {
    expect(readSettings([rootOf(dir)])).toEqual([]);
  });

  it("returns hooks, permissions, env separated, with secrets redacted by default", () => {
    writeFileSync(
      join(dir, "settings.json"),
      JSON.stringify({
        hooks: { SessionStart: [{ command: "x" }] },
        permissions: { allow: ["Bash"] },
        env: { ANTHROPIC_API_KEY: "secret", DEBUG: "1" },
        other: "kept",
      })
    );
    const items = readSettings([rootOf(dir)]);
    expect(items).toHaveLength(1);
    const it = items[0]!;
    expect(it.fileName).toBe("settings.json");
    expect(it.hooks).toEqual({ SessionStart: [{ command: "x" }] });
    expect(it.permissions).toEqual({ allow: ["Bash"] });
    expect(it.env).toEqual({ ANTHROPIC_API_KEY: "[REDACTED]", DEBUG: "1" });
    expect(it.other).toEqual({ other: "kept" });
    expect(it.redactedKeys).toContain("env.ANTHROPIC_API_KEY");
  });

  it("emits one item per settings file present (settings.json and settings.local.json)", () => {
    writeFileSync(join(dir, "settings.json"), JSON.stringify({ env: { A: "1" } }));
    writeFileSync(join(dir, "settings.local.json"), JSON.stringify({ env: { B: "2" } }));
    const items = readSettings([rootOf(dir)]).sort((a, b) =>
      a.fileName.localeCompare(b.fileName)
    );
    expect(items.map((i) => i.fileName)).toEqual(["settings.json", "settings.local.json"]);
  });

  it("skips malformed JSON without throwing", () => {
    writeFileSync(join(dir, "settings.json"), "{not json");
    expect(readSettings([rootOf(dir)])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test --workspace server -- settings`
Expected: FAIL — `Cannot find module '../settings.js'`.

- [ ] **Step 3: Implement `settings.ts`**

```ts
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { redactSecrets } from "./secrets.js";
import type { ResolvedRoot } from "../sources/types.js";

export interface SettingsItem {
  rootPath: string;
  fileName: string;
  path: string;
  hooks: Record<string, unknown>;
  permissions: Record<string, unknown>;
  env: Record<string, unknown>;
  other: Record<string, unknown>;
  redactedKeys: string[];
}

const FILENAMES = ["settings.json", "settings.local.json"];

function partition(obj: Record<string, unknown>): {
  hooks: Record<string, unknown>;
  permissions: Record<string, unknown>;
  env: Record<string, unknown>;
  other: Record<string, unknown>;
} {
  const hooks = (obj.hooks as Record<string, unknown>) ?? {};
  const permissions = (obj.permissions as Record<string, unknown>) ?? {};
  const env = (obj.env as Record<string, unknown>) ?? {};
  const other: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k === "hooks" || k === "permissions" || k === "env") continue;
    other[k] = v;
  }
  return { hooks, permissions, env, other };
}

/** Read settings.json and settings.local.json per root, redacting secrets. */
export function readSettings(roots: ResolvedRoot[]): SettingsItem[] {
  const out: SettingsItem[] = [];
  for (const { root } of roots) {
    for (const fileName of FILENAMES) {
      const path = join(root.realPath, fileName);
      if (!existsSync(path)) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(readFileSync(path, "utf8"));
      } catch {
        continue;
      }
      if (parsed === null || typeof parsed !== "object") continue;
      const partitioned = partition(parsed as Record<string, unknown>);
      const { value, redactedKeys } = redactSecrets({
        hooks: partitioned.hooks,
        permissions: partitioned.permissions,
        env: partitioned.env,
        other: partitioned.other,
      });
      out.push({
        rootPath: root.realPath,
        fileName,
        path,
        hooks: value.hooks as Record<string, unknown>,
        permissions: value.permissions as Record<string, unknown>,
        env: value.env as Record<string, unknown>,
        other: value.other as Record<string, unknown>,
        redactedKeys,
      });
    }
  }
  return out;
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npm test --workspace server`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/readers/settings.ts server/src/readers/__tests__/settings.test.ts
git commit -m "feat(readers): settings reader with secret redaction"
```

---

## Task 11: API endpoints for all readers + integration test

**Files:**
- Modify: `server/src/api/server.ts`
- Modify: `server/src/api/server.test.ts`

- [ ] **Step 1: Append failing integration tests**

Add these tests at the end of the existing `describe("buildServer", ...)` block in `server/src/api/server.test.ts` (keep existing tests intact):

```ts
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
```

- [ ] **Step 2: Run, verify FAIL**

Run: `npm test --workspace server -- server`
Expected: FAIL — 404 on each unimplemented path.

- [ ] **Step 3: Modify `server/src/api/server.ts`** to register the endpoints. Replace its full contents with:

```ts
import Fastify, { type FastifyInstance } from "fastify";
import { resolveSources } from "../sources/index.js";
import type { ResolveOptions } from "../sources/index.js";
import { readInstructions } from "../readers/instructions.js";
import { readAgents } from "../readers/agents.js";
import { readCommands } from "../readers/commands.js";
import { readSkills } from "../readers/skills.js";
import { readMemories } from "../readers/memories.js";
import { readPlugins } from "../readers/plugins.js";
import { readSettings } from "../readers/settings.js";

/** Build the read-only API. `opts` are forwarded to the source resolver. */
export function buildServer(opts: ResolveOptions = {}): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get("/health", async () => ({ status: "ok" }));
  app.get("/sources", async () => resolveSources(opts));

  app.get("/instructions", async () => readInstructions(resolveSources(opts)));
  app.get("/agents", async () => readAgents(resolveSources(opts)));
  app.get("/commands", async () => readCommands(resolveSources(opts)));
  app.get("/skills", async () => readSkills(resolveSources(opts)));
  app.get("/memories", async () => readMemories(resolveSources(opts)));
  app.get("/plugins", async () => readPlugins(resolveSources(opts)));
  app.get("/settings", async () => readSettings(resolveSources(opts)));

  return app;
}
```

- [ ] **Step 4: Run, verify PASS**

Run: `npm test --workspace server`
Expected: PASS — all prior + the new integration test.

- [ ] **Step 5: Commit**

```bash
git add server/src/api/server.ts server/src/api/server.test.ts
git commit -m "feat(api): expose endpoints for instructions/agents/commands/skills/memories/plugins/settings"
```

---

## Task 12: Web — `api.ts` (endpoints + shared types) and `useEndpoint` hook

**Files:**
- Create: `web/src/api.ts`
- Create: `web/src/useEndpoint.ts`

- [ ] **Step 1: Create `web/src/api.ts`**

```ts
export interface InstructionsItem { rootPath: string; path: string; content: string; }
export interface AgentItem { rootPath: string; path: string; name: string; description: string; tools: string; bodyPreview: string; }
export interface CommandItem { rootPath: string; path: string; name: string; description: string; bodyPreview: string; }
export interface SkillItem { rootPath: string; path: string; name: string; description: string; bodyPreview: string; }
export interface MemoryItem { rootPath: string; path: string; name: string; meta: Record<string, unknown>; bodyPreview: string; }
export interface PluginItem { rootPath: string; id: string; source: string; enabled: boolean; version: string; }
export interface SettingsItem {
  rootPath: string;
  fileName: string;
  path: string;
  hooks: Record<string, unknown>;
  permissions: Record<string, unknown>;
  env: Record<string, unknown>;
  other: Record<string, unknown>;
  redactedKeys: string[];
}

export const ENDPOINTS = {
  instructions: "/instructions",
  agents: "/agents",
  commands: "/commands",
  skills: "/skills",
  memories: "/memories",
  plugins: "/plugins",
  settings: "/settings",
} as const;
```

- [ ] **Step 2: Create `web/src/useEndpoint.ts`**

```ts
import { useEffect, useState } from "react";

export type EndpointState<T> =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "ready"; data: T };

/** Fetch JSON once on mount from a same-origin path. */
export function useEndpoint<T>(path: string): EndpointState<T> {
  const [state, setState] = useState<EndpointState<T>>({ status: "loading" });
  useEffect(() => {
    let cancelled = false;
    fetch(path)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as T;
        if (!cancelled) setState({ status: "ready", data });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({ status: "error", error: err instanceof Error ? err.message : String(err) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [path]);
  return state;
}
```

- [ ] **Step 3: Verify the web package still typechecks**

Run: `cd web && npx tsc --noEmit -p tsconfig.json`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add web/src/api.ts web/src/useEndpoint.ts
git commit -m "feat(web): api types and useEndpoint hook"
```

---

## Task 13: `<ListDetail>` component + theme additions

**Files:**
- Create: `web/src/components/ListDetail.tsx`
- Modify: `web/src/theme.css` (append the styles below)

- [ ] **Step 1: Create `web/src/components/ListDetail.tsx`**

```tsx
import { useState, type ReactNode } from "react";

export interface ListDetailItem {
  /** Stable identifier — also the React key. */
  id: string;
  /** Primary label shown in the list. */
  title: string;
  /** Secondary line shown under the title. */
  subtitle?: string;
}

export interface ListDetailProps<T extends ListDetailItem> {
  items: T[];
  /** Renders the right pane for the currently selected item. */
  renderDetail: (item: T) => ReactNode;
  /** Title shown above the list. */
  listTitle: string;
  /** Shown when items is empty. */
  emptyMessage?: string;
}

export function ListDetail<T extends ListDetailItem>({
  items,
  renderDetail,
  listTitle,
  emptyMessage = "Niente da mostrare.",
}: ListDetailProps<T>) {
  const [selectedId, setSelectedId] = useState<string | null>(items[0]?.id ?? null);
  const selected = items.find((i) => i.id === selectedId) ?? items[0];

  return (
    <div className="ld">
      <div className="ld-list">
        <div className="ld-list-title">{listTitle}</div>
        {items.length === 0 ? (
          <div className="ld-empty">{emptyMessage}</div>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className={`ld-item${item.id === (selected?.id ?? "") ? " on" : ""}`}
              onClick={() => setSelectedId(item.id)}
            >
              <div className="ld-item-title">{item.title}</div>
              {item.subtitle ? <div className="ld-item-sub">{item.subtitle}</div> : null}
            </div>
          ))
        )}
      </div>
      <div className="ld-detail">{selected ? renderDetail(selected) : null}</div>
    </div>
  );
}
```

- [ ] **Step 2: Append these styles to `web/src/theme.css`** (do not remove anything; just append):

```css
.ld { display: grid; grid-template-columns: 280px 1fr; gap: 18px; height: 100%; }
.ld-list { border-right: 1px solid var(--line); padding-right: 14px; overflow-y: auto; }
.ld-list-title { font-family: "Space Grotesk"; font-size: 11px; letter-spacing: .14em;
  text-transform: uppercase; color: var(--mut); padding-bottom: 10px;
  border-bottom: 1px solid var(--line); margin-bottom: 8px; }
.ld-item { padding: 8px 10px; border-radius: 6px; cursor: pointer; }
.ld-item:hover { background: rgba(46,230,192,.05); }
.ld-item.on { background: linear-gradient(90deg, rgba(46,230,192,.10), transparent);
  box-shadow: inset 2px 0 0 var(--cy); }
.ld-item-title { font-size: 12px; color: #e6f3f0; }
.ld-item-sub { font-size: 10px; color: var(--mut); margin-top: 2px;
  text-overflow: ellipsis; overflow: hidden; white-space: nowrap; }
.ld-empty { color: var(--mut); font-size: 12px; padding: 12px 4px; }
.ld-detail { overflow-y: auto; padding-right: 4px; }
.ld-detail h2 { font-family: "Space Grotesk"; font-size: 18px; color: #e6f3f0; margin-bottom: 6px; }
.ld-detail .meta { font-size: 11px; color: var(--mut); margin-bottom: 14px; }
.ld-detail pre, .ld-detail code { font-family: "IBM Plex Mono"; font-size: 12px;
  background: rgba(8,12,16,.6); border: 1px solid var(--line); border-radius: 6px;
  padding: 10px; color: #cdd9e1; overflow-x: auto; white-space: pre-wrap; }
.ld-detail .kv { display: grid; grid-template-columns: 140px 1fr; gap: 6px 12px; font-size: 12px; }
.ld-detail .kv dt { color: var(--mut); }
.ld-detail .kv dd { color: var(--txt); word-break: break-all; }
.canvas-body { height: calc(100% - 40px); margin-top: 12px; }
.loading, .error { color: var(--mut); font-size: 12px; padding: 12px 4px; }
.error { color: #ff6b6b; }
```

- [ ] **Step 3: Verify typecheck**

Run: `cd web && npx tsc --noEmit -p tsconfig.json`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/ListDetail.tsx web/src/theme.css
git commit -m "feat(web): ListDetail component and theme additions"
```

---

## Task 14: All seven pages

**Files:**
- Create: `web/src/pages/PlaceholderPage.tsx`
- Create: `web/src/pages/InstructionsPage.tsx`
- Create: `web/src/pages/AgentsPage.tsx`
- Create: `web/src/pages/CommandsPage.tsx`
- Create: `web/src/pages/SkillsPage.tsx`
- Create: `web/src/pages/MemoriesPage.tsx`
- Create: `web/src/pages/PluginsPage.tsx`
- Create: `web/src/pages/HooksPermsEnvPage.tsx`

- [ ] **Step 1: PlaceholderPage**

`web/src/pages/PlaceholderPage.tsx`:
```tsx
export function PlaceholderPage({ label }: { label: string }) {
  return (
    <div className="canvas-body">
      <div className="loading">"{label}" arriverà in una slice successiva.</div>
    </div>
  );
}
```

- [ ] **Step 2: InstructionsPage**

`web/src/pages/InstructionsPage.tsx`:
```tsx
import { ListDetail } from "../components/ListDetail.js";
import { useEndpoint } from "../useEndpoint.js";
import { ENDPOINTS, type InstructionsItem } from "../api.js";

export function InstructionsPage() {
  const state = useEndpoint<InstructionsItem[]>(ENDPOINTS.instructions);
  if (state.status === "loading") return <div className="loading">Caricamento…</div>;
  if (state.status === "error") return <div className="error">Errore: {state.error}</div>;

  const items = state.data.map((it) => ({
    id: it.path,
    title: it.path.split("/").slice(-2).join("/"),
    subtitle: it.rootPath,
    raw: it,
  }));

  return (
    <div className="canvas-body">
      <ListDetail
        items={items}
        listTitle="CLAUDE.md per config root"
        emptyMessage="Nessun CLAUDE.md trovato."
        renderDetail={(item) => (
          <>
            <h2>{item.title}</h2>
            <div className="meta">{item.raw.path}</div>
            <pre>{item.raw.content}</pre>
          </>
        )}
      />
    </div>
  );
}
```

- [ ] **Step 3: AgentsPage**

`web/src/pages/AgentsPage.tsx`:
```tsx
import { ListDetail } from "../components/ListDetail.js";
import { useEndpoint } from "../useEndpoint.js";
import { ENDPOINTS, type AgentItem } from "../api.js";

export function AgentsPage() {
  const state = useEndpoint<AgentItem[]>(ENDPOINTS.agents);
  if (state.status === "loading") return <div className="loading">Caricamento…</div>;
  if (state.status === "error") return <div className="error">Errore: {state.error}</div>;

  const items = state.data.map((it) => ({
    id: it.path,
    title: it.name,
    subtitle: it.description,
    raw: it,
  }));

  return (
    <div className="canvas-body">
      <ListDetail
        items={items}
        listTitle="Subagenti"
        emptyMessage="Nessun agente trovato."
        renderDetail={(item) => (
          <>
            <h2>{item.raw.name}</h2>
            <div className="meta">{item.raw.path}</div>
            <dl className="kv">
              <dt>description</dt><dd>{item.raw.description || "—"}</dd>
              <dt>tools</dt><dd>{item.raw.tools || "—"}</dd>
            </dl>
            <pre style={{ marginTop: 14 }}>{item.raw.bodyPreview}</pre>
          </>
        )}
      />
    </div>
  );
}
```

- [ ] **Step 4: CommandsPage**

`web/src/pages/CommandsPage.tsx`:
```tsx
import { ListDetail } from "../components/ListDetail.js";
import { useEndpoint } from "../useEndpoint.js";
import { ENDPOINTS, type CommandItem } from "../api.js";

export function CommandsPage() {
  const state = useEndpoint<CommandItem[]>(ENDPOINTS.commands);
  if (state.status === "loading") return <div className="loading">Caricamento…</div>;
  if (state.status === "error") return <div className="error">Errore: {state.error}</div>;

  const items = state.data.map((it) => ({
    id: it.path,
    title: `/${it.name}`,
    subtitle: it.description,
    raw: it,
  }));

  return (
    <div className="canvas-body">
      <ListDetail
        items={items}
        listTitle="Slash commands"
        emptyMessage="Nessun command trovato."
        renderDetail={(item) => (
          <>
            <h2>/{item.raw.name}</h2>
            <div className="meta">{item.raw.path}</div>
            <dl className="kv">
              <dt>description</dt><dd>{item.raw.description || "—"}</dd>
            </dl>
            <pre style={{ marginTop: 14 }}>{item.raw.bodyPreview}</pre>
          </>
        )}
      />
    </div>
  );
}
```

- [ ] **Step 5: SkillsPage**

`web/src/pages/SkillsPage.tsx`:
```tsx
import { ListDetail } from "../components/ListDetail.js";
import { useEndpoint } from "../useEndpoint.js";
import { ENDPOINTS, type SkillItem } from "../api.js";

export function SkillsPage() {
  const state = useEndpoint<SkillItem[]>(ENDPOINTS.skills);
  if (state.status === "loading") return <div className="loading">Caricamento…</div>;
  if (state.status === "error") return <div className="error">Errore: {state.error}</div>;

  const items = state.data.map((it) => ({
    id: it.path,
    title: it.name,
    subtitle: it.description,
    raw: it,
  }));

  return (
    <div className="canvas-body">
      <ListDetail
        items={items}
        listTitle="Skills"
        emptyMessage="Nessuna skill trovata."
        renderDetail={(item) => (
          <>
            <h2>{item.raw.name}</h2>
            <div className="meta">{item.raw.path}</div>
            <dl className="kv">
              <dt>description</dt><dd>{item.raw.description || "—"}</dd>
            </dl>
            <pre style={{ marginTop: 14 }}>{item.raw.bodyPreview}</pre>
          </>
        )}
      />
    </div>
  );
}
```

- [ ] **Step 6: MemoriesPage**

`web/src/pages/MemoriesPage.tsx`:
```tsx
import { ListDetail } from "../components/ListDetail.js";
import { useEndpoint } from "../useEndpoint.js";
import { ENDPOINTS, type MemoryItem } from "../api.js";

export function MemoriesPage() {
  const state = useEndpoint<MemoryItem[]>(ENDPOINTS.memories);
  if (state.status === "loading") return <div className="loading">Caricamento…</div>;
  if (state.status === "error") return <div className="error">Errore: {state.error}</div>;

  const items = state.data.map((it) => ({
    id: it.path,
    title: it.name,
    subtitle: it.bodyPreview,
    raw: it,
  }));

  return (
    <div className="canvas-body">
      <ListDetail
        items={items}
        listTitle="Memories"
        emptyMessage="Nessuna memoria trovata."
        renderDetail={(item) => (
          <>
            <h2>{item.raw.name}</h2>
            <div className="meta">{item.raw.path}</div>
            <pre>{item.raw.bodyPreview}</pre>
          </>
        )}
      />
    </div>
  );
}
```

- [ ] **Step 7: PluginsPage**

`web/src/pages/PluginsPage.tsx`:
```tsx
import { ListDetail } from "../components/ListDetail.js";
import { useEndpoint } from "../useEndpoint.js";
import { ENDPOINTS, type PluginItem } from "../api.js";

export function PluginsPage() {
  const state = useEndpoint<PluginItem[]>(ENDPOINTS.plugins);
  if (state.status === "loading") return <div className="loading">Caricamento…</div>;
  if (state.status === "error") return <div className="error">Errore: {state.error}</div>;

  const items = state.data.map((it) => ({
    id: `${it.rootPath}::${it.id}`,
    title: it.id,
    subtitle: it.enabled ? "enabled" : "disabled",
    raw: it,
  }));

  return (
    <div className="canvas-body">
      <ListDetail
        items={items}
        listTitle="Plugin installati"
        emptyMessage="Nessun plugin trovato."
        renderDetail={(item) => (
          <>
            <h2>{item.raw.id}</h2>
            <div className="meta">{item.raw.rootPath}</div>
            <dl className="kv">
              <dt>source</dt><dd>{item.raw.source || "—"}</dd>
              <dt>version</dt><dd>{item.raw.version || "—"}</dd>
              <dt>enabled</dt><dd>{String(item.raw.enabled)}</dd>
            </dl>
          </>
        )}
      />
    </div>
  );
}
```

- [ ] **Step 8: HooksPermsEnvPage**

`web/src/pages/HooksPermsEnvPage.tsx`:
```tsx
import { ListDetail } from "../components/ListDetail.js";
import { useEndpoint } from "../useEndpoint.js";
import { ENDPOINTS, type SettingsItem } from "../api.js";

export function HooksPermsEnvPage() {
  const state = useEndpoint<SettingsItem[]>(ENDPOINTS.settings);
  if (state.status === "loading") return <div className="loading">Caricamento…</div>;
  if (state.status === "error") return <div className="error">Errore: {state.error}</div>;

  const items = state.data.map((it) => ({
    id: it.path,
    title: it.fileName,
    subtitle: it.rootPath,
    raw: it,
  }));

  return (
    <div className="canvas-body">
      <ListDetail
        items={items}
        listTitle="Settings"
        emptyMessage="Nessun settings.json trovato."
        renderDetail={(item) => (
          <>
            <h2>{item.raw.fileName}</h2>
            <div className="meta">
              {item.raw.path}
              {item.raw.redactedKeys.length > 0
                ? ` · ${item.raw.redactedKeys.length} chiavi redatte`
                : ""}
            </div>
            <h3 style={{ marginTop: 12, fontSize: 12, color: "#8fa3b0", letterSpacing: ".14em", textTransform: "uppercase" }}>Hooks</h3>
            <pre>{JSON.stringify(item.raw.hooks, null, 2)}</pre>
            <h3 style={{ marginTop: 12, fontSize: 12, color: "#8fa3b0", letterSpacing: ".14em", textTransform: "uppercase" }}>Permissions</h3>
            <pre>{JSON.stringify(item.raw.permissions, null, 2)}</pre>
            <h3 style={{ marginTop: 12, fontSize: 12, color: "#8fa3b0", letterSpacing: ".14em", textTransform: "uppercase" }}>Env (redacted)</h3>
            <pre>{JSON.stringify(item.raw.env, null, 2)}</pre>
            {Object.keys(item.raw.other).length > 0 ? (
              <>
                <h3 style={{ marginTop: 12, fontSize: 12, color: "#8fa3b0", letterSpacing: ".14em", textTransform: "uppercase" }}>Other</h3>
                <pre>{JSON.stringify(item.raw.other, null, 2)}</pre>
              </>
            ) : null}
          </>
        )}
      />
    </div>
  );
}
```

- [ ] **Step 9: Typecheck and build**

Run: `cd web && npx tsc --noEmit -p tsconfig.json`
Expected: exit 0.

- [ ] **Step 10: Commit**

```bash
git add web/src/pages
git commit -m "feat(web): pages for instructions/agents/commands/skills/memories/plugins/hooks-perms-env"
```

---

## Task 15: Wire routing in `App.tsx`

**Files:**
- Modify: `web/src/App.tsx`

- [ ] **Step 1: Replace `web/src/App.tsx` with the routed version**

```tsx
import { useState, type ReactNode } from "react";
import { NAV_GROUPS } from "./nav.js";
import { InstructionsPage } from "./pages/InstructionsPage.js";
import { AgentsPage } from "./pages/AgentsPage.js";
import { CommandsPage } from "./pages/CommandsPage.js";
import { SkillsPage } from "./pages/SkillsPage.js";
import { MemoriesPage } from "./pages/MemoriesPage.js";
import { PluginsPage } from "./pages/PluginsPage.js";
import { HooksPermsEnvPage } from "./pages/HooksPermsEnvPage.js";
import { PlaceholderPage } from "./pages/PlaceholderPage.js";

const PAGES: Record<string, () => ReactNode> = {
  "System prompt": () => <InstructionsPage />,
  "Skills": () => <SkillsPage />,
  "Agents": () => <AgentsPage />,
  "Commands": () => <CommandsPage />,
  "Memories": () => <MemoriesPage />,
  "Hooks · Perms · Env": () => <HooksPermsEnvPage />,
  "Plugins": () => <PluginsPage />,
};

function renderPage(label: string): ReactNode {
  const factory = PAGES[label];
  return factory ? factory() : <PlaceholderPage label={label} />;
}

export function App() {
  const [active, setActive] = useState("System prompt");

  return (
    <div className="app">
      <nav className="nav glass">
        <div className="brand">
          <b>◇</b> intro<b>spect</b>
        </div>
        {NAV_GROUPS.map((group) => (
          <div key={group.title}>
            <div className="grp">{group.title}</div>
            {group.items.map((item) => (
              <div
                key={item.label}
                className={`item${item.label === active ? " on" : ""}`}
                onClick={() => setActive(item.label)}
              >
                <span>{item.label}</span>
                {item.badge ? <span className="n">{item.badge}</span> : null}
              </div>
            ))}
          </div>
        ))}
      </nav>

      <section className="canvas">
        <div className="l">{active}</div>
        {renderPage(active)}
      </section>

      <aside className="rail glass">
        <h4>Event stream</h4>
      </aside>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck and build**

Run: `cd web && npx tsc --noEmit -p tsconfig.json && npm run build --workspace web`
Expected: both exit 0.

- [ ] **Step 3: Smoke test end-to-end**

In one terminal: `npm run dev --workspace server`
In another: `npm run dev --workspace web`
Open `http://localhost:4318/`. Click each nav item under "Configurazione". The pages should render against your real config — System prompt shows CLAUDE.md, Agents shows your agents, Commands your slash commands, etc. Items not in this slice (Live graph, Projects, Sessions · History, Debug, Export bundle) show the PlaceholderPage. Stop both processes.

- [ ] **Step 4: Commit**

```bash
git add web/src/App.tsx
git commit -m "feat(web): route nav labels to Slice-1 pages with placeholder fallback"
```

---

## Self-Review

**1. Spec coverage (Slice 1 scope):**
- System prompt (CLAUDE.md) → Task 4 reader + Task 11 endpoint + Task 14.2 page. ✓
- Skills → Task 7 reader + Task 11 endpoint + Task 14.5 page. ✓
- Agents → Task 5 reader + Task 11 endpoint + Task 14.3 page. ✓
- Commands → Task 6 reader + Task 11 endpoint + Task 14.4 page. ✓
- Memories → Task 8 reader + Task 11 endpoint + Task 14.6 page. ✓
- Plugins → Task 9 reader + Task 11 endpoint + Task 14.7 page. ✓
- Hooks · Perms · Env (settings.json) → Task 10 reader (with secret redaction per spec) + Task 11 endpoint + Task 14.8 page. ✓
- Shared utilities (markdownDir, secrets) → Tasks 2, 3 with TDD. ✓
- Parser explicitly deferred to Slice 2 — noted in Goal/Architecture. ✓

**2. Placeholder scan:** Every code step shows full code. No "TBD"/"similar to"/"handle edge cases". Tests use real fs (no mocks). ✓

**3. Type consistency:** `ResolvedRoot` (Slice 0) consumed unchanged by every reader. The reader output types (`InstructionsItem`, `AgentItem`, `CommandItem`, `SkillItem`, `MemoryItem`, `PluginItem`, `SettingsItem`) are defined in Tasks 4–10 server-side and **re-declared verbatim** in `web/src/api.ts` (Task 12); pages (Task 14) consume them via `useEndpoint<T>`. `App.tsx` (Task 15) uses the same nav labels as `nav.ts` (Slice 0). Port numbers (server 4317, web 4318) unchanged. ✓

---

## Out of scope (next plans)

- **Slice 1.5** — `discovery/` + `introspect init` (heuristic + optional `--with-claude`) → `profile.json` that overrides the convention-variable paths (memories, instructions companions, skills layout). Reader code is already isolated so it can consume the profile when it lands.
- **Slice 2** — `parser/` (transcript `.jsonl` → `SessionEvent`) + Projects/Sessions/History explorer with static graph replay.
- **Slice 3** — Live (`watcher` + WebSocket + real-time graph + reasoning rail).
- **Slice 4** — Export (`tar.gz` + `manifest.json` + `restore.sh`, with the secret redaction already built in Task 3).
