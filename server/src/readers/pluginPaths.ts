import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Absolute install paths of every installed plugin, read from
 * `<root>/plugins/installed_plugins.json` (v2: `{ plugins: { id: [{ installPath }] } }`).
 *
 * Driving off the registry — rather than walking `plugins/` blindly — avoids the
 * marketplace clones, versioned cache copies, and editor noise (`.cursor`,
 * `.windsurf`) that share the tree, so each plugin contributes exactly once.
 */
export function pluginInstallPaths(rootRealPath: string): string[] {
  const path = join(rootRealPath, "plugins", "installed_plugins.json");
  if (!existsSync(path)) return [];
  let parsed: unknown;
  try { parsed = JSON.parse(readFileSync(path, "utf8")); } catch { return []; }
  const plugins = (parsed as { plugins?: unknown })?.plugins;
  if (plugins === null || typeof plugins !== "object") return [];
  const out: string[] = [];
  for (const installs of Object.values(plugins as Record<string, unknown>)) {
    if (!Array.isArray(installs)) continue;
    for (const inst of installs) {
      const p = (inst as { installPath?: unknown })?.installPath;
      if (typeof p === "string" && p) out.push(p);
    }
  }
  return out;
}
