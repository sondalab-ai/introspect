import { join } from "node:path";
import { readMarkdownDir } from "./markdownDir.js";
import { asString } from "./frontmatter.js";
import { pluginInstallPaths } from "./pluginPaths.js";
import { annotatePrecedence, type ItemSource, type Precedence } from "./precedence.js";
import type { ResolvedRoot } from "../sources/types.js";

export interface AgentItem extends Precedence {
  rootPath: string;
  path: string;
  name: string;
  description: string;
  tools: string;
  body: string;
  bodyPreview: string;
  source: ItemSource;
}

/** Read agent definitions from `<root>/agents/*.md` and each plugin's `<installPath>/agents/*.md`. */
export function readAgents(roots: ResolvedRoot[]): AgentItem[] {
  const out: Omit<AgentItem, keyof Precedence>[] = [];
  for (const { root } of roots) {
    const dirs: { dir: string; source: ItemSource }[] = [
      { dir: join(root.realPath, "agents"), source: "user" },
      ...pluginInstallPaths(root.realPath).map((p) => ({ dir: join(p, "agents"), source: "plugin" as const })),
    ];
    for (const { dir, source } of dirs) {
      for (const it of readMarkdownDir(dir)) {
        out.push({
          rootPath: root.realPath,
          path: it.path,
          name: asString(it.meta.name) || it.name,
          description: asString(it.meta.description),
          tools: asString(it.meta.tools),
          body: it.body,
          bodyPreview: it.bodyPreview,
          source,
        });
      }
    }
  }
  return annotatePrecedence(out);
}
