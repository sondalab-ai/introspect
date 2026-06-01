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

  it("reads the real cwd from the newest session transcript", () => {
    const p1 = join(dir, "projects", "-Users-a-b-camunda-hub");
    mkdirSync(p1, { recursive: true });
    writeFileSync(join(p1, "s1.jsonl"), `${JSON.stringify({ type: "user", cwd: "/Users/a.b/src/camunda-hub" })}\n`);
    const items = readProjects([rootOf(dir)]);
    expect(items[0]!.cwd).toBe("/Users/a.b/src/camunda-hub");
  });

  it("flags cwdExists=false when the real folder is gone, true when present", () => {
    const gone = join(dir, "projects", "-gone");
    mkdirSync(gone, { recursive: true });
    writeFileSync(join(gone, "s.jsonl"), `${JSON.stringify({ cwd: join(dir, "does-not-exist") })}\n`);
    const here = join(dir, "projects", "-here");
    mkdirSync(here, { recursive: true });
    writeFileSync(join(here, "s.jsonl"), `${JSON.stringify({ cwd: dir })}\n`);

    const items = readProjects([rootOf(dir)]);
    const bySlug = Object.fromEntries(items.map((i) => [i.slug, i]));
    expect(bySlug["-gone"]!.cwdExists).toBe(false);
    expect(bySlug["-here"]!.cwdExists).toBe(true);
  });

  it("leaves cwd undefined when no transcript carries one", () => {
    const p1 = join(dir, "projects", "-p");
    mkdirSync(p1, { recursive: true });
    writeFileSync(join(p1, "s1.jsonl"), "{}\n");
    expect(readProjects([rootOf(dir)])[0]!.cwd).toBeUndefined();
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
