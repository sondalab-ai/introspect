import { existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { readTranscript, type Transcript } from "../parser/transcript.js";
import type { SessionMeta } from "../parser/types.js";
import type { ResolvedRoot } from "../sources/types.js";
import { realPathOr } from "./realPath.js";

export interface SessionListItem extends SessionMeta {
  rootPath: string;
  slug: string;
  filePath: string;
  fileSize: number;
}

const SAFE_SEGMENT = /^[A-Za-z0-9._-]{1,128}$/;

/** Reject any name that could escape its parent dir. */
function isSafeSegment(s: string): boolean {
  if (!SAFE_SEGMENT.test(s)) return false;
  if (s === "." || s === "..") return false;
  if (s.includes("..")) return false;
  return true;
}

/** Resolve `child` under `base` and confirm it stays inside `base`. */
function safeJoinUnder(base: string, child: string): string | null {
  const r = resolve(base, child);
  if (r !== base && !r.startsWith(base + sep)) return null;
  return r;
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

/**
 * Every root's `projects/<slug>` dir that exists, in root order. A project can
 * live in several config roots; dirs reached twice through symlinks are listed once.
 */
function findProjectDirs(roots: ResolvedRoot[], slug: string): { rootPath: string; dir: string }[] {
  if (!isSafeSegment(slug)) return [];
  const out: { rootPath: string; dir: string }[] = [];
  const seen = new Set<string>();
  for (const { root } of roots) {
    const dir = safeJoinUnder(join(root.realPath, "projects"), slug);
    if (!dir || !existsSync(dir)) continue;
    const real = realPathOr(dir);
    if (seen.has(real)) continue;
    seen.add(real);
    out.push({ rootPath: root.realPath, dir });
  }
  return out;
}

export function readSessions(roots: ResolvedRoot[], slug: string): SessionListItem[] {
  const out: SessionListItem[] = [];
  for (const target of findProjectDirs(roots, slug)) {
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
  }
  out.sort((a, b) => (b.lastTs ?? "").localeCompare(a.lastTs ?? ""));
  return out;
}

/** Aggregate sessions across every project of every root, sorted by lastTs desc. */
export function readAllSessions(roots: ResolvedRoot[]): SessionListItem[] {
  const out: SessionListItem[] = [];
  for (const { root } of roots) {
    const projectsDir = join(root.realPath, "projects");
    if (!existsSync(projectsDir)) continue;
    let slugs: string[];
    try { slugs = readdirSync(projectsDir); } catch { continue; }
    for (const slug of slugs) {
      if (!isSafeSegment(slug)) continue;
      const dir = join(projectsDir, slug);
      try {
        if (!statSync(dir).isDirectory()) continue;
      } catch { continue; }
      for (const f of listJsonl(dir)) {
        const t = readTranscript(f.path);
        out.push({
          ...t.meta,
          rootPath: root.realPath,
          slug,
          filePath: f.path,
          fileSize: f.size,
        });
      }
    }
  }
  out.sort((a, b) => (b.lastTs ?? "").localeCompare(a.lastTs ?? ""));
  return out;
}

export function readSession(
  roots: ResolvedRoot[], slug: string, sessionId: string,
): Transcript | null {
  if (!isSafeSegment(sessionId)) return null;
  for (const target of findProjectDirs(roots, slug)) {
    const path = safeJoinUnder(target.dir, `${sessionId}.jsonl`);
    if (path && existsSync(path)) return readTranscript(path);
  }
  return null;
}
