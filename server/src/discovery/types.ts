/** Persisted convention profile produced by `introspect init`. Editable by hand. */
export interface Profile {
  /** Schema version. Increment if/when fields change incompatibly. */
  version: 1;
  /** ISO timestamp of when the profile was last (re)generated. */
  generatedAt: string;
  /** Where each entry came from, for debuggability. */
  provenance: Record<string, "heuristic" | "claude" | "manual">;
  /**
   * Absolute filesystem paths that hold `<dir>/*.md` memory files.
   * Aggregated by `readMemories` in addition to the default `<root>/memory/`
   * and `<root>/projects/<slug>/memory/` locations.
   */
  extraMemoryDirs: string[];
}

/** Empty/default profile used when no file exists yet. */
export function emptyProfile(): Profile {
  return {
    version: 1,
    generatedAt: new Date(0).toISOString(),
    provenance: {},
    extraMemoryDirs: [],
  };
}
