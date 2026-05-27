import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { probeSources } from "../probe.js";
import type { ConfigRoot } from "../types.js";

function rootOf(dir: string): ConfigRoot {
  return { declaredPath: dir, realPath: realpathSync(dir), inode: 0 };
}

describe("probeSources", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "introspect-probe-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("marks an existing source as present and a missing one as missing", () => {
    mkdirSync(join(dir, "agents"));
    const sources = probeSources(rootOf(dir));

    const agents = sources.find((s) => s.id === "agents")!;
    expect(agents.status).toBe("present");
    expect(agents.realPath).toBe(join(realpathSync(dir), "agents"));

    const debug = sources.find((s) => s.id === "debug")!;
    expect(debug.status).toBe("missing");
  });

  it("detects file-based sources like settings.json and CLAUDE.md", () => {
    writeFileSync(join(dir, "settings.json"), "{}");
    writeFileSync(join(dir, "CLAUDE.md"), "# hi");
    const sources = probeSources(rootOf(dir));

    expect(sources.find((s) => s.id === "settings")!.status).toBe("present");
    expect(sources.find((s) => s.id === "instructions")!.status).toBe("present");
  });

  it("returns an entry for every known source id", () => {
    const sources = probeSources(rootOf(dir));
    const ids = sources.map((s) => s.id).sort();
    expect(ids).toEqual(
      [
        "agents",
        "commands",
        "debug",
        "debugDecisions",
        "history",
        "instructions",
        "memories",
        "plugins",
        "projects",
        "settings",
        "skills",
      ].sort()
    );
  });
});
