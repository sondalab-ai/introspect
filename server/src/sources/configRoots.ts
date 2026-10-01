import { readdirSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ConfigRoot, ResolveOptions } from "./types.js";

/**
 * List the `.claude*` directories in `home` (e.g. `~/.claude`, `~/.claude-perso`),
 * sorted by name so `~/.claude` comes first. Files such as `~/.claude.json` are skipped.
 */
function autoDiscoverClaudeDirs(home: string): string[] {
  try {
    return readdirSync(home, { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name.startsWith(".claude"))
      .map((e) => join(home, e.name))
      .sort();
  } catch {
    return [];
  }
}

/**
 * Build the ordered list of candidate root paths before resolution.
 *
 * - CLAUDE_CONFIG_DIR set: that directory only.
 * - CLAUDE_CONFIG_DIR unset: every `~/.claude*` directory, so a user with several
 *   config dirs sees all of them; `~/.claude` when none exists yet.
 * - extraRoots are always appended last.
 */
export function candidatePaths(opts: ResolveOptions = {}): string[] {
  const home = opts.homeDir ?? homedir();
  const env = opts.env ?? process.env;
  const explicitDir = env.CLAUDE_CONFIG_DIR;
  let bases: string[];
  if (explicitDir) {
    bases = [explicitDir];
  } else {
    const discovered = autoDiscoverClaudeDirs(home);
    bases = discovered.length > 0 ? discovered : [join(home, ".claude")];
  }
  return [...bases, ...(opts.extraRoots ?? [])];
}

/**
 * Resolve candidate paths through realpath and deduplicate by inode.
 * Paths that do not exist or aren't traversable (ENOENT/ENOTDIR/ELOOP)
 * are skipped silently — they're simply not config roots. Any other I/O
 * error (e.g. EACCES) is rethrown so the caller can surface it.
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
    } catch (err) {
      if (isMissingPathError(err)) continue;
      throw err;
    }
    if (seen.has(inode)) continue;
    seen.add(inode);
    roots.push({ declaredPath, realPath, inode });
  }
  return roots;
}

const MISSING_PATH_CODES = new Set(["ENOENT", "ENOTDIR", "ELOOP"]);
function isMissingPathError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    typeof (err as { code: unknown }).code === "string" &&
    MISSING_PATH_CODES.has((err as { code: string }).code)
  );
}
