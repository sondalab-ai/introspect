import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, symlinkSync, rmSync, realpathSync, writeFileSync } from "node:fs";
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

  it("discovers every <home>/.claude* directory, sorted, when env is unset", () => {
    const home = mkdtempSync(join(tmpdir(), "introspect-home-"));
    try {
      mkdirSync(join(home, ".claude-perso"));
      mkdirSync(join(home, ".claude"));
      mkdirSync(join(home, ".config"));
      writeFileSync(join(home, ".claude.json"), "{}");
      const paths = candidatePaths({ env: {}, homeDir: home, extraRoots: ["/other/root"] });
      expect(paths).toEqual([join(home, ".claude"), join(home, ".claude-perso"), "/other/root"]);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("ignores sibling .claude* directories when CLAUDE_CONFIG_DIR is set", () => {
    const home = mkdtempSync(join(tmpdir(), "introspect-home-"));
    try {
      mkdirSync(join(home, ".claude"));
      mkdirSync(join(home, ".claude-perso"));
      const paths = candidatePaths({ env: { CLAUDE_CONFIG_DIR: "/custom/claude" }, homeDir: home });
      expect(paths).toEqual(["/custom/claude"]);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
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

    const roots = discoverConfigRoots({ env: { CLAUDE_CONFIG_DIR: link }, homeDir: dir });
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
      homeDir: dir,
    });
    expect(roots).toHaveLength(1);
  });

  it("skips roots that do not exist", () => {
    const real = join(dir, "claude");
    mkdirSync(real);
    const roots = discoverConfigRoots({
      env: { CLAUDE_CONFIG_DIR: real },
      extraRoots: [join(dir, "does-not-exist")],
      homeDir: dir,
    });
    expect(roots).toHaveLength(1);
    expect(roots[0]!.realPath).toBe(realpathSync(real));
  });

  it("rethrows errors that are not 'missing path' (ENOENT/ENOTDIR/ELOOP)", () => {
    // A path containing a null byte triggers ERR_INVALID_ARG_VALUE from
    // realpathSync — not a missing-path code, so it must propagate.
    const badPath = `foo${String.fromCharCode(0)}bar`;
    expect(() =>
      discoverConfigRoots({ env: { CLAUDE_CONFIG_DIR: badPath }, homeDir: dir })
    ).toThrow(/ERR_INVALID_ARG_VALUE|null bytes/);
  });
});
