import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readPlugins } from "../plugins.js";
import type { ResolvedRoot } from "../../sources/types.js";

function rootOf(dir: string): ResolvedRoot {
  return {
    root: { declaredPath: dir, realPath: realpathSync(dir), inode: 0 },
    sources: [],
  };
}

describe("readPlugins", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "plugins-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns [] when installed_plugins.json is absent", () => {
    expect(readPlugins([rootOf(dir)])).toEqual([]);
  });

  it("returns plugin entries normalized from installed_plugins.json (object form)", () => {
    mkdirSync(join(dir, "plugins"));
    writeFileSync(
      join(dir, "plugins", "installed_plugins.json"),
      JSON.stringify({
        "superpowers@official": { source: "official", enabled: true, version: "5.1.0" },
        "figma@official": { source: "official", enabled: false },
      })
    );
    const items = readPlugins([rootOf(dir)]).sort((a, b) => a.id.localeCompare(b.id));
    expect(items.map((i) => i.id)).toEqual(["figma@official", "superpowers@official"]);
    expect(items[1]!.enabled).toBe(true);
    expect(items[1]!.version).toBe("5.1.0");
  });

  it("returns plugin entries normalized from installed_plugins.json (array form)", () => {
    mkdirSync(join(dir, "plugins"));
    writeFileSync(
      join(dir, "plugins", "installed_plugins.json"),
      JSON.stringify([{ id: "p1", source: "x", enabled: true }])
    );
    const items = readPlugins([rootOf(dir)]);
    expect(items).toEqual([
      { rootPath: realpathSync(dir), id: "p1", source: "x", enabled: true, version: "" },
    ]);
  });

  it("returns [] and does not throw when JSON is malformed", () => {
    mkdirSync(join(dir, "plugins"));
    writeFileSync(join(dir, "plugins", "installed_plugins.json"), "{ not json");
    expect(readPlugins([rootOf(dir)])).toEqual([]);
  });
});
