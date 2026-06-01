import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync, mkdirSync, writeFileSync, appendFileSync, rmSync, realpathSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWatcher, type LiveFrame } from "../watcher.js";
import type { ResolvedRoot } from "../../sources/types.js";

function rootOf(dir: string): ResolvedRoot {
  return { root: { declaredPath: dir, realPath: realpathSync(dir), inode: 0 }, sources: [] };
}

function jsonl(uuid: string, ts: string, text: string): string {
  return JSON.stringify({
    type: "assistant", uuid, isSidechain: false, timestamp: ts,
    message: { model: "opus-4-7", content: [{ type: "text", text }] },
  }) + "\n";
}

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

describe("createWatcher", () => {
  let dir: string;
  let frames: LiveFrame[];

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "watcher-"));
    mkdirSync(join(dir, "projects", "-foo"), { recursive: true });
    frames = [];
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("seeds offsets on initial scan — no replay", async () => {
    writeFileSync(join(dir, "projects", "-foo", "abc.jsonl"), jsonl("u1", "2026-05-29T00:00:00Z", "hi"));
    const w = createWatcher([rootOf(dir)]);
    w.onFrame((f) => frames.push(f));
    await w.start();
    await wait(50);
    expect(frames).toEqual([]);
    await w.stop();
  });

  it("emits session-start + events when a new file appears", async () => {
    const w = createWatcher([rootOf(dir)]);
    w.onFrame((f) => frames.push(f));
    await w.start();
    writeFileSync(join(dir, "projects", "-foo", "new.jsonl"), jsonl("u2", "2026-05-29T00:00:01Z", "yo"));
    await wait(200);
    const types = frames.map((f) => f.type);
    expect(types).toContain("session-start");
    expect(types).toContain("event");
    const evt = frames.find((f) => f.type === "event");
    expect(evt?.slug).toBe("-foo");
    expect(evt?.sessionId).toBe("new");
    await w.stop();
  });

  it("emits delta events on append, advancing offset", async () => {
    const p = join(dir, "projects", "-foo", "live.jsonl");
    writeFileSync(p, jsonl("u3", "2026-05-29T00:00:02Z", "first"));
    const w = createWatcher([rootOf(dir)]);
    w.onFrame((f) => frames.push(f));
    await w.start();
    appendFileSync(p, jsonl("u4", "2026-05-29T00:00:03Z", "second"));
    await wait(200);
    const events = frames.filter((f) => f.type === "event");
    expect(events).toHaveLength(1);
    expect(events[0]!.type === "event" && events[0]!.event.uuid).toBe("u4");
    await w.stop();
  });

  it("ignores files outside projects/", async () => {
    mkdirSync(join(dir, "other"));
    const w = createWatcher([rootOf(dir)]);
    w.onFrame((f) => frames.push(f));
    await w.start();
    writeFileSync(join(dir, "other", "stray.jsonl"), jsonl("u5", "2026-05-29T00:00:04Z", "x"));
    await wait(150);
    expect(frames).toEqual([]);
    await w.stop();
  });

  it("supports unsubscribe", async () => {
    const w = createWatcher([rootOf(dir)]);
    const off = w.onFrame((f) => frames.push(f));
    await w.start();
    off();
    writeFileSync(join(dir, "projects", "-foo", "x.jsonl"), jsonl("u6", "2026-05-29T00:00:05Z", "y"));
    await wait(150);
    expect(frames).toEqual([]);
    await w.stop();
  });
});
