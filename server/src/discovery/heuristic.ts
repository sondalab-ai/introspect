import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { join } from "node:path";
import type { ResolvedRoot } from "../sources/types.js";

export interface HeuristicResult {
  extraMemoryDirs: string[];
  provenance: Record<string, "heuristic">;
}

const CANDIDATES_PER_REPO = ["docs/memory", "docs/memories", ".claude/memory"];

function listProjectSlugs(root: string): string[] {
  const projectsDir = join(root, "projects");
  if (!existsSync(projectsDir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(projectsDir)) {
    try {
      if (statSync(join(projectsDir, entry)).isDirectory()) out.push(entry);
    } catch {
      // ignore
    }
  }
  return out;
}

/**
 * Resolve a Claude-style slug back to an absolute filesystem path.
 *
 * Claude builds slugs by replacing both `/` and `.` with `-`, which makes the
 * inverse ambiguous: a `-` in the slug may correspond to a path separator, a
 * literal `-` (e.g. `camunda-hub`), or a `.` (e.g. `marcello.barile`).
 *
 * Resolve by walking the live filesystem level by level: at each directory we
 * inspect real entries, slug-encode their names with the same rule, and recurse
 * into any whose encoded form is a prefix of the remaining slug tokens.
 */
function slugToPath(slug: string): string | null {
  const stripped = slug.replace(/^-/, "");
  const tokens = stripped.split("-");
  return walk("/", tokens, 0);
}

function encodeName(name: string): string {
  return name.replace(/[/.]/g, "-");
}

function walk(prefix: string, tokens: string[], i: number): string | null {
  if (i >= tokens.length) {
    try {
      if (statSync(prefix).isDirectory()) return prefix;
    } catch {
      // fall through
    }
    return null;
  }
  let entries: string[];
  try {
    entries = readdirSync(prefix);
  } catch {
    return null;
  }
  const remaining = tokens.length - i;
  // Prefer the longest-encoded entry first so paths with `-` or `.` are
  // matched in one shot before shorter false-positive prefixes.
  const candidates: { entry: string; consumed: number }[] = [];
  for (const entry of entries) {
    const enc = encodeName(entry).split("-");
    if (enc.length > remaining) continue;
    let ok = true;
    for (let t = 0; t < enc.length; t++) {
      if (enc[t] !== tokens[i + t]) { ok = false; break; }
    }
    if (ok) candidates.push({ entry, consumed: enc.length });
  }
  candidates.sort((a, b) => b.consumed - a.consumed);
  for (const c of candidates) {
    const next = prefix.endsWith("/") ? prefix + c.entry : prefix + "/" + c.entry;
    try {
      if (!statSync(next).isDirectory()) continue;
    } catch {
      continue;
    }
    const r = walk(next, tokens, i + c.consumed);
    if (r) return r;
  }
  return null;
}

function extractDeclaredFromInstructions(body: string): string[] {
  const out: string[] = [];
  const rel = /docs\/[A-Za-z0-9_-]+\/(memory|memories)/g;
  const bare = /docs\/(memory|memories)\b/g;
  let m: RegExpMatchArray | null;
  while ((m = rel.exec(body))) out.push(m[0]);
  while ((m = bare.exec(body))) out.push(m[0]);
  return out;
}

function asRealDir(p: string): string | null {
  try {
    const r = realpathSync(p);
    if (!statSync(r).isDirectory()) return null;
    return r;
  } catch {
    return null;
  }
}

export function discoverHeuristic(roots: ResolvedRoot[]): HeuristicResult {
  const found = new Set<string>();
  for (const { root } of roots) {
    const slugs = listProjectSlugs(root.realPath);
    const repoPaths = slugs.map(slugToPath).filter((p): p is string => p !== null);

    for (const repoPath of repoPaths) {
      for (const rel of CANDIDATES_PER_REPO) {
        const real = asRealDir(join(repoPath, rel));
        if (real) found.add(real);
      }
    }

    const claudeMd = join(root.realPath, "CLAUDE.md");
    if (!existsSync(claudeMd)) continue;
    let body: string;
    try { body = readFileSync(claudeMd, "utf8"); } catch { continue; }
    for (const rel of extractDeclaredFromInstructions(body)) {
      for (const repoPath of repoPaths) {
        const real = asRealDir(join(repoPath, rel));
        if (real) found.add(real);
      }
    }
  }
  const extraMemoryDirs = [...found].sort();
  const provenance: Record<string, "heuristic"> = {};
  for (const p of extraMemoryDirs) provenance[p] = "heuristic";
  return { extraMemoryDirs, provenance };
}
