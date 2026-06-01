import { existsSync, readdirSync, statSync, openSync, readSync, closeSync } from "node:fs";
import { join } from "node:path";

/** Read the first `cwd` field from a `.jsonl` transcript, scanning only the head. */
function readHeadCwd(path: string): string | undefined {
  const HEAD = 64 * 1024;
  let fd: number;
  try { fd = openSync(path, "r"); } catch { return undefined; }
  try {
    const buf = Buffer.alloc(HEAD);
    const read = readSync(fd, buf, 0, HEAD, 0);
    for (const line of buf.subarray(0, read).toString("utf8").split("\n")) {
      if (!line.includes("\"cwd\"")) continue;
      try {
        const cwd = (JSON.parse(line) as { cwd?: unknown }).cwd;
        if (typeof cwd === "string" && cwd) return cwd;
      } catch { /* partial line; keep scanning */ }
    }
  } catch { /* unreadable */ } finally {
    closeSync(fd);
  }
  return undefined;
}

/** Real working directory of a project, from its newest session transcript. */
export function projectCwd(projectDir: string): string | undefined {
  if (!existsSync(projectDir)) return undefined;
  let newest: string | undefined;
  let lastMs = 0;
  let entries: string[];
  try { entries = readdirSync(projectDir); } catch { return undefined; }
  for (const entry of entries) {
    if (!entry.endsWith(".jsonl")) continue;
    const p = join(projectDir, entry);
    try {
      const st = statSync(p);
      if (st.isFile() && st.mtimeMs >= lastMs) { lastMs = st.mtimeMs; newest = p; }
    } catch { /* skip */ }
  }
  return newest ? readHeadCwd(newest) : undefined;
}
