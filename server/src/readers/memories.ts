import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { readMarkdownDir } from "./markdownDir.js";
import type { ResolvedRoot } from "../sources/types.js";

export interface MemoryItem {
  rootPath: string;
  path: string;
  name: string;
  meta: Record<string, unknown>;
  bodyPreview: string;
  /** "global" for `<root>/memory/`, or the project slug for `<root>/projects/<slug>/memory/`. */
  scope: string;
}

function collectFrom(rootPath: string, memoryDir: string, scope: string): MemoryItem[] {
  return readMarkdownDir(memoryDir).map((it) => ({
    rootPath,
    path: it.path,
    name: it.name,
    meta: it.meta,
    bodyPreview: it.bodyPreview,
    scope,
  }));
}

function listSubdirs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    try {
      if (statSync(p).isDirectory()) out.push(entry);
    } catch {
      // skip unreadable
    }
  }
  return out;
}

/**
 * Aggregate memory items per root from both `<root>/memory/` (global scope)
 * and `<root>/projects/<slug>/memory/` (per-project scope).
 * Convention-variable; refined by the discovery profile in Slice 1.5.
 */
export function readMemories(roots: ResolvedRoot[]): MemoryItem[] {
  const out: MemoryItem[] = [];
  for (const { root } of roots) {
    out.push(...collectFrom(root.realPath, join(root.realPath, "memory"), "global"));
    const projectsDir = join(root.realPath, "projects");
    for (const slug of listSubdirs(projectsDir)) {
      out.push(...collectFrom(root.realPath, join(projectsDir, slug, "memory"), slug));
    }
  }
  return out;
}
