import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, symlinkSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readMarkdownDir } from "../markdownDir.js";

describe("readMarkdownDir", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "md-dir-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns [] when the directory does not exist", () => {
    expect(readMarkdownDir(join(dir, "nope"))).toEqual([]);
  });

  it("lists .md files with parsed frontmatter and body preview, sorted by name", () => {
    writeFileSync(
      join(dir, "b.md"),
      "---\nname: bravo\ndescription: B does B\n---\nBravo body content here.\n"
    );
    writeFileSync(
      join(dir, "a.md"),
      "---\nname: alpha\n---\nAlpha body that is long enough to be previewed up to ~200 chars but not longer in this fixture.\n"
    );
    writeFileSync(join(dir, "ignore.txt"), "skip me");

    const items = readMarkdownDir(dir);
    expect(items.map((i) => i.name)).toEqual(["a", "b"]);
    expect(items[0]!.meta).toEqual({ name: "alpha" });
    expect(items[0]!.path).toBe(join(dir, "a.md"));
    expect(items[0]!.body.startsWith("Alpha body")).toBe(true);
    expect(items[0]!.bodyPreview.length).toBeLessThanOrEqual(200);
    expect(items[1]!.meta).toEqual({ name: "bravo", description: "B does B" });
  });

  it("returns body and empty meta when there is no frontmatter", () => {
    writeFileSync(join(dir, "plain.md"), "no frontmatter here, just body.");
    const items = readMarkdownDir(dir);
    expect(items).toHaveLength(1);
    expect(items[0]!.meta).toEqual({});
    expect(items[0]!.body).toBe("no frontmatter here, just body.");
  });

  it("skips broken symlinks and missing files without throwing", () => {
    writeFileSync(join(dir, "ok.md"), "ok body");
    // Broken symlink whose target never existed.
    symlinkSync(join(dir, "nope-target.md"), join(dir, "broken.md"));
    // Symlink whose target gets removed.
    const stale = join(dir, "stale-target.md");
    writeFileSync(stale, "stale body");
    symlinkSync(stale, join(dir, "stale.md"));
    unlinkSync(stale);

    const items = readMarkdownDir(dir);
    expect(items.map((i) => i.name).sort()).toEqual(["ok"]);
  });
});
