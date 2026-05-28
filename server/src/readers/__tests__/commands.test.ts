import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readCommands } from "../commands.js";
import type { ResolvedRoot } from "../../sources/types.js";

function rootOf(dir: string): ResolvedRoot {
  return {
    root: { declaredPath: dir, realPath: realpathSync(dir), inode: 0 },
    sources: [],
  };
}

describe("readCommands", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "commands-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns [] when the commands dir is absent", () => {
    expect(readCommands([rootOf(dir)])).toEqual([]);
  });

  it("returns slash-command items with description from frontmatter", () => {
    mkdirSync(join(dir, "commands"));
    writeFileSync(
      join(dir, "commands", "decision.md"),
      "---\ndescription: Record a decision\n---\nuse it like /decision"
    );
    const items = readCommands([rootOf(dir)]);
    expect(items).toHaveLength(1);
    expect(items[0]!.name).toBe("decision");
    expect(items[0]!.description).toBe("Record a decision");
    expect(items[0]!.bodyPreview.startsWith("use it like")).toBe(true);
  });
});
