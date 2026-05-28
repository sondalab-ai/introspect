import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readSkills } from "../skills.js";
import type { ResolvedRoot } from "../../sources/types.js";

function rootOf(dir: string): ResolvedRoot {
  return {
    root: { declaredPath: dir, realPath: realpathSync(dir), inode: 0 },
    sources: [],
  };
}

describe("readSkills", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "skills-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns [] when no plugins dir exists", () => {
    expect(readSkills([rootOf(dir)])).toEqual([]);
  });

  it("finds SKILL.md files up to the depth cap and parses frontmatter", () => {
    const pluginsDir = join(dir, "plugins");
    mkdirSync(join(pluginsDir, "p1", "skills", "alpha"), { recursive: true });
    writeFileSync(
      join(pluginsDir, "p1", "skills", "alpha", "SKILL.md"),
      "---\nname: alpha\ndescription: Does alpha\n---\nbody"
    );
    mkdirSync(join(pluginsDir, "p2", "skills", "beta"), { recursive: true });
    writeFileSync(
      join(pluginsDir, "p2", "skills", "beta", "SKILL.md"),
      "---\nname: beta\n---\nbody2"
    );

    const items = readSkills([rootOf(dir)]).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
    expect(items.map((i) => i.name)).toEqual(["alpha", "beta"]);
    expect(items[0]!.description).toBe("Does alpha");
    expect(items[0]!.path.endsWith("SKILL.md")).toBe(true);
  });

  it("does not descend past the depth cap (4)", () => {
    const deep = join(dir, "plugins", "a", "b", "c", "d", "e");
    mkdirSync(deep, { recursive: true });
    writeFileSync(join(deep, "SKILL.md"), "---\nname: too-deep\n---\nx");
    expect(readSkills([rootOf(dir)])).toEqual([]);
  });
});
