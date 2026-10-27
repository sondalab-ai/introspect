import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

/** Deps whose listen resolves to a fake server, or rejects with `error`; `watchError` makes watch() reject. */
function deps(error?: unknown, watchError?: unknown) {
  const opened: string[] = [];
  const close = vi.fn(async () => {});
  const listen = vi.fn(async (port: number) => {
    if (error) throw error;
    return {
      url: `http://localhost:${port}`,
      watch: async () => {
        if (watchError) throw watchError;
      },
      close,
    };
  });
  const value: IntrospectDeps = { listen, openBrowser: (url: string) => void opened.push(url) };
  return Object.assign(value, { opened, close, listen });
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

    const debug = io(["--debug"], { env: { INTROSPECT_PORT: "4399" } });
    await runIntrospect(debug.io, deps(inUse));
    expect(debug.stderr.text()).toContain("Caused by: Error: listen EADDRINUSE\n");
    expect(debug.stderr.text().trimEnd().split("\n").at(-1)).toBe("    Try: INTROSPECT_PORT=4400 introspect");
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

  it("pins the why line of an argument error, and rejects `introspect init`", async () => {
    const t = io(["init"]);
    expect(await runIntrospect(t.io, deps())).toBe(1);
    expect(t.stderr.text()).toBe(
      "  ✗ Unexpected argument init\n" +
      "    introspect takes only --debug, --ascii, --color, --no-color, --version, --help\n" +
      "    Try: introspect --help\n",
    );
  });

  it.each([
    ["", 4317],
    ["  ", 4317],
    [" 4400 ", 4400],
    ["65535", 65535],
  ])("reads INTROSPECT_PORT %j as %i", async (raw, port) => {
    const t = io([], { env: { INTROSPECT_PORT: raw } });
    const d = deps();
    expect(await runIntrospect(t.io, d)).toBe(0);
    expect(d.listen).toHaveBeenCalledWith(port, []);
  });

  it.each(["1e3", "0", "65536", "-1", "4317.0", "0x10"])("rejects INTROSPECT_PORT %j", async (raw) => {
    const t = io([], { env: { INTROSPECT_PORT: raw } });
    const d = deps();
    expect(await runIntrospect(t.io, d)).toBe(1);
    expect(t.stderr.text()).toBe(
      `  ✗ Invalid INTROSPECT_PORT ${raw}\n` +
      "    the port must be digits only, from 1 to 65535\n" +
      "    Try: INTROSPECT_PORT=4317 introspect\n",
    );
    expect(d.listen).not.toHaveBeenCalled();
  });

  it("suggests the default's neighbour when port 65535 is in use", async () => {
    const inUse = Object.assign(new Error("listen EADDRINUSE"), { code: "EADDRINUSE" });
    const t = io([], { env: { INTROSPECT_PORT: "65535" } });
    expect(await runIntrospect(t.io, deps(inUse))).toBe(1);
    expect(t.stderr.text().trimEnd().split("\n").at(-1)).toBe("    Try: INTROSPECT_PORT=4318 introspect");
  });

  it("closes the server and exits 1 when the watcher fails after listen", async () => {
    const t = io([]);
    const d = deps(undefined, new Error("watch failed"));
    expect(await runIntrospect(t.io, d)).toBe(1);
    expect(d.close).toHaveBeenCalledTimes(1);
    expect(d.opened).toEqual([]);
    expect(t.stdout.text()).toBe("  ✓ Started server              http://localhost:4317\n");
    expect(t.stderr.text()).toBe(
      "  ✗ Could not start the dashboard\n" +
      "    watch failed\n" +
      "    Try: introspect --debug\n",
    );
  });

  it("prints --help off a TTY and starts nothing", async () => {
    const t = io(["--help"]);
    const d = deps();
    expect(await runIntrospect(t.io, d)).toBe(0);
    expect(t.stdout.text()).toMatchInlineSnapshot(`
      "Usage: introspect [flags]

      FLAGS
          --ascii                     ASCII glyphs only
          --color, --no-color         force or drop colour
          --debug                     print the stack on failure
          --version                   print the version
          --help                      print this help

      ENVIRONMENT
          INTROSPECT_PORT             listen port, default 4317
          INTROSPECT_EXTRA_ROOTS      extra Claude config roots, comma-separated
      "
    `);
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
    expect(lines[0]).toBe("  ✗ Could not build the discovery profile");
    expect(lines[1]).toContain("EEXIST");
    expect(lines.at(-1)).toBe("    Try: introspect-init --debug");
    expect(t.stderr.text()).not.toMatch(/^\s+at /m);

    const d = io(["--debug"], { env: blocked });
    expect(await runInit(d.io)).toBe(1);
    expect(d.stderr.text()).toMatch(/^\s+at /m);
    expect(d.stderr.text().trimEnd().split("\n").at(-1)).toBe("    Try: introspect-init --debug");
  });

  it("prints --help off a TTY and writes nothing", async () => {
    const t = io(["--help"], { env: env() });
    expect(await runInit(t.io)).toBe(0);
    expect(t.stdout.text()).toMatchInlineSnapshot(`
      "Usage: introspect-init [flags]

      FLAGS
          --with-claude               planned: enrich via the claude CLI
          --ascii                     ASCII glyphs only
          --color, --no-color         force or drop colour
          --debug                     print the stack on failure
          --version                   print the version
          --help                      print this help

      ENVIRONMENT
          INTROSPECT_PROFILE          profile path, default ~/.config/introspect/profile.json
          INTROSPECT_EXTRA_ROOTS      extra Claude config roots, comma-separated
          CLAUDE_CONFIG_DIR           primary Claude config root
      "
    `);
    expect(existsSync(join(dir, "profile.json"))).toBe(false);
  });
});
