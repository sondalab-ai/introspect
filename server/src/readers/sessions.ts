import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { readTranscript, type Transcript } from "../parser/transcript.js";
import type { SessionMeta } from "../parser/types.js";
import type { ResolvedRoot } from "../sources/types.js";

export interface SessionListItem extends SessionMeta {
  rootPath: string;
  slug: string;
  filePath: string;
  fileSize: number;
}

function listJsonl(projectDir: string): { name: string; path: string; size: number }[] {
  if (!existsSync(projectDir)) return [];
  const out: { name: string; path: string; size: number }[] = [];
  for (const entry of readdirSync(projectDir)) {
    if (!entry.endsWith(".jsonl")) continue;
    const p = join(projectDir, entry);
    try {
      const st = statSync(p);
      if (!st.isFile()) continue;
      out.push({ name: entry, path: p, size: st.size });
    } catch {
      // skip
    }
  }
  return out;
}

function findProjectDir(roots: ResolvedRoot[], slug: string): { rootPath: string; dir: string } | null {
  for (const { root } of roots) {
    const dir = join(root.realPath, "projects", slug);
    if (existsSync(dir)) return { rootPath: root.realPath, dir };
  }
  return null;
}

export function readSessions(roots: ResolvedRoot[], slug: string): SessionListItem[] {
  const target = findProjectDir(roots, slug);
  if (!target) return [];
  const out: SessionListItem[] = [];
  for (const f of listJsonl(target.dir)) {
    const t = readTranscript(f.path);
    out.push({
      ...t.meta,
      rootPath: target.rootPath,
      slug,
      filePath: f.path,
      fileSize: f.size,
    });
  }
  out.sort((a, b) => (b.lastTs ?? "").localeCompare(a.lastTs ?? ""));
  return out;
}

export function readSession(
  roots: ResolvedRoot[], slug: string, sessionId: string,
): Transcript | null {
  const target = findProjectDir(roots, slug);
  if (!target) return null;
  const path = join(target.dir, `${sessionId}.jsonl`);
  if (!existsSync(path)) return null;
  return readTranscript(path);
}
