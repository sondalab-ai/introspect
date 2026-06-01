import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { asString } from "./frontmatter.js";
import type { ResolvedRoot } from "../sources/types.js";

export interface PluginItem {
  rootPath: string;
  id: string;
  /** Marketplace the plugin came from, parsed from the `name@marketplace` id. */
  source: string;
  enabled: boolean;
  version: string;
  /** Absolute install path of the active version, when known. */
  installPath: string;
}

function readJson(path: string): unknown {
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return null; }
}

/** Map of `name@marketplace` → enabled flag, from `<root>/settings.json`. */
function readEnabledMap(rootPath: string): Record<string, boolean> {
  const parsed = readJson(join(rootPath, "settings.json"));
  const ep = (parsed as { enabledPlugins?: unknown } | null)?.enabledPlugins;
  if (ep === null || typeof ep !== "object") return {};
  const out: Record<string, boolean> = {};
  for (const [id, v] of Object.entries(ep as Record<string, unknown>)) out[id] = v === true;
  return out;
}

/** Marketplace segment after the last `@`; empty when the id carries none. */
function marketplaceOf(id: string): string {
  const at = id.lastIndexOf("@");
  return at >= 0 ? id.slice(at + 1) : "";
}

/**
 * Read installed plugins from `<root>/plugins/installed_plugins.json` (v2:
 * `{ plugins: { id: [{ installPath, version, ... }] } }`), joined with the
 * enabled flags in `<root>/settings.json`.
 */
export function readPlugins(roots: ResolvedRoot[]): PluginItem[] {
  const out: PluginItem[] = [];
  for (const { root } of roots) {
    const parsed = readJson(join(root.realPath, "plugins", "installed_plugins.json"));
    const plugins = (parsed as { plugins?: unknown } | null)?.plugins;
    if (plugins === null || typeof plugins !== "object") continue;
    const enabled = readEnabledMap(root.realPath);
    for (const [id, installs] of Object.entries(plugins as Record<string, unknown>)) {
      if (!Array.isArray(installs) || installs.length === 0) continue;
      const rec = installs[0] as Record<string, unknown>;
      out.push({
        rootPath: root.realPath,
        id,
        source: marketplaceOf(id),
        enabled: enabled[id] === true,
        version: asString(rec.version),
        installPath: asString(rec.installPath),
      });
    }
  }
  return out;
}
