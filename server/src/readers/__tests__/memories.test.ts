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

  it("lists global memory/*.md with scope='global'", () => {
    mkdirSync(join(dir, "memory"));
    writeFileSync(join(dir, "memory", "note.md"), "---\nname: note\n---\nthe note body");
    writeFileSync(join(dir, "memory", "ignore.bin"), "x");
    const items = readMemories([rootOf(dir)]);
    expect(items).toHaveLength(1);
    expect(items[0]!.name).toBe("note");
    expect(items[0]!.scope).toBe("global");
    expect(items[0]!.bodyPreview.startsWith("the note body")).toBe(true);
  });

  it("lists per-project memories at projects/<slug>/memory/ with scope=slug", () => {
    const slug = "-Users-marcello-barile-src-mine-introspect";
    mkdirSync(join(dir, "projects", slug, "memory"), { recursive: true });
    writeFileSync(
      join(dir, "projects", slug, "memory", "ux-feedback.md"),
      "---\nname: ux-feedback\n---\nbody"
    );
    const items = readMemories([rootOf(dir)]);
    expect(items).toHaveLength(1);
    expect(items[0]!.scope).toBe(slug);
    expect(items[0]!.name).toBe("ux-feedback");
  });

  it("aggregates global + per-project memories together", () => {
    mkdirSync(join(dir, "memory"));
    writeFileSync(join(dir, "memory", "g.md"), "g");
    mkdirSync(join(dir, "projects", "p1", "memory"), { recursive: true });
    writeFileSync(join(dir, "projects", "p1", "memory", "m.md"), "m");
    mkdirSync(join(dir, "projects", "p2", "memory"), { recursive: true });
    writeFileSync(join(dir, "projects", "p2", "memory", "m.md"), "m");

    const items = readMemories([rootOf(dir)]);
    expect(items).toHaveLength(3);
    const scopes = items.map((i) => i.scope).sort();
    expect(scopes).toEqual(["global", "p1", "p2"]);
  });
});
