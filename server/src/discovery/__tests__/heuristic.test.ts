import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverHeuristic } from "../heuristic.js";
import type { ResolvedRoot } from "../../sources/types.js";

function rootOf(dir: string): ResolvedRoot {
  return { root: { declaredPath: dir, realPath: realpathSync(dir), inode: 0 }, sources: [] };
}

describe("discoverHeuristic", () => {
  let root: string;
  let repo: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "h-root-"));
    repo = mkdtempSync(join(tmpdir(), "h-repo-"));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  });

  it("finds <repo>/docs/memory/ for each projects/<slug>", () => {
    const slug = realpathSync(repo).replace(/\//g, "-");
    mkdirSync(join(root, "projects", slug), { recursive: true });
    mkdirSync(join(repo, "docs", "memory"), { recursive: true });

    const r = discoverHeuristic([rootOf(root)]);
    expect(r.extraMemoryDirs).toContain(realpathSync(join(repo, "docs", "memory")));
    expect(r.provenance[realpathSync(join(repo, "docs", "memory"))]).toBe("heuristic");
  });

  it("ignores candidates that do not exist", () => {
    const slug = realpathSync(repo).replace(/\//g, "-");
    mkdirSync(join(root, "projects", slug), { recursive: true });
    const r = discoverHeuristic([rootOf(root)]);
    expect(r.extraMemoryDirs).toEqual([]);
  });

  it("picks up declared paths from <root>/CLAUDE.md", () => {
    writeFileSync(
      join(root, "CLAUDE.md"),
      "Project-specific memories live under docs/memory/ inside each repo."
    );
    const slug = realpathSync(repo).replace(/\//g, "-");
    mkdirSync(join(root, "projects", slug), { recursive: true });
    mkdirSync(join(repo, "docs", "memory"), { recursive: true });

    const r = discoverHeuristic([rootOf(root)]);
    expect(r.extraMemoryDirs).toContain(realpathSync(join(repo, "docs", "memory")));
  });

  it("deduplicates results across multiple roots", () => {
    const slug = realpathSync(repo).replace(/\//g, "-");
    mkdirSync(join(root, "projects", slug), { recursive: true });
    const root2 = mkdtempSync(join(tmpdir(), "h-root2-"));
    mkdirSync(join(root2, "projects", slug), { recursive: true });
    mkdirSync(join(repo, "docs", "memory"), { recursive: true });
    try {
      const r = discoverHeuristic([rootOf(root), rootOf(root2)]);
      expect(
        r.extraMemoryDirs.filter((p) => p === realpathSync(join(repo, "docs", "memory")))
      ).toHaveLength(1);
    } finally {
      rmSync(root2, { recursive: true, force: true });
    }
  });

  it("resolves slugs when path components contain '.' (e.g. user.name)", () => {
    // Simulate /tmp/xyz/user.name/proj-with-dash where Claude's slug encodes
    // both `/` and `.` as `-`, producing `-tmp-xyz-user-name-proj-with-dash`.
    const dotDir = join(root, "user.name", "proj-with-dash");
    mkdirSync(dotDir, { recursive: true });
    mkdirSync(join(dotDir, "docs", "memory"), { recursive: true });
    // The slug encodes the real path of `dotDir` (resolved through realpath).
    const slug = realpathSync(dotDir).replace(/[/.]/g, "-");
    mkdirSync(join(root, "projects", slug), { recursive: true });

    const r = discoverHeuristic([rootOf(root)]);
    expect(r.extraMemoryDirs).toContain(realpathSync(join(dotDir, "docs", "memory")));
  });
});
