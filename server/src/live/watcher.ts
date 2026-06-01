import chokidar, { type FSWatcher } from "chokidar";
import { statSync } from "node:fs";
import { join, sep } from "node:path";
import { readLinesFrom } from "../parser/jsonlReader.js";
import { normalizeLine } from "../parser/eventNormalizer.js";
import type { SessionEvent } from "../parser/types.js";
import type { ResolvedRoot } from "../sources/types.js";

export interface LiveEvent {
  type: "event";
  rootPath: string;
  slug: string;
  sessionId: string;
  event: SessionEvent;
}

export interface LiveSessionStart {
  type: "session-start";
  rootPath: string;
  slug: string;
  sessionId: string;
}

export type LiveFrame = LiveEvent | LiveSessionStart;

export interface LiveWatcher {
  start(): Promise<void>;
  stop(): Promise<void>;
  onFrame(cb: (frame: LiveFrame) => void): () => void;
}

interface PathMeta { rootPath: string; slug: string; sessionId: string }

function parsePath(path: string, roots: ResolvedRoot[]): PathMeta | null {
  for (const { root } of roots) {
    const prefix = join(root.realPath, "projects") + sep;
    if (!path.startsWith(prefix)) continue;
    const rel = path.slice(prefix.length);
    const i = rel.indexOf(sep);
    if (i < 0) continue;
    const slug = rel.slice(0, i);
    const file = rel.slice(i + 1);
    if (!file.endsWith(".jsonl")) continue;
    if (file.includes(sep)) continue;
    return { rootPath: root.realPath, slug, sessionId: file.slice(0, -".jsonl".length) };
  }
  return null;
}

export function createWatcher(roots: ResolvedRoot[]): LiveWatcher {
  const offsets = new Map<string, number>();
  const subs = new Set<(f: LiveFrame) => void>();
  let watcher: FSWatcher | null = null;
  let ready = false;

  function emit(frame: LiveFrame): void {
    for (const cb of subs) cb(frame);
  }

  function drain(path: string): void {
    const meta = parsePath(path, roots);
    if (!meta) return;
    const off = offsets.get(path) ?? 0;
    const { lines, nextOffset } = readLinesFrom(path, off);
    offsets.set(path, nextOffset);
    for (const line of lines) {
      if (line.length === 0) continue;
      for (const event of normalizeLine(line)) {
        emit({ type: "event", ...meta, event });
      }
    }
  }

  return {
    async start() {
      if (watcher) return;
      const dirs = roots.map(({ root }) => join(root.realPath, "projects"));
      watcher = chokidar.watch(dirs, {
        persistent: true,
        ignoreInitial: false,
        awaitWriteFinish: false,
        ignored: (path) => {
          if (path.endsWith(".jsonl")) return false;
          try {
            return !statSync(path).isDirectory();
          } catch {
            return false;
          }
        },
      });
      watcher.on("add", (path: string) => {
        if (!path.endsWith(".jsonl")) return;
        if (!ready) {
          try { offsets.set(path, statSync(path).size); } catch { offsets.set(path, 0); }
          return;
        }
        const meta = parsePath(path, roots);
        if (!meta) return;
        if (!offsets.has(path)) {
          offsets.set(path, 0);
          emit({ type: "session-start", ...meta });
        }
        drain(path);
      });
      watcher.on("change", (path: string) => {
        if (!path.endsWith(".jsonl")) return;
        drain(path);
      });
      watcher.on("unlink", (path: string) => {
        offsets.delete(path);
      });
      await new Promise<void>((resolve) => {
        watcher!.once("ready", () => {
          ready = true;
          resolve();
        });
      });
    },
    async stop() {
      if (!watcher) return;
      await watcher.close();
      watcher = null;
      offsets.clear();
      ready = false;
    },
    onFrame(cb) {
      subs.add(cb);
      return () => { subs.delete(cb); };
    },
  };
}
