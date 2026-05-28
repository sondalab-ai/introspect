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
