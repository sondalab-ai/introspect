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

/** Register a plugin install path in `<dir>/plugins/installed_plugins.json` (v2). */
function registerPlugin(dir: string, id: string, installPath: string): void {
  mkdirSync(join(dir, "plugins"), { recursive: true });
  writeFileSync(
    join(dir, "plugins", "installed_plugins.json"),
    JSON.stringify({ version: 2, plugins: { [id]: [{ installPath }] } })
  );
}

describe("readSkills", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "skills-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns [] when nothing is installed", () => {
    expect(readSkills([rootOf(dir)])).toEqual([]);
  });

  it("reads an installed plugin's skills/ and parses frontmatter", () => {
    const installPath = join(dir, "plugins", "cache", "mp", "p1", "v1");
    mkdirSync(join(installPath, "skills", "alpha"), { recursive: true });
    writeFileSync(
      join(installPath, "skills", "alpha", "SKILL.md"),
      "---\nname: alpha\ndescription: Does alpha\n---\nbody"
    );
    registerPlugin(dir, "p1@mp", installPath);

    const items = readSkills([rootOf(dir)]);
    expect(items.map((i) => i.name)).toEqual(["alpha"]);
    expect(items[0]!.description).toBe("Does alpha");
    expect(items[0]!.path.endsWith("SKILL.md")).toBe(true);
  });

  it("also reads personal skills under <root>/skills/", () => {
    mkdirSync(join(dir, "skills", "memory-org"), { recursive: true });
    writeFileSync(
      join(dir, "skills", "memory-org", "SKILL.md"),
      "---\nname: memory-org\ndescription: Wires repo memory\n---\nbody"
    );
    const installPath = join(dir, "plugins", "cache", "mp", "p1", "v1");
    mkdirSync(join(installPath, "skills", "alpha"), { recursive: true });
    writeFileSync(join(installPath, "skills", "alpha", "SKILL.md"), "---\nname: alpha\n---\nb");
    registerPlugin(dir, "p1@mp", installPath);

    const names = readSkills([rootOf(dir)]).map((i) => i.name).sort();
    expect(names).toEqual(["alpha", "memory-org"]);
  });

  it("flags a plugin skill shadowed by a same-named personal skill", () => {
    mkdirSync(join(dir, "skills", "frontend-design"), { recursive: true });
    writeFileSync(join(dir, "skills", "frontend-design", "SKILL.md"), "---\nname: frontend-design\n---\nu");
    const installPath = join(dir, "plugins", "cache", "mp", "fd", "v1");
    mkdirSync(join(installPath, "skills", "frontend-design"), { recursive: true });
    writeFileSync(join(installPath, "skills", "frontend-design", "SKILL.md"), "---\nname: frontend-design\n---\np");
    registerPlugin(dir, "fd@mp", installPath);

    const items = readSkills([rootOf(dir)]);
    expect(items).toHaveLength(2);
    const user = items.find((i) => i.source === "user")!;
    const plugin = items.find((i) => i.source === "plugin")!;
    expect(user.shadowed).toBe(false);
    expect(plugin.shadowed).toBe(true);
  });

  it("ignores plugin tree noise outside skills/ (e.g. .cursor, marketplaces)", () => {
    const installPath = join(dir, "plugins", "cache", "mp", "p1", "v1");
    mkdirSync(join(installPath, ".cursor", "skills", "ghost"), { recursive: true });
    writeFileSync(join(installPath, ".cursor", "skills", "ghost", "SKILL.md"), "---\nname: ghost\n---\nx");
    registerPlugin(dir, "p1@mp", installPath);
    expect(readSkills([rootOf(dir)])).toEqual([]);
  });

  it("does not descend past the depth cap (4)", () => {
    const deep = join(dir, "skills", "a", "b", "c", "d", "e");
    mkdirSync(deep, { recursive: true });
    writeFileSync(join(deep, "SKILL.md"), "---\nname: too-deep\n---\nx");
    expect(readSkills([rootOf(dir)])).toEqual([]);
  });
});
