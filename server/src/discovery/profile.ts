import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { emptyProfile, type Profile } from "./types.js";

export interface DefaultPathOpts {
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
}

export function defaultProfilePath(opts: DefaultPathOpts = {}): string {
  const env = opts.env ?? process.env;
  if (env.INTROSPECT_PROFILE) return env.INTROSPECT_PROFILE;
  const home = opts.homeDir ?? homedir();
  return join(home, ".config", "introspect", "profile.json");
}

export function loadProfile(path: string): Profile {
  if (!existsSync(path)) return emptyProfile();
  let raw: string;
  try { raw = readFileSync(path, "utf8"); } catch { return emptyProfile(); }
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return emptyProfile(); }
  if (!isProfile(parsed)) return emptyProfile();
  return parsed;
}

export function saveProfile(path: string, profile: Profile): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(profile, null, 2) + "\n", "utf8");
}

function isProfile(v: unknown): v is Profile {
  if (v === null || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    o.version === 1 &&
    typeof o.generatedAt === "string" &&
    typeof o.provenance === "object" && o.provenance !== null &&
    Array.isArray(o.extraMemoryDirs) &&
    (o.extraMemoryDirs as unknown[]).every((s) => typeof s === "string")
  );
}
