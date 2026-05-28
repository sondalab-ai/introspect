import { join } from "node:path";
import { readMarkdownDir } from "./markdownDir.js";
import { asString } from "./frontmatter.js";
import type { ResolvedRoot } from "../sources/types.js";

export interface CommandItem {
  rootPath: string;
  path: string;
  name: string;
  description: string;
  body: string;
  bodyPreview: string;
}

/** Read slash commands from `<root>/commands/*.md`. */
export function readCommands(roots: ResolvedRoot[]): CommandItem[] {
  const out: CommandItem[] = [];
  for (const { root } of roots) {
    const items = readMarkdownDir(join(root.realPath, "commands"));
    for (const it of items) {
      out.push({
        rootPath: root.realPath,
        path: it.path,
        name: it.name,
        description: asString(it.meta.description),
        body: it.body,
        bodyPreview: it.bodyPreview,
      });
    }
  }
  return out;
}
