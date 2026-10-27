import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { packageVersion, type Io } from "../cli.js";
import { runInit } from "../run-init.js";
import { runIntrospect, type IntrospectDeps } from "../run-introspect.js";

const ESC = "\x1b[";

/** A captured stream; `isTTY` as given. */
function stream(isTTY: boolean) {
  const chunks: string[] = [];
  return { isTTY, write: (s: string) => chunks.push(s), text: () => chunks.join("") };
}

/** An Io over captured streams and a pinned env: UTF-8, 100 columns, nothing else inherited. */
function io(argv: string[], { tty = false, env = {} as NodeJS.ProcessEnv } = {}) {
  const stdout = stream(tty);
  const stderr = stream(tty);
  const value: Io = { argv, env: { LANG: "en_US.UTF-8", COLUMNS: "100", ...env }, stdout, stderr };
  return { io: value, stdout, stderr };
}

/** Deps whose listen resolves to a fake server, or rejects with `error`. */
function deps(error?: unknown): IntrospectDeps & { opened: string[] } {
  const opened: string[] = [];
  return {
    opened,
    listen: vi.fn(async (port: number) => {
      if (error) throw error;
      return { url: `http://localhost:${port}`, watch: async () => {} };
    }),
    openBrowser: (url: string) => void opened.push(url),
  };
}

describe("introspect", () => {
  it("prints step lines with no header and no escapes off a TTY", async () => {
    const t = io([]);
    const d = deps();
    expect(await runIntrospect(t.io, d)).toBe(0);
    expect(t.stdout.text()).toBe(
      "  ✓ Started server              http://localhost:4317\n" +
      "  ✓ Started live watcher\n",
    );
    expect(t.stderr.text()).toBe("");
    expect(d.opened).toEqual(["http://localhost:4317"]);
  });

  it("opens with the header on a TTY, and NO_COLOR keeps its shapes without escapes", async () => {
    const coloured = io([], { tty: true });
    await runIntrospect(coloured.io, deps());
    expect(coloured.stdout.text()).toContain("sonda");
    expect(coloured.stdout.text()).toContain(ESC);

    const plain = io([], { tty: true, env: { NO_COLOR: "1" } });
    await runIntrospect(plain.io, deps());
    const lines = plain.stdout.text().split("\n");
    expect(lines[0]).toBe("▄█▄ ▄▄  sonda/lab");
    expect(lines[1]).toBe(`▀█▀ ▀▀  introspect ${packageVersion()}`);
    expect(plain.stdout.text()).not.toContain(ESC);
  });

  it("paints off a TTY under FORCE_COLOR, and --no-color wins over it", async () => {
    const forced = io([], { env: { FORCE_COLOR: "1" } });
    await runIntrospect(forced.io, deps());
    expect(forced.stdout.text()).toContain(ESC);

    const flagged = io(["--no-color"], { env: { FORCE_COLOR: "1" } });
    await runIntrospect(flagged.io, deps());
    expect(flagged.stdout.text()).not.toContain(ESC);
  });

  it("uses ASCII glyphs under --ascii", async () => {
    const t = io(["--ascii"]);
    await runIntrospect(t.io, deps());
    expect(t.stdout.text()).toContain("  + Started server");
  });

  it("prints the one-line lockup for --version and starts nothing", async () => {
    const t = io(["--version"]);
    const d = deps();
    expect(await runIntrospect(t.io, d)).toBe(0);
    expect(t.stdout.text()).toBe(`sonda/lab introspect ${packageVersion()}\n`);
    expect(d.listen).not.toHaveBeenCalled();
  });

  it("reports an unexpected failure as the three-line block, with no stack", async () => {
    const t = io([]);
    expect(await runIntrospect(t.io, deps(new Error("boom")))).toBe(1);
    expect(t.stderr.text()).toBe(
      "  ✗ Could not start the dashboard\n" +
      "    boom\n" +
      "    Try: introspect --debug\n",
    );
    expect(t.stderr.text()).not.toMatch(/^\s+at /m);
  });

  it("prints the stack under --debug, before the block, so Try: stays last", async () => {
    const t = io(["--debug"]);
    expect(await runIntrospect(t.io, deps(new Error("boom")))).toBe(1);
    const out = t.stderr.text();
    expect(out.startsWith("Error: boom\n")).toBe(true);
    expect(out).toMatch(/^\s+at /m);
    expect(out.trimEnd().split("\n").at(-1)).toBe("    Try: introspect --debug");
  });

  it("names the next port when the port is in use", async () => {
    const inUse = Object.assign(new Error("listen EADDRINUSE"), { code: "EADDRINUSE" });
    const t = io([], { env: { INTROSPECT_PORT: "4399" } });
    expect(await runIntrospect(t.io, deps(inUse))).toBe(1);
    expect(t.stderr.text()).toBe(
      "  ✗ Could not start server on port 4399\n" +
      "    127.0.0.1:4399 is already in use (EADDRINUSE)\n" +
      "    Try: INTROSPECT_PORT=4400 introspect\n",
    );
  });

  it("rejects an unknown flag and a bad port before listening", async () => {
    const flag = io(["--verison"]);
    const d = deps();
    expect(await runIntrospect(flag.io, d)).toBe(1);
    expect(flag.stderr.text()).toContain("  ✗ Unknown option --verison\n");
    expect(flag.stderr.text().trimEnd().split("\n").at(-1)).toBe("    Try: introspect --help");

    const port = io([], { env: { INTROSPECT_PORT: "abc" } });
    expect(await runIntrospect(port.io, d)).toBe(1);
    expect(port.stderr.text()).toContain("Try: INTROSPECT_PORT=4317 introspect");
    expect(d.listen).not.toHaveBeenCalled();
  });
});

describe("introspect-init", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "introspect-init-"));
    mkdirSync(join(dir, ".claude"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const env = (): NodeJS.ProcessEnv => ({
    CLAUDE_CONFIG_DIR: join(dir, ".claude"),
    INTROSPECT_PROFILE: join(dir, "profile.json"),
  });

  it("writes the profile and ends with Next: and Summary, plain off a TTY", async () => {
    const t = io([], { env: env() });
    expect(await runInit(t.io)).toBe(0);
    const profile = join(dir, "profile.json");
    expect(t.stdout.text()).toBe(
      "  ✓ Resolved config roots       1 root\n" +
      "  ✓ Discovered memory dirs      0 dirs, 0 manual\n" +
      `  ✓ Wrote profile               ${profile}\n` +
      "    Next: introspect\n" +
      "\n" +
      "Summary  3 ok · 0 fixed · 0 warn · 0 failed\n",
    );
    expect(JSON.parse(readFileSync(profile, "utf8")).version).toBe(1);
  });

  it("warns on stderr for --with-claude and counts it in the Summary", async () => {
    const t = io(["--with-claude"], { env: env() });
    expect(await runInit(t.io)).toBe(0);
    expect(t.stderr.text()).toBe("  ! Skipped Claude enrichment   --with-claude is not wired yet\n");
    expect(t.stdout.text()).toContain("Summary  3 ok · 0 fixed · 1 warn · 0 failed\n");
  });

  it("reports a write failure as the block, with the stack only under --debug", async () => {
    writeFileSync(join(dir, "file"), "");
    const blocked = { ...env(), INTROSPECT_PROFILE: join(dir, "file", "profile.json") };

    const t = io([], { env: blocked });
    expect(await runInit(t.io)).toBe(1);
    const lines = t.stderr.text().trimEnd().split("\n");
    expect(lines[0]).toBe("  ✗ Could not write the discovery profile");
    expect(lines[1]).toContain("EEXIST");
    expect(lines.at(-1)).toBe("    Try: introspect-init --debug");
    expect(t.stderr.text()).not.toMatch(/^\s+at /m);

    const d = io(["--debug"], { env: blocked });
    expect(await runInit(d.io)).toBe(1);
    expect(d.stderr.text()).toMatch(/^\s+at /m);
    expect(d.stderr.text().trimEnd().split("\n").at(-1)).toBe("    Try: introspect-init --debug");
  });
});
