import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readLinesFrom } from "../jsonlReader.js";

describe("readLinesFrom", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "jsonl-")); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it("returns [] and offset=0 for a missing file", () => {
    expect(readLinesFrom(join(dir, "nope.jsonl"), 0)).toEqual({ lines: [], nextOffset: 0 });
  });

  it("reads all complete lines from offset 0", () => {
    const f = join(dir, "a.jsonl");
    writeFileSync(f, '{"a":1}\n{"b":2}\n');
    const r = readLinesFrom(f, 0);
    expect(r.lines).toEqual(['{"a":1}', '{"b":2}']);
    expect(r.nextOffset).toBe(16);
  });

  it("resumes from a given offset and skips re-read content", () => {
    const f = join(dir, "b.jsonl");
    writeFileSync(f, '{"a":1}\n');
    const first = readLinesFrom(f, 0);
    appendFileSync(f, '{"b":2}\n');
    const second = readLinesFrom(f, first.nextOffset);
    expect(second.lines).toEqual(['{"b":2}']);
    expect(second.nextOffset).toBe(16);
  });

  it("withholds a trailing partial line (no terminating newline)", () => {
    const f = join(dir, "c.jsonl");
    writeFileSync(f, '{"a":1}\n{"par');
    const r = readLinesFrom(f, 0);
    expect(r.lines).toEqual(['{"a":1}']);
    expect(r.nextOffset).toBe(8);
  });
});
