import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import matter from "gray-matter";
import { asString, bodyPreview } from "./frontmatter.js";
import { pluginInstallPaths } from "./pluginPaths.js";
import { annotatePrecedence, type ItemSource, type Precedence } from "./precedence.js";
import type { ResolvedRoot } from "../sources/types.js";

export interface SkillItem extends Precedence {
  rootPath: string;
  path: string;
  name: string;
  description: string;
  body: string;
  bodyPreview: string;
  source: ItemSource;
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

/**
 * Read skill definitions: personal skills under `<root>/skills/**\/SKILL.md`
 * plus each installed plugin's `<installPath>/skills/**\/SKILL.md`. Depth-capped.
 */
export function readSkills(roots: ResolvedRoot[]): SkillItem[] {
  const out: Omit<SkillItem, keyof Precedence>[] = [];
  for (const { root } of roots) {
    const skillDirs: { dir: string; source: ItemSource }[] = [
      { dir: join(root.realPath, "skills"), source: "user" },
      ...pluginInstallPaths(root.realPath).map((p) => ({ dir: join(p, "skills"), source: "plugin" as const })),
    ];
    for (const { dir, source } of skillDirs) {
      const files: string[] = [];
      walk(dir, 0, files);
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
          body,
          bodyPreview: bodyPreview(body),
          source,
        });
      }
    }
  }
  return annotatePrecedence(out);
}
