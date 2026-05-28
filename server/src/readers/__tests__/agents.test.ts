import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readAgents } from "../agents.js";
import type { ResolvedRoot } from "../../sources/types.js";

function rootOf(dir: string): ResolvedRoot {
  return {
    root: { declaredPath: dir, realPath: realpathSync(dir), inode: 0 },
    sources: [],
  };
}

describe("readAgents", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "agents-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns [] when the agents dir is absent", () => {
    expect(readAgents([rootOf(dir)])).toEqual([]);
  });

  it("returns agent items with name, description, tools from frontmatter", () => {
    mkdirSync(join(dir, "agents"));
    writeFileSync(
      join(dir, "agents", "code-reviewer.md"),
      "---\nname: code-reviewer\ndescription: Reviews diffs\ntools: Read, Grep\n---\nbody"
    );
    const items = readAgents([rootOf(dir)]);
    expect(items).toHaveLength(1);
    expect(items[0]!.name).toBe("code-reviewer");
    expect(items[0]!.description).toBe("Reviews diffs");
    expect(items[0]!.tools).toBe("Read, Grep");
    expect(items[0]!.rootPath).toBe(realpathSync(dir));
  });
});
