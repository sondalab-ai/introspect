import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readMemories } from "../memories.js";
import type { ResolvedRoot } from "../../sources/types.js";

function rootOf(dir: string): ResolvedRoot {
  return {
    root: { declaredPath: dir, realPath: realpathSync(dir), inode: 0 },
    sources: [],
  };
}

describe("readMemories", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "memories-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns [] when the memory dir is absent", () => {
    expect(readMemories([rootOf(dir)])).toEqual([]);
  });

  it("lists immediate .md children with previews", () => {
    mkdirSync(join(dir, "memory"));
    writeFileSync(join(dir, "memory", "note.md"), "---\nname: note\n---\nthe note body");
    writeFileSync(join(dir, "memory", "ignore.bin"), "x");
    const items = readMemories([rootOf(dir)]);
    expect(items).toHaveLength(1);
    expect(items[0]!.name).toBe("note");
    expect(items[0]!.bodyPreview.startsWith("the note body")).toBe(true);
  });
});
