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

  it("reads v2 installed_plugins.json and joins enabled flags from settings.json", () => {
    mkdirSync(join(dir, "plugins"));
    writeFileSync(
      join(dir, "plugins", "installed_plugins.json"),
      JSON.stringify({
        version: 2,
        plugins: {
          "superpowers@claude-plugins-official": [
            { scope: "user", installPath: "/p/superpowers/5.1.0", version: "5.1.0" },
          ],
          "caveman@caveman": [{ scope: "user", installPath: "/p/caveman/abc", version: "abc" }],
        },
      })
    );
    writeFileSync(
      join(dir, "settings.json"),
      JSON.stringify({ enabledPlugins: { "superpowers@claude-plugins-official": true } })
    );

    const items = readPlugins([rootOf(dir)]).sort((a, b) => a.id.localeCompare(b.id));
    expect(items.map((i) => i.id)).toEqual([
      "caveman@caveman",
      "superpowers@claude-plugins-official",
    ]);
    const sp = items[1]!;
    expect(sp.source).toBe("claude-plugins-official");
    expect(sp.version).toBe("5.1.0");
    expect(sp.installPath).toBe("/p/superpowers/5.1.0");
    expect(sp.enabled).toBe(true);
    expect(items[0]!.enabled).toBe(false); // caveman absent from enabledPlugins
    expect(items[0]!.source).toBe("caveman");
  });

  it("returns [] when JSON is malformed", () => {
    mkdirSync(join(dir, "plugins"));
    writeFileSync(join(dir, "plugins", "installed_plugins.json"), "{ not json");
    expect(readPlugins([rootOf(dir)])).toEqual([]);
  });

  it("skips ids whose install list is empty", () => {
    mkdirSync(join(dir, "plugins"));
    writeFileSync(
      join(dir, "plugins", "installed_plugins.json"),
      JSON.stringify({ version: 2, plugins: { "ghost@mp": [] } })
    );
    expect(readPlugins([rootOf(dir)])).toEqual([]);
  });
});
