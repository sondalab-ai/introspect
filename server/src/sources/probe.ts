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
