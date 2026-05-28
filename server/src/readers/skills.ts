import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import matter from "gray-matter";
import { asString, bodyPreview } from "./frontmatter.js";
import type { ResolvedRoot } from "../sources/types.js";

export interface SkillItem {
  rootPath: string;
  path: string;
  name: string;
  description: string;
  bodyPreview: string;
}

const SKILL_FILE = "SKILL.md";
/** Max nesting depth from the plugins root to look for SKILL.md. */
const MAX_DEPTH = 4;

function walk(dir: string, depth: number, out: string[]): void {
  if (depth > MAX_DEPTH) return;
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      walk(p, depth + 1, out);
    } else if (entry === SKILL_FILE) {
      out.push(p);
    }
  }
}

/** Read skill definitions from `<root>/plugins/**\/SKILL.md`, capped depth. */
export function readSkills(roots: ResolvedRoot[]): SkillItem[] {
  const out: SkillItem[] = [];
  for (const { root } of roots) {
    const pluginsDir = join(root.realPath, "plugins");
    const files: string[] = [];
    walk(pluginsDir, 0, files);
    for (const path of files) {
      const raw = readFileSync(path, "utf8");
      const parsed = matter(raw);
      const meta = parsed.data ?? {};
      const body = parsed.content.trimStart();
      out.push({
        rootPath: root.realPath,
        path,
        name: asString(meta.name) || path,
        description: asString(meta.description),
        bodyPreview: bodyPreview(body),
      });
    }
  }
  return out;
}
