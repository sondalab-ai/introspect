import { existsSync, readdirSync, statSync } from "node:fs";
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
}

function listSessions(projectDir: string): { count: number; lastMs: number } {
  let count = 0;
  let lastMs = 0;
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
      if (ms > lastMs) lastMs = ms;
    } catch {
      // skip
    }
  }
  return { count, lastMs };
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
      const { count, lastMs } = listSessions(p);
      out.push({
        id: `${root.realPath}::${slug}`,
        rootPath: root.realPath,
        slug,
        sessionCount: count,
        lastActivityMs: lastMs,
      });
    }
  }
  out.sort((a, b) => b.lastActivityMs - a.lastActivityMs);
  return out;
}
