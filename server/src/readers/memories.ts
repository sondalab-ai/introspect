import { join } from "node:path";
import { readMarkdownDir } from "./markdownDir.js";
import type { ResolvedRoot } from "../sources/types.js";

export interface MemoryItem {
  rootPath: string;
  path: string;
  name: string;
  meta: Record<string, unknown>;
  bodyPreview: string;
}

/** Immediate `.md` children of `<root>/memory/`. Convention-variable; refined
 * by the discovery profile in Slice 1.5. */
export function readMemories(roots: ResolvedRoot[]): MemoryItem[] {
  const out: MemoryItem[] = [];
  for (const { root } of roots) {
    const items = readMarkdownDir(join(root.realPath, "memory"));
    for (const it of items) {
      out.push({
        rootPath: root.realPath,
        path: it.path,
        name: it.name,
        meta: it.meta,
        bodyPreview: it.bodyPreview,
      });
    }
  }
  return out;
}
