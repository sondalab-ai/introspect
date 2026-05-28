/** Parse a comma-separated list of paths, trimming and dropping empties. */
export function parseExtraRoots(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
