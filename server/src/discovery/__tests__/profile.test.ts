import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadProfile, saveProfile, defaultProfilePath } from "../profile.js";
import { emptyProfile } from "../types.js";

describe("loadProfile", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "profile-")); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it("returns an empty profile when the file does not exist", () => {
    expect(loadProfile(join(dir, "missing.json"))).toEqual(emptyProfile());
  });
  it("returns an empty profile when the file is malformed JSON", () => {
    const path = join(dir, "bad.json");
    writeFileSync(path, "{not json");
    expect(loadProfile(path)).toEqual(emptyProfile());
  });
  it("returns the parsed profile when valid", () => {
    const path = join(dir, "p.json");
    writeFileSync(path, JSON.stringify({
      version: 1, generatedAt: "2026-01-01T00:00:00.000Z",
      provenance: { "/m": "heuristic" }, extraMemoryDirs: ["/m"],
    }));
    expect(loadProfile(path)).toEqual({
      version: 1, generatedAt: "2026-01-01T00:00:00.000Z",
      provenance: { "/m": "heuristic" }, extraMemoryDirs: ["/m"],
    });
  });
});

describe("saveProfile", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "profile-")); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it("writes pretty JSON, creating parent directories as needed", () => {
    const path = join(dir, "nested", "deeper", "p.json");
    const profile = emptyProfile();
    saveProfile(path, profile);
    expect(existsSync(path)).toBe(true);
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual(profile);
  });
});

describe("defaultProfilePath", () => {
  it("honors INTROSPECT_PROFILE when set", () => {
    expect(defaultProfilePath({ env: { INTROSPECT_PROFILE: "/custom/p.json" } })).toBe("/custom/p.json");
  });
  it("falls back to <home>/.config/introspect/profile.json", () => {
    expect(defaultProfilePath({ env: {}, homeDir: "/home/u" }))
      .toBe("/home/u/.config/introspect/profile.json");
  });
});
