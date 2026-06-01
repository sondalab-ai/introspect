# Introspect — Slice 0: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the `introspect` monorepo skeleton with a tested, symlink-agnostic config-source resolver, a read-only API that exposes resolved sources, a launch command, and the visual app shell (glass nav + Observatory theme).

**Architecture:** npm-workspaces monorepo with two packages — `server/` (Node + TypeScript + Fastify) and `web/` (Vite + React + TypeScript). The core tested unit is `server/src/sources/`: it discovers Claude config roots (env-driven + configurable extras), resolves them through `realpath`, deduplicates by inode, and probes each known source path returning `present`/`missing`. A `GET /sources` endpoint exposes the result; the web shell renders the navigation and theme validated during brainstorming, with no live data yet.

**Tech Stack:** Node 20+, TypeScript, Fastify, `ws` (added later slices), Vitest, `tsx`, Vite, React. Package manager: npm workspaces.

This is the first of several plans. Later slices (parser, discovery, workspace explorer, live, export) each get their own plan, written once Slice 0 interfaces are fixed.

---

## File Structure

```
introspect/
├── package.json                      # workspaces root, shared scripts
├── tsconfig.base.json                # shared TS compiler options
├── .gitignore
├── server/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vitest.config.ts
│   └── src/
│       ├── sources/
│       │   ├── types.ts              # SourceId, ConfigRoot, ResolvedSource, ResolvedRoot
│       │   ├── configRoots.ts        # candidatePaths(), discoverConfigRoots()
│       │   ├── probe.ts              # SOURCE_RELATIVE map, probeSources()
│       │   ├── index.ts              # resolveSources() — public entry
│       │   └── __tests__/
│       │       ├── configRoots.test.ts
│       │       └── probe.test.ts
│       ├── api/
│       │   └── server.ts             # buildServer(): Fastify with /health, /sources
│       └── bin/
│           └── introspect.ts         # start server, open browser
└── web/
    ├── package.json
    ├── tsconfig.json
    ├── index.html
    ├── vite.config.ts
    └── src/
        ├── main.tsx                  # React entry
        ├── App.tsx                   # shell: glass nav + canvas placeholder
        ├── theme.css                 # Observatory theme tokens + glass
        └── nav.ts                    # NAV_GROUPS data
```

Each file has one responsibility. `sources/` is split by concern (root discovery vs source probing) so each is testable in isolation; `index.ts` composes them.

---

## Task 1: Workspace scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `.gitignore`

- [ ] **Step 1: Create root `package.json`**

```json
{
  "name": "introspect",
  "private": true,
  "version": "0.0.0",
  "workspaces": ["server", "web"],
  "scripts": {
    "test": "npm run test --workspace server",
    "dev:server": "npm run dev --workspace server",
    "dev:web": "npm run dev --workspace web"
  }
}
```

- [ ] **Step 2: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "noUncheckedIndexedAccess": true,
    "resolveJsonModule": true
  }
}
```

- [ ] **Step 3: Create `.gitignore`**

```
node_modules/
dist/
.superpowers/
*.log
.DS_Store
```

- [ ] **Step 4: Commit**

```bash
git init
git add package.json tsconfig.base.json .gitignore
git commit -m "chore: scaffold npm-workspaces monorepo"
```

---

## Task 2: Server package init

**Files:**
- Create: `server/package.json`
- Create: `server/tsconfig.json`
- Create: `server/vitest.config.ts`

- [ ] **Step 1: Create `server/package.json`**

```json
{
  "name": "@introspect/server",
  "version": "0.0.0",
  "type": "module",
  "bin": { "introspect": "./dist/bin/introspect.js" },
  "scripts": {
    "dev": "tsx watch src/bin/introspect.ts",
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "fastify": "^5.2.0"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create `server/tsconfig.json`**

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "types": ["node"]
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `server/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
```

- [ ] **Step 4: Install dependencies**

Run: `npm install`
Expected: workspaces resolve, `node_modules/` created, no errors.

- [ ] **Step 5: Commit**

```bash
git add server/package.json server/tsconfig.json server/vitest.config.ts package-lock.json
git commit -m "chore: init server package"
```

---

## Task 3: Source types

**Files:**
- Create: `server/src/sources/types.ts`

- [ ] **Step 1: Create the type definitions**

```ts
export type SourceId =
  | "instructions"
  | "skills"
  | "agents"
  | "commands"
  | "memories"
  | "settings"
  | "plugins"
  | "projects"
  | "history"
  | "debug"
  | "debugDecisions";

export interface ConfigRoot {
  /** Path as detected or supplied, before symlink resolution. */
  declaredPath: string;
  /** realpath()-resolved absolute path. */
  realPath: string;
  /** inode of the resolved path, used for deduplication. */
  inode: number;
}

export interface ResolvedSource {
  id: SourceId;
  realPath: string;
  status: "present" | "missing";
}

export interface ResolvedRoot {
  root: ConfigRoot;
  sources: ResolvedSource[];
}

export interface ResolveOptions {
  /** Defaults to process.env. */
  env?: NodeJS.ProcessEnv;
  /** Extra config roots to include alongside the detected base. */
  extraRoots?: string[];
  /** Defaults to os.homedir(). Injectable for tests. */
  homeDir?: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add server/src/sources/types.ts
git commit -m "feat(sources): add source domain types"
```

---

## Task 4: Config-root discovery (symlink-agnostic, inode-deduped)

**Files:**
- Create: `server/src/sources/configRoots.ts`
- Test: `server/src/sources/__tests__/configRoots.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, symlinkSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { candidatePaths, discoverConfigRoots } from "../configRoots.js";

describe("candidatePaths", () => {
  it("uses CLAUDE_CONFIG_DIR when set, plus extra roots", () => {
    const paths = candidatePaths({
      env: { CLAUDE_CONFIG_DIR: "/custom/claude" },
      extraRoots: ["/other/root"],
      homeDir: "/home/u",
    });
    expect(paths).toEqual(["/custom/claude", "/other/root"]);
  });

  it("falls back to <home>/.claude when env is unset", () => {
    const paths = candidatePaths({ env: {}, homeDir: "/home/u" });
    expect(paths).toEqual(["/home/u/.claude"]);
  });
});

describe("discoverConfigRoots", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "introspect-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("resolves symlinked roots through realpath", () => {
    const real = join(dir, "real-claude");
    mkdirSync(real);
    const link = join(dir, "linked-claude");
    symlinkSync(real, link);

    const roots = discoverConfigRoots({ env: { CLAUDE_CONFIG_DIR: link } });
    expect(roots).toHaveLength(1);
    expect(roots[0]!.realPath).toBe(realpathSync(real));
    expect(roots[0]!.declaredPath).toBe(link);
  });

  it("deduplicates roots that resolve to the same inode", () => {
    const real = join(dir, "claude");
    mkdirSync(real);
    const link = join(dir, "claude-alias");
    symlinkSync(real, link);

    const roots = discoverConfigRoots({
      env: { CLAUDE_CONFIG_DIR: real },
      extraRoots: [link],
    });
    expect(roots).toHaveLength(1);
  });

  it("skips roots that do not exist", () => {
    const real = join(dir, "claude");
    mkdirSync(real);
    const roots = discoverConfigRoots({
      env: { CLAUDE_CONFIG_DIR: real },
      extraRoots: [join(dir, "does-not-exist")],
    });
    expect(roots).toHaveLength(1);
    expect(roots[0]!.realPath).toBe(realpathSync(real));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --workspace server`
Expected: FAIL — `Cannot find module '../configRoots.js'`.

- [ ] **Step 3: Implement `configRoots.ts`**

```ts
import { realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ConfigRoot, ResolveOptions } from "./types.js";

/** Build the ordered list of candidate root paths before resolution. */
export function candidatePaths(opts: ResolveOptions = {}): string[] {
  const home = opts.homeDir ?? homedir();
  const env = opts.env ?? process.env;
  const base = env.CLAUDE_CONFIG_DIR ?? join(home, ".claude");
  return [base, ...(opts.extraRoots ?? [])];
}

/**
 * Resolve candidate paths through realpath and deduplicate by inode.
 * Non-existent paths are silently skipped (they are not config roots).
 */
export function discoverConfigRoots(opts: ResolveOptions = {}): ConfigRoot[] {
  const seen = new Set<number>();
  const roots: ConfigRoot[] = [];
  for (const declaredPath of candidatePaths(opts)) {
    let realPath: string;
    let inode: number;
    try {
      realPath = realpathSync(declaredPath);
      inode = statSync(realPath).ino;
    } catch {
      continue;
    }
    if (seen.has(inode)) continue;
    seen.add(inode);
    roots.push({ declaredPath, realPath, inode });
  }
  return roots;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --workspace server`
Expected: PASS — all `candidatePaths` and `discoverConfigRoots` tests green.

- [ ] **Step 5: Commit**

```bash
git add server/src/sources/configRoots.ts server/src/sources/__tests__/configRoots.test.ts
git commit -m "feat(sources): discover config roots via realpath with inode dedup"
```

---

## Task 5: Source probing

**Files:**
- Create: `server/src/sources/probe.ts`
- Test: `server/src/sources/__tests__/probe.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { probeSources } from "../probe.js";
import type { ConfigRoot } from "../types.js";

function rootOf(dir: string): ConfigRoot {
  return { declaredPath: dir, realPath: realpathSync(dir), inode: 0 };
}

describe("probeSources", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "introspect-probe-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("marks an existing source as present and a missing one as missing", () => {
    mkdirSync(join(dir, "agents"));
    const sources = probeSources(rootOf(dir));

    const agents = sources.find((s) => s.id === "agents")!;
    expect(agents.status).toBe("present");
    expect(agents.realPath).toBe(join(realpathSync(dir), "agents"));

    const debug = sources.find((s) => s.id === "debug")!;
    expect(debug.status).toBe("missing");
  });

  it("detects file-based sources like settings.json and CLAUDE.md", () => {
    writeFileSync(join(dir, "settings.json"), "{}");
    writeFileSync(join(dir, "CLAUDE.md"), "# hi");
    const sources = probeSources(rootOf(dir));

    expect(sources.find((s) => s.id === "settings")!.status).toBe("present");
    expect(sources.find((s) => s.id === "instructions")!.status).toBe("present");
  });

  it("returns an entry for every known source id", () => {
    const sources = probeSources(rootOf(dir));
    const ids = sources.map((s) => s.id).sort();
    expect(ids).toEqual(
      [
        "agents",
        "commands",
        "debug",
        "debugDecisions",
        "history",
        "instructions",
        "memories",
        "plugins",
        "projects",
        "settings",
        "skills",
      ].sort()
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --workspace server`
Expected: FAIL — `Cannot find module '../probe.js'`.

- [ ] **Step 3: Implement `probe.ts`**

```ts
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ConfigRoot, ResolvedSource, SourceId } from "./types.js";

/**
 * Relative path of each source under a config root. Convention-variable
 * sources (memories) use a sensible default here; the discovery profile
 * (later slice) overrides them. `existsSync` follows symlinks, so this is
 * symlink-agnostic for the source entries themselves.
 */
const SOURCE_RELATIVE: Record<SourceId, string> = {
  instructions: "CLAUDE.md",
  skills: "plugins",
  agents: "agents",
  commands: "commands",
  memories: "memory",
  settings: "settings.json",
  plugins: "plugins",
  projects: "projects",
  history: "history.jsonl",
  debug: "debug",
  debugDecisions: "debug-decisions",
};

/** Probe each known source under a resolved root, reporting present/missing. */
export function probeSources(root: ConfigRoot): ResolvedSource[] {
  return (Object.keys(SOURCE_RELATIVE) as SourceId[]).map((id) => {
    const realPath = join(root.realPath, SOURCE_RELATIVE[id]);
    return {
      id,
      realPath,
      status: existsSync(realPath) ? "present" : "missing",
    };
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --workspace server`
Expected: PASS — all `probeSources` tests green.

- [ ] **Step 5: Commit**

```bash
git add server/src/sources/probe.ts server/src/sources/__tests__/probe.test.ts
git commit -m "feat(sources): probe known sources under a root"
```

---

## Task 6: Public resolver entry

**Files:**
- Create: `server/src/sources/index.ts`

- [ ] **Step 1: Implement `index.ts`**

```ts
import { discoverConfigRoots } from "./configRoots.js";
import { probeSources } from "./probe.js";
import type { ResolveOptions, ResolvedRoot } from "./types.js";

export * from "./types.js";
export { candidatePaths, discoverConfigRoots } from "./configRoots.js";
export { probeSources } from "./probe.js";

/** Discover all config roots and probe their sources. */
export function resolveSources(opts: ResolveOptions = {}): ResolvedRoot[] {
  return discoverConfigRoots(opts).map((root) => ({
    root,
    sources: probeSources(root),
  }));
}
```

- [ ] **Step 2: Verify the existing test suite still passes**

Run: `npm test --workspace server`
Expected: PASS — no regressions; existing tests still green.

- [ ] **Step 3: Commit**

```bash
git add server/src/sources/index.ts
git commit -m "feat(sources): compose resolveSources entry point"
```

---

## Task 7: API server with /health and /sources

**Files:**
- Create: `server/src/api/server.ts`
- Test: `server/src/api/server.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
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
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --workspace server`
Expected: FAIL — `Cannot find module './server.js'`.

- [ ] **Step 3: Implement `api/server.ts`**

```ts
import Fastify, { type FastifyInstance } from "fastify";
import { resolveSources } from "../sources/index.js";
import type { ResolveOptions } from "../sources/index.js";

/** Build the read-only API. `opts` are forwarded to the source resolver. */
export function buildServer(opts: ResolveOptions = {}): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get("/health", async () => ({ status: "ok" }));

  app.get("/sources", async () => resolveSources(opts));

  return app;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --workspace server`
Expected: PASS — both API tests green.

- [ ] **Step 5: Commit**

```bash
git add server/src/api/server.ts server/src/api/server.test.ts
git commit -m "feat(api): expose /health and /sources"
```

---

## Task 8: Launch command

**Files:**
- Create: `server/src/bin/introspect.ts`

- [ ] **Step 1: Implement `bin/introspect.ts`**

```ts
import { spawn } from "node:child_process";
import { platform } from "node:process";
import { buildServer } from "../api/server.js";

const PORT = Number(process.env.INTROSPECT_PORT ?? 4317);

/** Open a URL in the default browser, best-effort and non-fatal. */
function openBrowser(url: string): void {
  const cmd =
    platform === "darwin" ? "open" : platform === "win32" ? "start" : "xdg-open";
  try {
    spawn(cmd, [url], { stdio: "ignore", detached: true, shell: platform === "win32" }).unref();
  } catch {
    // ignore — the URL is printed below regardless
  }
}

async function main(): Promise<void> {
  const extraRoots = (process.env.INTROSPECT_EXTRA_ROOTS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const app = buildServer({ extraRoots });
  await app.listen({ port: PORT, host: "127.0.0.1" });

  const url = `http://localhost:${PORT}`;
  console.log(`introspect listening on ${url}`);
  openBrowser(url);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Verify the server starts and serves /sources**

Run: `npm run dev --workspace server`
Then in another shell: `curl -s http://localhost:4317/health`
Expected: `{"status":"ok"}`. Stop the dev server afterward (Ctrl-C).

- [ ] **Step 3: Commit**

```bash
git add server/src/bin/introspect.ts
git commit -m "feat(bin): introspect launch command opens browser"
```

---

## Task 9: Web package init

**Files:**
- Create: `web/package.json`
- Create: `web/tsconfig.json`
- Create: `web/vite.config.ts`
- Create: `web/index.html`

- [ ] **Step 1: Create `web/package.json`**

```json
{
  "name": "@introspect/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "typescript": "^5.7.0",
    "vite": "^6.0.0"
  }
}
```

- [ ] **Step 2: Create `web/tsconfig.json`**

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": []
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `web/vite.config.ts`**

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 4318,
    proxy: { "/health": "http://localhost:4317", "/sources": "http://localhost:4317" },
  },
});
```

- [ ] **Step 4: Create `web/index.html`**

```html
<!DOCTYPE html>
<html lang="it">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Introspect</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Install and verify**

Run: `npm install`
Expected: web deps resolve with no errors.

- [ ] **Step 6: Commit**

```bash
git add web/package.json web/tsconfig.json web/vite.config.ts web/index.html package-lock.json
git commit -m "chore: init web package"
```

---

## Task 10: Theme tokens (Observatory + glass)

**Files:**
- Create: `web/src/theme.css`

- [ ] **Step 1: Create `web/src/theme.css`**

```css
@import url("https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500&family=Space+Grotesk:wght@400;500;600&display=swap");

:root {
  --bg: #06070a;
  --line: #14202b;
  --cy: #2ee6c0;
  --cy2: #5ad1ff;
  --txt: #cdd9e1;
  --mut: #52656f;
  --glass-bg-top: rgba(18, 28, 36, 0.55);
  --glass-bg-bot: rgba(8, 12, 16, 0.55);
  --glass-border: rgba(90, 209, 200, 0.14);
}

* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  background: var(--bg);
  color: var(--txt);
  font-family: "IBM Plex Mono", monospace;
  height: 100vh;
  overflow: hidden;
  background-image:
    radial-gradient(110% 80% at 78% -5%, rgba(46, 230, 192, 0.06), transparent 55%),
    linear-gradient(#0b1218 1px, transparent 1px),
    linear-gradient(90deg, #0b1218 1px, transparent 1px);
  background-size: auto, 24px 24px, 24px 24px;
}

.app { display: grid; grid-template-columns: 222px 1fr 300px; height: 100vh; }

.glass {
  background: linear-gradient(180deg, var(--glass-bg-top), var(--glass-bg-bot));
  backdrop-filter: blur(14px) saturate(140%);
  -webkit-backdrop-filter: blur(14px) saturate(140%);
}

.nav { padding: 18px 0; display: flex; flex-direction: column;
  border-right: 1px solid var(--glass-border); box-shadow: 1px 0 24px rgba(0,0,0,0.4) inset; }
.brand { padding: 0 18px 18px; font-family: "Space Grotesk"; font-weight: 600; font-size: 15px; color: #e6f3f0; }
.brand b { color: var(--cy); }
.grp { font-size: 9px; letter-spacing: .18em; color: #3f5260; text-transform: uppercase; padding: 14px 18px 6px; }
.item { padding: 7px 18px; font-size: 12px; color: #7d909e; cursor: pointer;
  border-left: 2px solid transparent; display: flex; justify-content: space-between; }
.item:hover { color: var(--txt); }
.item.on { color: #e6f3f0; border-left-color: var(--cy);
  background: linear-gradient(90deg, rgba(46,230,192,.10), transparent); }
.item .n { font-size: 9px; color: #3f5260; }

.canvas { padding: 18px 22px; overflow: hidden; }
.canvas .l { font-family: "Space Grotesk"; font-size: 13px; letter-spacing: .10em; color: #8fa3b0;
  border-bottom: 1px solid var(--line); padding-bottom: 12px; }

.rail { padding: 18px 16px; overflow: hidden;
  border-left: 1px solid var(--glass-border); box-shadow: -1px 0 24px rgba(0,0,0,0.4) inset; }
.rail h4 { font-size: 9px; letter-spacing: .18em; text-transform: uppercase; color: #3f5260; }
```

- [ ] **Step 2: Commit**

```bash
git add web/src/theme.css
git commit -m "feat(web): Observatory theme tokens and glass surfaces"
```

---

## Task 11: Navigation data

**Files:**
- Create: `web/src/nav.ts`

- [ ] **Step 1: Create `web/src/nav.ts`**

```ts
export interface NavItem {
  label: string;
  badge?: string;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  { title: "Realtime", items: [{ label: "Live graph", badge: "●" }] },
  {
    title: "Configurazione",
    items: [
      { label: "System prompt" },
      { label: "Skills" },
      { label: "Agents" },
      { label: "Commands" },
      { label: "Memories" },
      { label: "Hooks · Perms · Env" },
      { label: "Plugins" },
    ],
  },
  {
    title: "Workspace",
    items: [
      { label: "Projects" },
      { label: "Sessions · History" },
      { label: "Debug" },
    ],
  },
  { title: "Portabilità", items: [{ label: "Export bundle" }] },
];
```

- [ ] **Step 2: Commit**

```bash
git add web/src/nav.ts
git commit -m "feat(web): navigation group data"
```

---

## Task 12: App shell

**Files:**
- Create: `web/src/main.tsx`
- Create: `web/src/App.tsx`

- [ ] **Step 1: Create `web/src/main.tsx`**

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import "./theme.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

- [ ] **Step 2: Create `web/src/App.tsx`**

```tsx
import { useState } from "react";
import { NAV_GROUPS } from "./nav.js";

export function App() {
  const [active, setActive] = useState("Live graph");

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
      </section>

      <aside className="rail glass">
        <h4>Event stream</h4>
      </aside>
    </div>
  );
}
```

- [ ] **Step 3: Verify the shell renders**

Run: `npm run dev --workspace web`
Open `http://localhost:4318`.
Expected: glass nav on the left with all groups, clicking an item highlights it and updates the center heading, glass rail on the right. Stop the dev server afterward.

- [ ] **Step 4: Commit**

```bash
git add web/src/main.tsx web/src/App.tsx
git commit -m "feat(web): app shell with glass nav and theme"
```

---

## Self-Review

**1. Spec coverage (Slice 0 scope):**
- Monorepo `server/` + `web/` → Tasks 1, 2, 9. ✓
- `sources/` discovery (config roots, env-driven + configurable extras) → Task 4. ✓
- realpath resolution → Task 4. ✓
- inode dedup → Task 4. ✓
- present/missing source probing → Task 5. ✓
- public `resolveSources` entry → Task 6. ✓
- launch command → Task 8. ✓
- shell UI (glass nav + Observatory theme) → Tasks 10, 11, 12. ✓
- Convention-variable sources (memories) noted as default-now/profile-later in `probe.ts` comment, deferred to Slice 1.5 per spec. ✓

**2. Placeholder scan:** No TBD/TODO/"handle edge cases"/"similar to" — every code step shows full code. ✓

**3. Type consistency:** `SourceId`, `ConfigRoot`, `ResolvedSource`, `ResolvedRoot`, `ResolveOptions` defined in Task 3 and used unchanged in Tasks 4–7. `resolveSources`, `discoverConfigRoots`, `candidatePaths`, `probeSources`, `buildServer` names consistent across tasks. Ports: server 4317, web 4318 (proxy targets 4317) — consistent across Tasks 7, 8, 9. ✓

---

## Out of scope (next plans)

- **Slice 1:** `parser/` (transcript → normalized `SessionEvent`) + static read-only pages wired to real data.
- **Slice 1.5:** `discovery/` + `introspect init` (heuristic + optional `--with-claude`) → `profile.json`.
- **Slice 2:** Projects/Sessions explorer + static graph replay.
- **Slice 3:** Live (`watcher` + WebSocket + real-time graph + reasoning rail).
- **Slice 4:** Export (`tar.gz` + `manifest.json` + `restore.sh`, secret redaction).
