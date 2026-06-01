import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createBundleStream } from "../bundle.js";
import type { ResolvedRoot } from "../../sources/types.js";

function rootOf(dir: string): ResolvedRoot {
  return { root: { declaredPath: dir, realPath: realpathSync(dir), inode: 0 }, sources: [] };
}

async function streamToBuffer(s: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of s) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

describe("createBundleStream", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "bundle-"));
    writeFileSync(join(dir, "CLAUDE.md"), "# user prefs\n");
    mkdirSync(join(dir, "agents"));
    writeFileSync(join(dir, "agents", "explorer.md"), "---\nname: explorer\n---\nbody\n");
    mkdirSync(join(dir, "memory"));
    writeFileSync(join(dir, "memory", "MEMORY.md"), "- root memory\n");
    mkdirSync(join(dir, "projects", "-foo", "memory"), { recursive: true });
    writeFileSync(join(dir, "projects", "-foo", "memory", "MEMORY.md"), "- proj memory\n");
    writeFileSync(join(dir, "projects", "-foo", "abc.jsonl"), "{ \"redacted\": true }\n");
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("produces a non-empty zip with manifest, files, and per-project memory", async () => {
    const { stream, filename, finalize } = createBundleStream([rootOf(dir)], null, { compressionLevel: 0 });
    finalize();
    const buf = await streamToBuffer(stream);
    expect(buf.length).toBeGreaterThan(0);
    expect(filename).toMatch(/^introspect-bundle-.*\.zip$/);
    // ZIP magic bytes "PK\x03\x04" at offset 0
    expect(buf.slice(0, 4).toString("hex")).toBe("504b0304");
    // Manifest text must appear somewhere in the central directory; cheap sanity check
    expect(buf.includes(Buffer.from("manifest.json"))).toBe(true);
    expect(buf.includes(Buffer.from("CLAUDE.md"))).toBe(true);
    expect(buf.includes(Buffer.from("explorer.md"))).toBe(true);
    expect(buf.includes(Buffer.from("memory/MEMORY.md"))).toBe(true);
    // .jsonl transcripts must NOT be included
    expect(buf.includes(Buffer.from("abc.jsonl"))).toBe(false);
  });

  it("returns a zip even when no roots are present", async () => {
    const { stream, finalize } = createBundleStream([], null, { compressionLevel: 0 });
    finalize();
    const buf = await streamToBuffer(stream);
    expect(buf.length).toBeGreaterThan(0);
    expect(buf.includes(Buffer.from("manifest.json"))).toBe(true);
  });

  it("redacts secrets from settings.json and includes a redaction report in manifest", async () => {
    const settings = {
      env: { ANTHROPIC_API_KEY: "sk-real-secret-12345" },
      hooks: { Onstop: { command: "do-stuff" } },
      permissions: { allowed: ["Read"] },
    };
    writeFileSync(join(dir, "settings.json"), JSON.stringify(settings));
    const { stream, finalize } = createBundleStream([rootOf(dir)], null, { compressionLevel: 0 });
    finalize();
    const buf = await streamToBuffer(stream);
    // raw secret must not appear anywhere in the archive
    expect(buf.includes(Buffer.from("sk-real-secret-12345"))).toBe(false);
    // [REDACTED] placeholder should be present
    expect(buf.includes(Buffer.from("[REDACTED]"))).toBe(true);
    // hooks/permissions still preserved (non-secret content)
    expect(buf.includes(Buffer.from("do-stuff"))).toBe(true);
  });

  it("notes malformed settings.json in failedSettings instead of crashing", async () => {
    writeFileSync(join(dir, "settings.json"), "{ this is not json }");
    const { stream, finalize } = createBundleStream([rootOf(dir)], null, { compressionLevel: 0 });
    finalize();
    const buf = await streamToBuffer(stream);
    expect(buf.length).toBeGreaterThan(0);
    expect(buf.includes(Buffer.from("failedSettings"))).toBe(true);
  });
});
