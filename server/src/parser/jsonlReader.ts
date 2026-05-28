import { existsSync, statSync, openSync, readSync, closeSync } from "node:fs";

export interface ReadResult {
  lines: string[];
  /** Byte offset of the first unread byte (start of any partial trailing line). */
  nextOffset: number;
}

const CHUNK = 64 * 1024;

/** Read complete `\n`-terminated lines from `offset`, withholding any trailing partial. */
export function readLinesFrom(path: string, offset: number): ReadResult {
  if (!existsSync(path)) return { lines: [], nextOffset: 0 };
  const size = statSync(path).size;
  if (offset >= size) return { lines: [], nextOffset: offset };

  const fd = openSync(path, "r");
  let buf = "";
  let pos = offset;
  const chunk = Buffer.alloc(CHUNK);
  try {
    while (pos < size) {
      const read = readSync(fd, chunk, 0, Math.min(CHUNK, size - pos), pos);
      if (read <= 0) break;
      buf += chunk.subarray(0, read).toString("utf8");
      pos += read;
    }
  } finally {
    closeSync(fd);
  }

  const lines: string[] = [];
  let cursor = 0;
  let consumed = 0;
  while (true) {
    const nl = buf.indexOf("\n", cursor);
    if (nl < 0) break;
    lines.push(buf.slice(cursor, nl));
    cursor = nl + 1;
    consumed = cursor;
  }
  return { lines, nextOffset: offset + Buffer.byteLength(buf.slice(0, consumed), "utf8") };
}
