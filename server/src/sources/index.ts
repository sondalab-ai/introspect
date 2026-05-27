import { discoverConfigRoots } from "./configRoots.js";
import { probeSources } from "./probe.js";
import type { ResolveOptions, ResolvedRoot } from "./types.js";

export * from "./types.js";
export { candidatePaths, discoverConfigRoots } from "./configRoots.js";
export { probeSources } from "./probe.js";

/** Discover all config roots and probe their sources. */
export function resolveSources(opts: ResolveOptions = {}): ResolvedRoot[] {
  return discoverConfigRoots(opts).map((root) => ({
    root,
    sources: probeSources(root),
  }));
}
