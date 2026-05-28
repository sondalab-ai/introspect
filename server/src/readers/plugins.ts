import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { asString } from "./frontmatter.js";
import type { ResolvedRoot } from "../sources/types.js";

export interface PluginItem {
  rootPath: string;
  id: string;
  source: string;
  enabled: boolean;
  version: string;
}

function asBool(v: unknown): boolean {
  return v === true;
}

function normalizeRecord(rootPath: string, id: string, raw: unknown): PluginItem | null {
  if (raw === null || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  return {
    rootPath,
    id,
    source: asString(obj.source),
    enabled: asBool(obj.enabled),
    version: asString(obj.version),
  };
}

/** Read installed plugins from `<root>/plugins/installed_plugins.json`. */
export function readPlugins(roots: ResolvedRoot[]): PluginItem[] {
  const out: PluginItem[] = [];
  for (const { root } of roots) {
    const path = join(root.realPath, "plugins", "installed_plugins.json");
    if (!existsSync(path)) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(path, "utf8"));
    } catch {
      continue;
    }
    if (Array.isArray(parsed)) {
      for (const entry of parsed) {
        if (entry === null || typeof entry !== "object") continue;
        const obj = entry as Record<string, unknown>;
        const id = asString(obj.id);
        if (!id) continue;
        const item = normalizeRecord(root.realPath, id, obj);
        if (item) out.push(item);
      }
    } else if (parsed !== null && typeof parsed === "object") {
      for (const [id, entry] of Object.entries(parsed as Record<string, unknown>)) {
        const item = normalizeRecord(root.realPath, id, entry);
        if (item) out.push(item);
      }
    }
  }
  return out;
}
