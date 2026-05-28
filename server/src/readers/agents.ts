import { join } from "node:path";
import { readMarkdownDir } from "./markdownDir.js";
import type { ResolvedRoot } from "../sources/types.js";

export interface AgentItem {
  rootPath: string;
  path: string;
  name: string;
  description: string;
  tools: string;
  bodyPreview: string;
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** Read agent definitions from `<root>/agents/*.md`. */
export function readAgents(roots: ResolvedRoot[]): AgentItem[] {
  const out: AgentItem[] = [];
  for (const { root } of roots) {
    const items = readMarkdownDir(join(root.realPath, "agents"));
    for (const it of items) {
      out.push({
        rootPath: root.realPath,
        path: it.path,
        name: asString(it.meta.name) || it.name,
        description: asString(it.meta.description),
        tools: asString(it.meta.tools),
        bodyPreview: it.bodyPreview,
      });
    }
  }
  return out;
}
