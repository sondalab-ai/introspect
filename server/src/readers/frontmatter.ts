/** Coerce an unknown frontmatter value to a string; non-strings become "". */
export function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

const PREVIEW_LIMIT = 200;

/** Single-line, trimmed, capped preview of a markdown body. */
export function bodyPreview(body: string, limit: number = PREVIEW_LIMIT): string {
  return body.replace(/\s+/g, " ").trim().slice(0, limit);
}
