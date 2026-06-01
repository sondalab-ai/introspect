# Introspect

A local, read-only dashboard to **audit and observe how Claude Code is configured and how it operates** — in replay and in real time.

Introspect reads the files Claude Code already writes on your machine (instructions, skills, agents, commands, memories, plugins, settings, project transcripts) and renders them as a navigable dashboard. It also tails the active session and draws a live execution graph of what Claude is doing right now: subagents, reasoning, tool calls, files touched.

It never writes to Claude's config. The only output it produces is an export bundle, to a destination you choose.

---

## Highlights

- **Configuration inspector** — system prompt / instructions, skills, agents (subagents), slash commands, memories, hooks, permissions, environment variables, plugins.
- **Projects & sessions explorer** — browse every project directory Claude has touched, drill down to its sessions, and replay a past session as an execution graph.
- **Live observability** — a real-time graph of the active session (subagent spawns, tool use, file reads/writes, current reasoning) streamed over WebSocket.
- **Export & restore** — bundle selected config sources into a `.tar.gz` with a manifest and a restore script, to recreate the same Claude setup on another machine. Secrets are redacted by default.
- **Convention-aware discovery** — `introspect init` builds a profile of where your custom artifacts live (specs, memories, custom prompts), so source resolution is not hardcoded.

## Design principles

- **Read-only** on Claude's filesystem. No mutation of `settings.json`, hooks, memories, etc.
- **Symlink-agnostic.** Every candidate path is resolved via `realpath`; config roots are deduped by inode.
- **Convention-aware, not hardcoded.** Variable conventions are captured in an editable discovery profile, not baked into the code.
- **Local & single-user.** The server binds to `localhost` only — no network exposure, no auth, no database.
- **Per-section degradation.** A missing or corrupt source surfaces an empty/error state for that section instead of crashing the dashboard.

---

## Tech stack

- **Runtime:** Node + TypeScript (ES modules).
- **Server:** [Fastify](https://fastify.dev/) for read-only REST, [`ws`](https://github.com/websockets/ws) for the live WebSocket channel.
- **File watching:** [`chokidar`](https://github.com/paulmillr/chokidar).
- **Web:** [Vite](https://vite.dev/) + React + TypeScript.
- **Graph:** [`d3-force`](https://github.com/d3/d3-force) layout with custom SVG rendering.
- **Persistence:** none. Sources are read on demand with an in-memory cache invalidated on filesystem events. The only state Introspect owns is its discovery `profile.json`.

## Repository layout

Monorepo with two npm workspaces:

```
server/   Node + Fastify + ws backend
  src/
    bin/         CLI entrypoints (introspect, introspect-init)
    sources/     config-root discovery, realpath resolution, inode dedup
    parser/      transcript (.jsonl) -> normalized SessionEvent model
    readers/     per-source readers (agents, skills, commands, memories, ...)
    discovery/   convention profile (heuristic + optional --with-claude)
    live/        chokidar watcher + WebSocket live stream
    export/      bundle + restore script generation
    api/         REST + WebSocket wiring

web/      Vite + React frontend
  src/
    pages/       one page per nav entry
    components/   shared UI (graph, event stream, markdown, ...)
```

---

## Requirements

- Node.js ≥ 20
- npm ≥ 9 (workspaces)
- Optional: the `claude` CLI, for the (planned) `introspect init --with-claude` enrichment.

## Install

```bash
git clone <repo-url> introspect
cd introspect
npm install
```

## Run (development)

The server and the web app run as separate dev processes. The Vite dev server proxies API and WebSocket traffic to the backend.

```bash
# terminal 1 — backend on :4317
npm run dev:server

# terminal 2 — frontend on :4318 (proxies to :4317)
npm run dev:web
```

Then open <http://localhost:4318>.

## Run (production CLI)

After building, the server serves on `:4317` and opens your browser automatically.

```bash
npm run build --workspaces
introspect          # start the dashboard
```

### Discovery profile

Run once after install (re-run whenever your conventions change):

```bash
introspect init                 # offline heuristic discovery
introspect init --with-claude   # planned: enrich via local claude CLI (currently heuristic only)
```

This writes an editable `profile.json` that `sources/` consumes to locate custom artifacts (specs, memories, prompt directories).

---

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `INTROSPECT_PORT` | `4317` | Backend listen port. |
| `INTROSPECT_EXTRA_ROOTS` | — | Extra Claude config roots (comma-separated) in addition to `CLAUDE_CONFIG_DIR` / `~/.claude`. |
| `CLAUDE_CONFIG_DIR` | `~/.claude` | Honored when present to locate the primary config root. |

## API

All REST endpoints are read-only. The web app proxies these in dev (see `web/vite.config.ts`).

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Liveness probe. |
| `GET` | `/sources` | Resolved config roots and per-source `present`/`missing` status. |
| `GET` | `/instructions` | System prompt / instruction files. |
| `GET` | `/agents` | Subagent definitions. |
| `GET` | `/commands` | Slash command definitions. |
| `GET` | `/skills` | Available skills. |
| `GET` | `/memories` | Global and project memories. |
| `GET` | `/plugins` | Installed plugins and marketplaces. |
| `GET` | `/settings` | Hooks, permissions, env (secrets redacted). |
| `GET` | `/projects` | Projects with metadata (path, session count, last activity). |
| `GET` | `/projects/:slug/sessions` | Sessions for a project. |
| `GET` | `/sessions` | All sessions across projects. |
| `GET` | `/sessions/:slug/:id` | A single normalized transcript (for static replay). |
| `GET` | `/profile` | Current discovery profile and its path. |
| `GET` | `/export` | Streams the export bundle (`application/zip`). |
| `WS` | `/ws/live` | Live `SessionEvent` stream for the active session. |

---

## Testing

The backend is tested with [Vitest](https://vitest.dev/). The parser (the core logic) is built test-first against anonymized real transcript fixtures, including subagent sidechains, malformed lines, and tool-free sessions.

```bash
npm test                           # run the server test suite
npm run test:watch --workspace server
```

## Delivery status

Built in independently reviewable slices (see `docs/superpowers/specs/` and `docs/superpowers/plans/`):

| Slice | Scope | Status |
|---|---|---|
| 0 | Scaffold: monorepo, `sources/` resolution, startup command, UI shell | Implemented |
| 1 | Static config pages + `parser/` | Implemented |
| 1.5 | `discovery/` + `introspect init` (heuristic; `--with-claude` planned) | Implemented |
| 2 | Projects explorer, sessions/history, static graph replay | Implemented |
| 3 | Live watcher + WebSocket + real-time graph | Implemented |
| 4 | Export bundle + manifest + restore script | Implemented |

---

## Security & privacy

Introspect is a local tool. It binds to `localhost`, has no authentication, and is meant for a single user on their own machine. Do not expose the port to a network. Exported bundles redact secrets (tokens in `settings.json` / env) by default; including them requires an explicit opt-in.
