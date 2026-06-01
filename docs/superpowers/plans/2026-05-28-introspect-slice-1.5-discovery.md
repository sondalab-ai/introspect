# Introspect — Slice 1.5: Discovery & `introspect init` (heuristic) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture user-/project-specific conventions for memory locations into a `profile.json` produced by a one-shot `introspect init` command (heuristic discovery only), and consume that profile in `readMemories` so memories are found regardless of how the user organizes their filesystem.

**Architecture:** A new `discovery/` module owns the profile schema, IO, and heuristic discovery. A new `bin/introspect-init.ts` CLI scans known config roots + per-project repo paths + declared paths in `CLAUDE.md` to fill `profile.json`. The `--with-claude` augmentation is **deferred to Slice 1.6** — its parser and interface (`askClaudeForMemoryDirs(runner, …)`) land here behind a `ClaudeRunner` type, fully tested with mocks, but the real CLI spawn is wired in the next slice. Readers consume the profile transparently via `loadProfile`.

**Tech Stack:** Node 20+, TypeScript, Fastify, Vitest. New dir: `server/src/discovery/`.

This is the third plan in the introspect series. Slice 0 + Slice 1 are complete on branch `slice-1-static-config`. **Slice 1.5 runs on a new branch `slice-1.5-discovery`.**

---

## File Structure

```
server/src/
├── discovery/
│   ├── types.ts                    # Profile schema
│   ├── profile.ts                  # loadProfile()/saveProfile()/defaultProfilePath()
│   ├── heuristic.ts                # discoverHeuristic(roots) → suggested dirs
│   ├── withClaude.ts               # askClaudeForMemoryDirs(runner, ctx) — parser + interface
│   └── __tests__/
│       ├── profile.test.ts
│       ├── heuristic.test.ts
│       └── withClaude.test.ts
├── readers/
│   └── memories.ts                 # MODIFY: accept extraDirs, scope="discovered:<path>"
├── api/
│   └── server.ts                   # MODIFY: load profile, pass extraDirs to memories reader
└── bin/
    └── introspect-init.ts          # NEW: CLI entry that writes profile.json
```

Profile location: `INTROSPECT_PROFILE` env → if set, used; else default `~/.config/introspect/profile.json`. XDG-style. The CLI creates parent dirs as needed.

---

## Task 1: Branch + profile types

**Files:** `server/src/discovery/types.ts`

- [ ] **Step 1: New branch**

```bash
cd /Users/marcello.barile/src/mine/introspect
git checkout -b slice-1.5-discovery
```

- [ ] **Step 2: Create `server/src/discovery/types.ts`**

```ts
/** Persisted convention profile produced by `introspect init`. Editable by hand. */
export interface Profile {
  /** Schema version. Increment if/when fields change incompatibly. */
  version: 1;
  /** ISO timestamp of when the profile was last (re)generated. */
  generatedAt: string;
  /** Where each entry came from, for debuggability. */
  provenance: Record<string, "heuristic" | "claude" | "manual">;
  /**
   * Absolute filesystem paths that hold `<dir>/*.md` memory files.
   * Aggregated by `readMemories` in addition to the default `<root>/memory/`
   * and `<root>/projects/<slug>/memory/` locations.
   */
  extraMemoryDirs: string[];
}

/** Empty/default profile used when no file exists yet. */
export function emptyProfile(): Profile {
  return {
    version: 1,
    generatedAt: new Date(0).toISOString(),
    provenance: {},
    extraMemoryDirs: [],
  };
}
```

- [ ] **Step 3: Commit**

```bash
git add server/src/discovery/types.ts
git commit -m "feat(discovery): profile schema + emptyProfile()"
```

---

## Task 2: Profile load/save (TDD)

**Files:** `server/src/discovery/profile.ts` + test

- [ ] **Step 1: Failing test `server/src/discovery/__tests__/profile.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadProfile, saveProfile, defaultProfilePath } from "../profile.js";
import { emptyProfile } from "../types.js";

describe("loadProfile", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "profile-")); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it("returns an empty profile when the file does not exist", () => {
    const p = loadProfile(join(dir, "missing.json"));
    expect(p).toEqual(emptyProfile());
  });

  it("returns an empty profile when the file is malformed JSON", () => {
    const path = join(dir, "bad.json");
    writeFileSync(path, "{not json");
    expect(loadProfile(path)).toEqual(emptyProfile());
  });

  it("returns the parsed profile when valid", () => {
    const path = join(dir, "p.json");
    writeFileSync(path, JSON.stringify({
      version: 1, generatedAt: "2026-01-01T00:00:00.000Z",
      provenance: { "/m": "heuristic" }, extraMemoryDirs: ["/m"],
    }));
    expect(loadProfile(path)).toEqual({
      version: 1, generatedAt: "2026-01-01T00:00:00.000Z",
      provenance: { "/m": "heuristic" }, extraMemoryDirs: ["/m"],
    });
  });
});

describe("saveProfile", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "profile-")); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it("writes pretty JSON, creating parent directories as needed", () => {
    const path = join(dir, "nested", "deeper", "p.json");
    const profile = emptyProfile();
    saveProfile(path, profile);
    expect(existsSync(path)).toBe(true);
    const back = JSON.parse(readFileSync(path, "utf8"));
    expect(back).toEqual(profile);
  });
});

describe("defaultProfilePath", () => {
  it("honors INTROSPECT_PROFILE when set", () => {
    expect(defaultProfilePath({ env: { INTROSPECT_PROFILE: "/custom/p.json" } })).toBe("/custom/p.json");
  });

  it("falls back to <home>/.config/introspect/profile.json", () => {
    expect(defaultProfilePath({ env: {}, homeDir: "/home/u" }))
      .toBe("/home/u/.config/introspect/profile.json");
  });
});
```

- [ ] **Step 2: Red** — `npm test --workspace server -- profile` → FAIL.

- [ ] **Step 3: Implement `server/src/discovery/profile.ts`**

```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { emptyProfile, type Profile } from "./types.js";

export interface DefaultPathOpts {
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
}

/** Resolve the path where the profile lives, honoring INTROSPECT_PROFILE env. */
export function defaultProfilePath(opts: DefaultPathOpts = {}): string {
  const env = opts.env ?? process.env;
  if (env.INTROSPECT_PROFILE) return env.INTROSPECT_PROFILE;
  const home = opts.homeDir ?? homedir();
  return join(home, ".config", "introspect", "profile.json");
}

/** Load the profile from disk; return an empty profile if missing or malformed. */
export function loadProfile(path: string): Profile {
  if (!existsSync(path)) return emptyProfile();
  let raw: string;
  try { raw = readFileSync(path, "utf8"); } catch { return emptyProfile(); }
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return emptyProfile(); }
  if (!isProfile(parsed)) return emptyProfile();
  return parsed;
}

/** Write the profile to disk (pretty-printed), creating parent dirs. */
export function saveProfile(path: string, profile: Profile): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(profile, null, 2) + "\n", "utf8");
}

function isProfile(v: unknown): v is Profile {
  if (v === null || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    o.version === 1 &&
    typeof o.generatedAt === "string" &&
    typeof o.provenance === "object" && o.provenance !== null &&
    Array.isArray(o.extraMemoryDirs) &&
    (o.extraMemoryDirs as unknown[]).every((s) => typeof s === "string")
  );
}
```

- [ ] **Step 4: Green** — +5 new tests.

- [ ] **Step 5: Commit**

```bash
git add server/src/discovery/profile.ts server/src/discovery/__tests__/profile.test.ts
git commit -m "feat(discovery): load/save profile.json with default XDG path"
```

---

## Task 3: Heuristic discovery (TDD)

**Files:** `server/src/discovery/heuristic.ts` + test

Heuristic logic, narrow and explicit (no fuzzy, no LLM):

1. For each resolved root, scan `<root>/projects/`. Each `<slug>` decodes back to a filesystem path by replacing `-` with `/` (the slug convention in `~/.claude/projects/`). For each decoded path, check candidates `docs/memory`, `docs/memories`, `.claude/memory`.
2. Read `<root>/CLAUDE.md` if present and extract paths that look like memory dir references via a regex matching `docs/[A-Za-z0-9_-]+/(memory|memories)`. Apply each declared relative path under every known project repo.
3. Resolve via `realpath`; keep only **existing directories**; deduplicate; pair with `"heuristic"` provenance.

- [ ] **Step 1: Failing test `server/src/discovery/__tests__/heuristic.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverHeuristic } from "../heuristic.js";
import type { ResolvedRoot } from "../../sources/types.js";

function rootOf(dir: string): ResolvedRoot {
  return { root: { declaredPath: dir, realPath: realpathSync(dir), inode: 0 }, sources: [] };
}

describe("discoverHeuristic", () => {
  let root: string;
  let repo: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "h-root-"));
    repo = mkdtempSync(join(tmpdir(), "h-repo-"));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  });

  it("finds <repo>/docs/memory/ for each projects/<slug>", () => {
    const slug = realpathSync(repo).replace(/\//g, "-");
    mkdirSync(join(root, "projects", slug), { recursive: true });
    mkdirSync(join(repo, "docs", "memory"), { recursive: true });

    const r = discoverHeuristic([rootOf(root)]);
    expect(r.extraMemoryDirs).toContain(realpathSync(join(repo, "docs", "memory")));
    expect(r.provenance[realpathSync(join(repo, "docs", "memory"))]).toBe("heuristic");
  });

  it("ignores candidates that do not exist", () => {
    const slug = realpathSync(repo).replace(/\//g, "-");
    mkdirSync(join(root, "projects", slug), { recursive: true });
    // no docs/memory/ created
    const r = discoverHeuristic([rootOf(root)]);
    expect(r.extraMemoryDirs).toEqual([]);
  });

  it("picks up declared paths from <root>/CLAUDE.md", () => {
    writeFileSync(
      join(root, "CLAUDE.md"),
      "Project-specific memories live under docs/memory/ inside each repo."
    );
    const slug = realpathSync(repo).replace(/\//g, "-");
    mkdirSync(join(root, "projects", slug), { recursive: true });
    mkdirSync(join(repo, "docs", "memory"), { recursive: true });

    const r = discoverHeuristic([rootOf(root)]);
    expect(r.extraMemoryDirs).toContain(realpathSync(join(repo, "docs", "memory")));
  });

  it("deduplicates results across multiple roots", () => {
    const slug = realpathSync(repo).replace(/\//g, "-");
    mkdirSync(join(root, "projects", slug), { recursive: true });
    const root2 = mkdtempSync(join(tmpdir(), "h-root2-"));
    mkdirSync(join(root2, "projects", slug), { recursive: true });
    mkdirSync(join(repo, "docs", "memory"), { recursive: true });
    try {
      const r = discoverHeuristic([rootOf(root), rootOf(root2)]);
      expect(
        r.extraMemoryDirs.filter((p) => p === realpathSync(join(repo, "docs", "memory")))
      ).toHaveLength(1);
    } finally {
      rmSync(root2, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Red** — FAIL.

- [ ] **Step 3: Implement `server/src/discovery/heuristic.ts`**

```ts
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { join } from "node:path";
import type { ResolvedRoot } from "../sources/types.js";

export interface HeuristicResult {
  extraMemoryDirs: string[];
  provenance: Record<string, "heuristic">;
}

const CANDIDATES_PER_REPO = ["docs/memory", "docs/memories", ".claude/memory"];

/** Subdirs of `<root>/projects/`. */
function listProjectSlugs(root: string): string[] {
  const projectsDir = join(root, "projects");
  if (!existsSync(projectsDir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(projectsDir)) {
    try {
      if (statSync(join(projectsDir, entry)).isDirectory()) out.push(entry);
    } catch {
      // skip
    }
  }
  return out;
}

/** Slug → filesystem path: strip leading "-", restore "/" separators. */
function slugToPath(slug: string): string {
  const stripped = slug.replace(/^-/, "");
  return "/" + stripped.replace(/-/g, "/");
}

/** Memory-dir mentions from a CLAUDE.md body. */
function extractDeclaredFromInstructions(body: string): string[] {
  const out: string[] = [];
  const rel = /docs\/[A-Za-z0-9_-]+\/(memory|memories)/g;
  // Also accept a bare "docs/memory" or "docs/memories" mention.
  const bare = /docs\/(memory|memories)\b/g;
  let m: RegExpExecArray | null;
  while ((m = rel.exec(body))) out.push(m[0]);
  while ((m = bare.exec(body))) out.push(m[0]);
  return out;
}

function asRealDir(p: string): string | null {
  try {
    const r = realpathSync(p);
    if (!statSync(r).isDirectory()) return null;
    return r;
  } catch {
    return null;
  }
}

export function discoverHeuristic(roots: ResolvedRoot[]): HeuristicResult {
  const found = new Set<string>();
  for (const { root } of roots) {
    const slugs = listProjectSlugs(root.realPath);
    const repoPaths = slugs.map(slugToPath);

    // 1. fixed candidates under each project repo
    for (const repoPath of repoPaths) {
      for (const rel of CANDIDATES_PER_REPO) {
        const real = asRealDir(join(repoPath, rel));
        if (real) found.add(real);
      }
    }

    // 2. declared candidates from CLAUDE.md applied to each project repo
    const claudeMd = join(root.realPath, "CLAUDE.md");
    if (!existsSync(claudeMd)) continue;
    let body: string;
    try { body = readFileSync(claudeMd, "utf8"); } catch { continue; }
    for (const rel of extractDeclaredFromInstructions(body)) {
      for (const repoPath of repoPaths) {
        const real = asRealDir(join(repoPath, rel));
        if (real) found.add(real);
      }
    }
  }
  const extraMemoryDirs = [...found].sort();
  const provenance: Record<string, "heuristic"> = {};
  for (const p of extraMemoryDirs) provenance[p] = "heuristic";
  return { extraMemoryDirs, provenance };
}
```

- [ ] **Step 4: Green** — +4 tests.

- [ ] **Step 5: Commit**

```bash
git add server/src/discovery/heuristic.ts server/src/discovery/__tests__/heuristic.test.ts
git commit -m "feat(discovery): heuristic scan of projects + CLAUDE.md for memory dirs"
```

---

## Task 4: Claude-runner interface + parser (no real CLI yet)

**Files:** `server/src/discovery/withClaude.ts` + test

The interface lands now (so the CLI in Task 5 can flag `--with-claude` and produce a clear "not yet wired" error), but the real binary invocation is deferred to **Slice 1.6**. Tests are mock-only — no spawn.

- [ ] **Step 1: Failing test `server/src/discovery/__tests__/withClaude.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { askClaudeForMemoryDirs, type ClaudeRunner } from "../withClaude.js";

function runner(stdout: string, exitCode = 0): ClaudeRunner {
  return vi.fn(async () => ({ stdout, stderr: "", exitCode }));
}

describe("askClaudeForMemoryDirs", () => {
  it("parses a newline list of absolute paths from claude's stdout", async () => {
    const r = runner("/abs/one\n/abs/two\n\n/abs/three");
    const out = await askClaudeForMemoryDirs(r, "context");
    expect(out).toEqual(["/abs/one", "/abs/two", "/abs/three"]);
  });

  it("returns [] when claude exits non-zero", async () => {
    const r = runner("ignored", 1);
    expect(await askClaudeForMemoryDirs(r, "ctx")).toEqual([]);
  });

  it("drops non-absolute paths and obvious noise", async () => {
    const r = runner("/abs/ok\nnot a path\n./rel/path\n/another");
    expect(await askClaudeForMemoryDirs(r, "ctx")).toEqual(["/abs/ok", "/another"]);
  });
});
```

- [ ] **Step 2: Red** — FAIL.

- [ ] **Step 3: Implement `server/src/discovery/withClaude.ts`**

```ts
export interface ClaudeRunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/** Minimal abstraction over the local `claude` CLI invocation.
 * Implementations live in Slice 1.6+; tests inject mocks. */
export type ClaudeRunner = (input: string) => Promise<ClaudeRunResult>;

/** Ask Claude to enumerate memory directories, parse a flat path list from stdout. */
export async function askClaudeForMemoryDirs(
  runner: ClaudeRunner,
  context: string,
): Promise<string[]> {
  const res = await runner(context);
  if (res.exitCode !== 0) return [];
  return res.stdout
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.startsWith("/"));
}
```

- [ ] **Step 4: Green** — +3 tests.

- [ ] **Step 5: Commit**

```bash
git add server/src/discovery/withClaude.ts server/src/discovery/__tests__/withClaude.test.ts
git commit -m "feat(discovery): ClaudeRunner interface + memory-dir parser (mock-only)"
```

---

## Task 5: `introspect-init` CLI (heuristic only)

**Files:** `server/src/bin/introspect-init.ts`, modify `server/package.json` bin map.

- [ ] **Step 1: Update `server/package.json` `bin`** to add the new entry:

```json
  "bin": {
    "introspect": "./dist/bin/introspect.js",
    "introspect-init": "./dist/bin/introspect-init.js"
  },
```

- [ ] **Step 2: Implement `server/src/bin/introspect-init.ts`**

```ts
#!/usr/bin/env node
import { resolveSources } from "../sources/index.js";
import { discoverHeuristic } from "../discovery/heuristic.js";
import { defaultProfilePath, loadProfile, saveProfile } from "../discovery/profile.js";
import { parseExtraRoots } from "./env.js";
import type { Profile } from "../discovery/types.js";

async function main(): Promise<void> {
  const wantsClaude = process.argv.includes("--with-claude");
  if (wantsClaude) {
    console.error(
      "introspect: --with-claude is not yet wired (planned for Slice 1.6). " +
      "Running heuristic discovery only."
    );
  }

  const profilePath = defaultProfilePath();
  const extraRoots = parseExtraRoots(process.env.INTROSPECT_EXTRA_ROOTS);
  const roots = resolveSources({ extraRoots });

  const heuristic = discoverHeuristic(roots);
  const dirs = new Set(heuristic.extraMemoryDirs);
  const provenance: Profile["provenance"] = { ...heuristic.provenance };

  // Preserve manual entries that the user added by hand.
  const existing = loadProfile(profilePath);
  for (const [k, v] of Object.entries(existing.provenance)) {
    if (v === "manual" && !dirs.has(k)) {
      dirs.add(k);
      provenance[k] = "manual";
    }
  }

  const profile: Profile = {
    version: 1,
    generatedAt: new Date().toISOString(),
    provenance,
    extraMemoryDirs: [...dirs].sort(),
  };
  saveProfile(profilePath, profile);

  console.log(`introspect: wrote ${profilePath}`);
  console.log(`  ${profile.extraMemoryDirs.length} memory dir(s) discovered`);
  for (const d of profile.extraMemoryDirs) {
    console.log(`  - ${d}  [${provenance[d]}]`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 3: Smoke**

```bash
INTROSPECT_PROFILE=/tmp/introspect-test-profile.json npx tsx server/src/bin/introspect-init.ts
```
Must print `wrote /tmp/introspect-test-profile.json` and a list of discovered dirs. Then `cat /tmp/introspect-test-profile.json` to confirm structure. Remove the temp file.

Also verify the `--with-claude` flag prints the deferred message and still runs heuristic:
```bash
INTROSPECT_PROFILE=/tmp/introspect-test-profile.json npx tsx server/src/bin/introspect-init.ts --with-claude
```

- [ ] **Step 4: tsc**

`cd server && npx tsc --noEmit -p tsconfig.json` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add server/src/bin/introspect-init.ts server/package.json
git commit -m "feat(bin): introspect-init CLI (heuristic; --with-claude deferred)"
```

---

## Task 6: Wire `readMemories` to consume the profile

**Files:** modify `server/src/readers/memories.ts`, `server/src/api/server.ts`, memories test, `web/src/pages/MemoriesPage.tsx`.

- [ ] **Step 1: Modify `server/src/readers/memories.ts`** — replace the existing `readMemories` function (keep everything above it unchanged) with:

```ts
/**
 * Aggregate memory items per root from `<root>/memory/`, `<root>/projects/<slug>/memory/`,
 * and any additional absolute paths provided (typically from the discovery profile).
 * Convention-variable; refined by the discovery profile in Slice 1.5.
 */
export function readMemories(
  roots: ResolvedRoot[],
  extraDirs: string[] = [],
): MemoryItem[] {
  const out: MemoryItem[] = [];
  for (const { root } of roots) {
    out.push(...collectFrom(root.realPath, join(root.realPath, "memory"), "global"));
    const projectsDir = join(root.realPath, "projects");
    for (const slug of listSubdirs(projectsDir)) {
      out.push(...collectFrom(root.realPath, join(projectsDir, slug, "memory"), slug));
    }
  }
  const seen = new Set<string>(out.map((i) => i.path));
  for (const dir of extraDirs) {
    for (const item of collectFrom(dir, dir, `discovered:${dir}`)) {
      if (seen.has(item.path)) continue;
      seen.add(item.path);
      out.push(item);
    }
  }
  return out;
}
```

- [ ] **Step 2: Modify `server/src/api/server.ts`** — add the profile imports and replace the `/memories` handler:

Add these imports near the existing reader imports:
```ts
import { defaultProfilePath, loadProfile } from "../discovery/profile.js";
```

Replace the existing `/memories` registration with:
```ts
  app.get("/memories", async () => {
    const profile = loadProfile(defaultProfilePath());
    return readMemories(resolveSources(opts), profile.extraMemoryDirs);
  });
```

(All other handlers stay unchanged.)

- [ ] **Step 3: Append tests to `server/src/readers/__tests__/memories.test.ts`** (inside the existing describe):

```ts
  it("includes memories from extraDirs and tags scope='discovered:<dir>'", () => {
    const extra = mkdtempSync(join(tmpdir(), "extra-mem-"));
    writeFileSync(join(extra, "x.md"), "x body");
    try {
      const items = readMemories([rootOf(dir)], [extra]);
      const e = items.find((i) => i.name === "x")!;
      expect(e).toBeDefined();
      expect(e.scope).toBe(`discovered:${extra}`);
    } finally {
      rmSync(extra, { recursive: true, force: true });
    }
  });

  it("does not duplicate entries that are already reachable via projects symlinks", () => {
    const slug = "p1";
    mkdirSync(join(dir, "projects", slug, "memory"), { recursive: true });
    const file = join(dir, "projects", slug, "memory", "shared.md");
    writeFileSync(file, "shared");
    const items = readMemories([rootOf(dir)], [join(dir, "projects", slug, "memory")]);
    expect(items.filter((i) => i.path === file)).toHaveLength(1);
  });
```

- [ ] **Step 4: Update `web/src/pages/MemoriesPage.tsx`** — render the new scope shape. Replace the entire file with:

```tsx
import { ListDetail } from "../components/ListDetail.js";
import { useEndpoint } from "../useEndpoint.js";
import { ENDPOINTS, type MemoryItem } from "../api.js";

function scopeLabel(s: string): string {
  if (s === "global") return "global";
  if (s.startsWith("discovered:")) return `discovered · ${s.slice("discovered:".length)}`;
  return `project · ${s}`;
}

export function MemoriesPage() {
  const state = useEndpoint<MemoryItem[]>(ENDPOINTS.memories);
  if (state.status === "loading") return <div className="loading">Caricamento…</div>;
  if (state.status === "error") return <div className="error">Errore: {state.error}</div>;

  const items = state.data.map((it) => ({
    id: it.path,
    title: it.name,
    subtitle: scopeLabel(it.scope),
    raw: it,
  }));

  return (
    <div className="canvas-body">
      <ListDetail
        items={items}
        listTitle={`Memories (${items.length})`}
        emptyMessage="Nessuna memoria trovata."
        renderDetail={(item) => (
          <>
            <h2>{item.raw.name}</h2>
            <div className="meta">
              {scopeLabel(item.raw.scope)} · {item.raw.path}
            </div>
            <pre>{item.raw.bodyPreview}</pre>
          </>
        )}
      />
    </div>
  );
}
```

- [ ] **Step 5: Verify**

`npm test --workspace server` — expected 50 + 2 = **52 tests passing** (Tasks 2-4 also added tests; total should be 50 + 5 + 4 + 3 + 2 = **64** by this point — confirm count).

`cd server && npx tsc --noEmit -p tsconfig.json` → 0.

`cd web && npx tsc --noEmit -p tsconfig.json` → 0.

End-to-end manual: `INTROSPECT_PROFILE=/tmp/p.json npx tsx server/src/bin/introspect-init.ts`, then `INTROSPECT_PROFILE=/tmp/p.json npm run dev:server` and `npm run dev:web`. Reload the Memories page — now includes `discovered:` entries from the user's repo dirs.

- [ ] **Step 6: Commit**

```bash
git add server/src/readers/memories.ts server/src/api/server.ts server/src/readers/__tests__/memories.test.ts web/src/pages/MemoriesPage.tsx
git commit -m "feat(memories): consume profile.extraMemoryDirs in reader and API"
```

---

## Self-Review

**Spec coverage (Slice 1.5):**
- `discovery/` module with profile schema + IO → Tasks 1, 2. ✓
- Heuristic strategy (offline) → Task 3. ✓
- `ClaudeRunner` interface + stdout parser (interface lands; real CLI in Slice 1.6) → Task 4. ✓
- `introspect init` CLI writes `profile.json`, preserves manual entries → Task 5. ✓
- Readers consume the profile transparently → Task 6. ✓
- Convention-variable principle: memories endpoint serves user-/project-specific paths.

**Placeholder scan:** Every step has full code. No "similar to" / "TBD". The `--with-claude` deferral is explicit (not a stub: prints a deferred message and runs heuristic).

**Type consistency:** `Profile`, `HeuristicResult`, `ClaudeRunner`, `MemoryItem.scope` referenced consistently. CLI loads/saves through the same `loadProfile`/`saveProfile` used at request time.

---

## Out of scope (later slices)

- **Slice 1.6** — Wire the real `claude` CLI behind `ClaudeRunner` so `--with-claude` actually enriches the profile.
- Profile coverage of spec/prompt dirs (extend `Profile`; readers follow the same pattern).
- A web view that lists/edits the discovered paths (today: hand-edit `profile.json`).
- Slice 2: parser/ + Projects/Sessions explorer.
- Slice 3: live graph.
- Slice 4: export bundle (will include `profile.json`).
