import { describe, it, expect, vi } from "vitest";
import { askClaudeForMemoryDirs, type ClaudeRunner } from "../withClaude.js";

function runner(stdout: string, exitCode = 0): ClaudeRunner {
  return vi.fn(async () => ({ stdout, stderr: "", exitCode }));
}

describe("askClaudeForMemoryDirs", () => {
  it("parses a newline list of absolute paths from claude's stdout", async () => {
    const r = runner("/abs/one\n/abs/two\n\n/abs/three");
    expect(await askClaudeForMemoryDirs(r, "context")).toEqual(["/abs/one", "/abs/two", "/abs/three"]);
  });
  it("returns [] when claude exits non-zero", async () => {
    const r = runner("ignored", 1);
    expect(await askClaudeForMemoryDirs(r, "ctx")).toEqual([]);
  });
  it("drops non-absolute paths and obvious noise", async () => {
    const r = runner("/abs/ok\nnot a path\n./rel/path\n/another");
    expect(await askClaudeForMemoryDirs(r, "ctx")).toEqual(["/abs/ok", "/another"]);
  });
});
