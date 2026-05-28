import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readSettings } from "../settings.js";
import type { ResolvedRoot } from "../../sources/types.js";

function rootOf(dir: string): ResolvedRoot {
  return {
    root: { declaredPath: dir, realPath: realpathSync(dir), inode: 0 },
    sources: [],
  };
}

describe("readSettings", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "settings-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns [] when no settings.json exists", () => {
    expect(readSettings([rootOf(dir)])).toEqual([]);
  });

  it("returns hooks, permissions, env separated, with secrets redacted by default", () => {
    writeFileSync(
      join(dir, "settings.json"),
      JSON.stringify({
        hooks: { SessionStart: [{ command: "x" }] },
        permissions: { allow: ["Bash"] },
        env: { ANTHROPIC_API_KEY: "secret", DEBUG: "1" },
        other: "kept",
      })
    );
    const items = readSettings([rootOf(dir)]);
    expect(items).toHaveLength(1);
    const it = items[0]!;
    expect(it.fileName).toBe("settings.json");
    expect(it.hooks).toEqual({ SessionStart: [{ command: "x" }] });
    expect(it.permissions).toEqual({ allow: ["Bash"] });
    expect(it.env).toEqual({ ANTHROPIC_API_KEY: "[REDACTED]", DEBUG: "1" });
    expect(it.other).toEqual({ other: "kept" });
    expect(it.redactedKeys).toContain("env.ANTHROPIC_API_KEY");
  });

  it("emits one item per settings file present (settings.json and settings.local.json)", () => {
    writeFileSync(join(dir, "settings.json"), JSON.stringify({ env: { A: "1" } }));
    writeFileSync(join(dir, "settings.local.json"), JSON.stringify({ env: { B: "2" } }));
    const items = readSettings([rootOf(dir)]).sort((a, b) =>
      a.fileName.localeCompare(b.fileName)
    );
    expect(items.map((i) => i.fileName)).toEqual(["settings.json", "settings.local.json"]);
  });

  it("skips malformed JSON without throwing", () => {
    writeFileSync(join(dir, "settings.json"), "{not json");
    expect(readSettings([rootOf(dir)])).toEqual([]);
  });

  it("returns [] when settings.json is a JSON array", () => {
    writeFileSync(join(dir, "settings.json"), JSON.stringify([{ hooks: {} }]));
    expect(readSettings([rootOf(dir)])).toEqual([]);
  });

  it("coerces non-object hooks/permissions/env subfields to {}", () => {
    writeFileSync(
      join(dir, "settings.json"),
      JSON.stringify({ hooks: "nope", permissions: [1, 2], env: 42 })
    );
    const items = readSettings([rootOf(dir)]);
    expect(items).toHaveLength(1);
    expect(items[0]!.hooks).toEqual({});
    expect(items[0]!.permissions).toEqual({});
    expect(items[0]!.env).toEqual({});
  });
});
