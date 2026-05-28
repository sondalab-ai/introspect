import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readInstructions } from "../instructions.js";
import type { ResolvedRoot } from "../../sources/types.js";

function rootOf(dir: string): ResolvedRoot {
  return {
    root: { declaredPath: dir, realPath: realpathSync(dir), inode: 0 },
    sources: [],
  };
}

describe("readInstructions", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "instr-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns the CLAUDE.md content when present", () => {
    writeFileSync(join(dir, "CLAUDE.md"), "# Hello\nbody");
    const items = readInstructions([rootOf(dir)]);
    expect(items).toHaveLength(1);
    expect(items[0]!.content).toBe("# Hello\nbody");
    expect(items[0]!.path).toBe(join(realpathSync(dir), "CLAUDE.md"));
  });

  it("skips roots without a CLAUDE.md", () => {
    const items = readInstructions([rootOf(dir)]);
    expect(items).toEqual([]);
  });

  it("aggregates across multiple roots", () => {
    const a = mkdtempSync(join(tmpdir(), "instr-a-"));
    const b = mkdtempSync(join(tmpdir(), "instr-b-"));
    writeFileSync(join(a, "CLAUDE.md"), "A");
    writeFileSync(join(b, "CLAUDE.md"), "B");
    try {
      const items = readInstructions([rootOf(a), rootOf(b)]);
      expect(items.map((i) => i.content).sort()).toEqual(["A", "B"]);
    } finally {
      rmSync(a, { recursive: true, force: true });
      rmSync(b, { recursive: true, force: true });
    }
  });
});
