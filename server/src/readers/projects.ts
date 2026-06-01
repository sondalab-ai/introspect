import { existsSync, openSync, readSync, closeSync, readdirSync, statSync } from "node:fs";
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
  /** Real working directory, read from the newest session transcript; undefined if unknown. */
  cwd?: string;
  /** Whether `cwd` still exists on disk. undefined when `cwd` is unknown. */
  cwdExists?: boolean;
}

/** Read the first `cwd` field from a `.jsonl` transcript, scanning only the head. */
function readCwd(path: string): string | undefined {
  const HEAD = 64 * 1024;
  let fd: number;
  try { fd = openSync(path, "r"); } catch { return undefined; }
  try {
    const buf = Buffer.alloc(HEAD);
    const read = readSync(fd, buf, 0, HEAD, 0);
    const text = buf.subarray(0, read).toString("utf8");
    for (const line of text.split("\n")) {
      if (!line.includes("\"cwd\"")) continue;
      try {
        const cwd = (JSON.parse(line) as { cwd?: unknown }).cwd;
        if (typeof cwd === "string" && cwd) return cwd;
      } catch {
        // partial/invalid line; keep scanning
      }
    }
  } catch {
    // unreadable; fall through
  } finally {
    closeSync(fd);
  }
  return undefined;
}

function listSessions(projectDir: string): { count: number; lastMs: number; newest?: string } {
  let count = 0;
  let lastMs = 0;
  let newest: string | undefined;
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
      if (ms >= lastMs) { lastMs = ms; newest = p; }
    } catch {
      // skip
    }
  }
  return { count, lastMs, newest };
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
      const { count, lastMs, newest } = listSessions(p);
      const cwd = newest ? readCwd(newest) : undefined;
      out.push({
        id: `${root.realPath}::${slug}`,
        rootPath: root.realPath,
        slug,
        sessionCount: count,
        lastActivityMs: lastMs,
        cwd,
        cwdExists: cwd ? existsSync(cwd) : undefined,
      });
    }
  }
  out.sort((a, b) => b.lastActivityMs - a.lastActivityMs);
  return out;
}
