import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, symlinkSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { candidatePaths, discoverConfigRoots } from "../configRoots.js";

describe("candidatePaths", () => {
  it("uses CLAUDE_CONFIG_DIR when set, plus extra roots", () => {
    const paths = candidatePaths({
      env: { CLAUDE_CONFIG_DIR: "/custom/claude" },
      extraRoots: ["/other/root"],
      homeDir: "/home/u",
    });
    expect(paths).toEqual(["/custom/claude", "/other/root"]);
  });

  it("falls back to <home>/.claude when env is unset", () => {
    const paths = candidatePaths({ env: {}, homeDir: "/home/u" });
    expect(paths).toEqual(["/home/u/.claude"]);
  });
});

describe("discoverConfigRoots", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "introspect-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("resolves symlinked roots through realpath", () => {
    const real = join(dir, "real-claude");
    mkdirSync(real);
    const link = join(dir, "linked-claude");
    symlinkSync(real, link);

    const roots = discoverConfigRoots({ env: { CLAUDE_CONFIG_DIR: link } });
    expect(roots).toHaveLength(1);
    expect(roots[0]!.realPath).toBe(realpathSync(real));
    expect(roots[0]!.declaredPath).toBe(link);
  });

  it("deduplicates roots that resolve to the same inode", () => {
    const real = join(dir, "claude");
    mkdirSync(real);
    const link = join(dir, "claude-alias");
    symlinkSync(real, link);

    const roots = discoverConfigRoots({
      env: { CLAUDE_CONFIG_DIR: real },
      extraRoots: [link],
    });
    expect(roots).toHaveLength(1);
  });

  it("skips roots that do not exist", () => {
    const real = join(dir, "claude");
    mkdirSync(real);
    const roots = discoverConfigRoots({
      env: { CLAUDE_CONFIG_DIR: real },
      extraRoots: [join(dir, "does-not-exist")],
    });
    expect(roots).toHaveLength(1);
    expect(roots[0]!.realPath).toBe(realpathSync(real));
  });
});
