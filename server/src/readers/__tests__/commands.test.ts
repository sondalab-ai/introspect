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

  it("also reads commands from installed plugins' installPath", () => {
    const installPath = join(dir, "plugins", "cache", "mp", "p1", "v1");
    mkdirSync(join(installPath, "commands"), { recursive: true });
    writeFileSync(join(installPath, "commands", "commit.md"), "---\ndescription: Commit\n---\nb");
    mkdirSync(join(dir, "plugins"), { recursive: true });
    writeFileSync(
      join(dir, "plugins", "installed_plugins.json"),
      JSON.stringify({ version: 2, plugins: { "p1@mp": [{ installPath }] } })
    );
    mkdirSync(join(dir, "commands"));
    writeFileSync(join(dir, "commands", "decision.md"), "---\ndescription: Decide\n---\nb");

    const names = readCommands([rootOf(dir)]).map((i) => i.name).sort();
    expect(names).toEqual(["commit", "decision"]);
  });
});
