import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import matter from "gray-matter";
import { bodyPreview } from "./frontmatter.js";

export interface MarkdownItem {
  /** Filename without the `.md` extension. */
  name: string;
  /** Absolute path to the file. */
  path: string;
  /** Parsed YAML frontmatter (empty object if absent). */
  meta: Record<string, unknown>;
  /** Markdown body (without frontmatter). */
  body: string;
  /** First ~200 characters of the body, single-line, trimmed. */
  bodyPreview: string;
}

/** List `*.md` files in a directory, parse frontmatter, sort by name. */
export function readMarkdownDir(dirPath: string): MarkdownItem[] {
  if (!existsSync(dirPath)) return [];
  const entries = readdirSync(dirPath);
  const items: MarkdownItem[] = [];
  for (const entry of entries) {
    if (!entry.endsWith(".md")) continue;
    const path = join(dirPath, entry);
    let raw: string;
    try {
      const st = statSync(path);
      if (!st.isFile()) continue;
      raw = readFileSync(path, "utf8");
    } catch {
      // Entry vanished, broken symlink, or unreadable — skip.
      continue;
    }
    const parsed = matter(raw);
    const body = parsed.content.trimStart();
    items.push({
      name: entry.slice(0, -3),
      path,
      meta: parsed.data ?? {},
      body,
      bodyPreview: bodyPreview(body),
    });
  }
  items.sort((a, b) => a.name.localeCompare(b.name));
  return items;
}
