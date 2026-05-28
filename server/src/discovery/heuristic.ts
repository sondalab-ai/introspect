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
 * Resolve a Claude-style slug (`/path/to/repo` → `-path-to-repo`) back to an
 * absolute filesystem path. The mapping is lossy because `-` is also a legal
 * character inside path components; we walk candidates `-` → `/` greedily
 * against the live filesystem and return the first directory that exists.
 */
function slugToPath(slug: string): string | null {
  const stripped = slug.replace(/^-/, "");
  const tokens = stripped.split("-");
  return walk("", tokens, 0);
}

function walk(prefix: string, tokens: string[], i: number): string | null {
  if (i >= tokens.length) {
    return prefix !== "" && existsSync(prefix) ? prefix : null;
  }
  // Greedily try the longest run of tokens (joined by `-`) as a single
  // child component, then back off. This lets us match path components
  // that legitimately contain `-` (e.g. `h-repo-GsFmiL`).
  for (let j = tokens.length; j > i; j--) {
    const component = tokens.slice(i, j).join("-");
    const candidate = prefix + "/" + component;
    if (existsSync(candidate)) {
      const r = walk(candidate, tokens, j);
      if (r) return r;
    }
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
