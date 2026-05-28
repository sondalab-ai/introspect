export interface ClaudeRunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/** Minimal abstraction over the local `claude` CLI invocation.
 * Implementations land in Slice 1.6+; tests inject mocks. */
export type ClaudeRunner = (input: string) => Promise<ClaudeRunResult>;

export async function askClaudeForMemoryDirs(
  runner: ClaudeRunner,
  context: string,
): Promise<string[]> {
  const res = await runner(context);
  if (res.exitCode !== 0) return [];
  return res.stdout
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.startsWith("/"));
}
