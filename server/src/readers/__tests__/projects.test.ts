import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readProjects } from "../projects.js";
import type { ResolvedRoot } from "../../sources/types.js";

function rootOf(dir: string): ResolvedRoot {
  return { root: { declaredPath: dir, realPath: realpathSync(dir), inode: 0 }, sources: [] };
}

describe("readProjects", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "proj-")); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it("returns [] when no projects/ dir exists", () => {
    expect(readProjects([rootOf(dir)])).toEqual([]);
  });

  it("lists project slugs with session counts and last activity", () => {
    const p1 = join(dir, "projects", "-Users-a-repo-foo");
    mkdirSync(p1, { recursive: true });
    writeFileSync(join(p1, "s1.jsonl"), "{}\n");
    writeFileSync(join(p1, "s2.jsonl"), "{}\n");
    const items = readProjects([rootOf(dir)]);
    expect(items).toHaveLength(1);
    expect(items[0]!.slug).toBe("-Users-a-repo-foo");
    expect(items[0]!.sessionCount).toBe(2);
    expect(items[0]!.lastActivityMs).toBeGreaterThan(0);
  });

  it("aggregates projects across multiple roots", () => {
    const a = mkdtempSync(join(tmpdir(), "proj-a-"));
    const b = mkdtempSync(join(tmpdir(), "proj-b-"));
    mkdirSync(join(a, "projects", "-p1"), { recursive: true });
    mkdirSync(join(b, "projects", "-p2"), { recursive: true });
    try {
      const items = readProjects([rootOf(a), rootOf(b)]);
      expect(items.map((i) => i.slug).sort()).toEqual(["-p1", "-p2"]);
    } finally {
      rmSync(a, { recursive: true, force: true });
      rmSync(b, { recursive: true, force: true });
    }
  });

  it("encodes a stable id combining rootPath and slug", () => {
    mkdirSync(join(dir, "projects", "-p"), { recursive: true });
    const items = readProjects([rootOf(dir)]);
    expect(items[0]!.id).toContain("-p");
    expect(items[0]!.id).toContain(realpathSync(dir));
  });
});
