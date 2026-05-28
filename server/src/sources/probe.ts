import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ConfigRoot, ResolvedSource, SourceId } from "./types.js";

/**
 * Relative path of each source under a config root. `existsSync` follows
 * symlinks, so this is symlink-agnostic for the source entries themselves.
 *
 * Several mappings here are intentionally Placeholder (not delivered) —
 * they will be refined by the discovery profile (Slice 1.5) which can
 * override paths per user/project convention:
 *   - `skills` and `plugins` currently both resolve to `plugins/` (skills
 *     in practice live under `plugins/<plugin>/skills/`, but Slice 0 only
 *     needs to report presence of the plugins root);
 *   - `memories` defaults to `memory/` even though real layouts vary
 *     (e.g. `docs/memory/` symlinked from the config root);
 *   - `instructions` always reads `CLAUDE.md`; companion files such as
 *     `CLAUDE.local.md` are not surfaced yet.
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
