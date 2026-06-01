import { join } from "node:path";
import { readMarkdownDir } from "./markdownDir.js";
import { asString } from "./frontmatter.js";
import { pluginInstallPaths } from "./pluginPaths.js";
import { annotatePrecedence, type ItemSource, type Precedence } from "./precedence.js";
import type { ResolvedRoot } from "../sources/types.js";

export interface CommandItem extends Precedence {
  rootPath: string;
  path: string;
  name: string;
  description: string;
  body: string;
  bodyPreview: string;
  source: ItemSource;
}

/** Read slash commands from `<root>/commands/*.md` and each plugin's `<installPath>/commands/*.md`. */
export function readCommands(roots: ResolvedRoot[]): CommandItem[] {
  const out: Omit<CommandItem, keyof Precedence>[] = [];
  for (const { root } of roots) {
    const dirs: { dir: string; source: ItemSource }[] = [
      { dir: join(root.realPath, "commands"), source: "user" },
      ...pluginInstallPaths(root.realPath).map((p) => ({ dir: join(p, "commands"), source: "plugin" as const })),
    ];
    for (const { dir, source } of dirs) {
      for (const it of readMarkdownDir(dir)) {
        out.push({
          rootPath: root.realPath,
          path: it.path,
          name: it.name,
          description: asString(it.meta.description),
          body: it.body,
          bodyPreview: it.bodyPreview,
          source,
        });
      }
    }
  }
  return annotatePrecedence(out);
}
