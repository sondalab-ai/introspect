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
