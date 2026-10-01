import { realpathSync } from "node:fs";

/**
 * Resolve `path` through symlinks, or return it unchanged when it can't be
 * resolved (e.g. it doesn't exist). Readers use it to skip a directory or file
 * already read through another config root that symlinks to it.
 */
export function realPathOr(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}
