import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { redactSecrets } from "./secrets.js";
import type { ResolvedRoot } from "../sources/types.js";

export interface SettingsItem {
  rootPath: string;
  fileName: string;
  path: string;
  hooks: Record<string, unknown>;
  permissions: Record<string, unknown>;
  env: Record<string, unknown>;
  other: Record<string, unknown>;
  redactedKeys: string[];
}

const FILENAMES = ["settings.json", "settings.local.json"];

function partition(obj: Record<string, unknown>): {
  hooks: Record<string, unknown>;
  permissions: Record<string, unknown>;
  env: Record<string, unknown>;
  other: Record<string, unknown>;
} {
  const hooks = (obj.hooks as Record<string, unknown>) ?? {};
  const permissions = (obj.permissions as Record<string, unknown>) ?? {};
  const env = (obj.env as Record<string, unknown>) ?? {};
  const other: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k === "hooks" || k === "permissions" || k === "env") continue;
    other[k] = v;
  }
  return { hooks, permissions, env, other };
}

/** Read settings.json and settings.local.json per root, redacting secrets. */
export function readSettings(roots: ResolvedRoot[]): SettingsItem[] {
  const out: SettingsItem[] = [];
  for (const { root } of roots) {
    for (const fileName of FILENAMES) {
      const path = join(root.realPath, fileName);
      if (!existsSync(path)) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(readFileSync(path, "utf8"));
      } catch {
        continue;
      }
      if (parsed === null || typeof parsed !== "object") continue;
      const partitioned = partition(parsed as Record<string, unknown>);
      const { value, redactedKeys } = redactSecrets({
        hooks: partitioned.hooks,
        permissions: partitioned.permissions,
        env: partitioned.env,
        other: partitioned.other,
      });
      out.push({
        rootPath: root.realPath,
        fileName,
        path,
        hooks: value.hooks as Record<string, unknown>,
        permissions: value.permissions as Record<string, unknown>,
        env: value.env as Record<string, unknown>,
        other: value.other as Record<string, unknown>,
        redactedKeys,
      });
    }
  }
  return out;
}
