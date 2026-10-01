import matter from "gray-matter";

/** Coerce an unknown frontmatter value to a string; non-strings become "". */
export function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

const PREVIEW_LIMIT = 200;

/** Single-line, trimmed, capped preview of a markdown body. */
export function bodyPreview(body: string, limit: number = PREVIEW_LIMIT): string {
  return body.replace(/\s+/g, " ").trim().slice(0, limit);
}

const FENCE = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;
const KEY_VALUE = /^([A-Za-z0-9_-]+):[ \t]*(.*)$/;

/**
 * Split a markdown file into frontmatter and body. Claude Code accepts frontmatter
 * that isn't valid YAML (e.g. `argument-hint: [a] [b]`), so when YAML parsing fails
 * this falls back to reading top-level `key: value` lines as plain strings.
 */
export function parseFrontmatter(raw: string): { meta: Record<string, unknown>; body: string } {
  try {
    const parsed = matter(raw);
    return { meta: parsed.data ?? {}, body: parsed.content };
  } catch {
    const fence = FENCE.exec(raw);
    if (!fence) return { meta: {}, body: raw };
    const meta: Record<string, unknown> = {};
    for (const line of fence[1]!.split(/\r?\n/)) {
      const kv = KEY_VALUE.exec(line);
      if (kv) meta[kv[1]!] = kv[2]!.trim();
    }
    return { meta, body: raw.slice(fence[0].length) };
  }
}
