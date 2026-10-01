import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { realPathOr } from "./realPath.js";
import type { ResolvedRoot } from "../sources/types.js";

export interface InstructionsItem {
  rootPath: string;
  path: string;
  content: string;
}

const FILENAME = "CLAUDE.md";

/** Read CLAUDE.md from each resolved root that has one. */
export function readInstructions(roots: ResolvedRoot[]): InstructionsItem[] {
  const out: InstructionsItem[] = [];
  const seenFiles = new Set<string>();
  for (const { root } of roots) {
    const path = join(root.realPath, FILENAME);
    if (!existsSync(path)) continue;
    const realFile = realPathOr(path);
    if (seenFiles.has(realFile)) continue;
    seenFiles.add(realFile);
    out.push({ rootPath: root.realPath, path, content: readFileSync(path, "utf8") });
  }
  return out;
}
