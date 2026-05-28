#!/usr/bin/env node
import { resolveSources } from "../sources/index.js";
import { discoverHeuristic } from "../discovery/heuristic.js";
import { defaultProfilePath, loadProfile, saveProfile } from "../discovery/profile.js";
import { parseExtraRoots } from "./env.js";
import type { Profile } from "../discovery/types.js";

async function main(): Promise<void> {
  const wantsClaude = process.argv.includes("--with-claude");
  if (wantsClaude) {
    console.error(
      "introspect: --with-claude is not yet wired (planned for Slice 1.6). " +
      "Running heuristic discovery only."
    );
  }

  const profilePath = defaultProfilePath();
  const extraRoots = parseExtraRoots(process.env.INTROSPECT_EXTRA_ROOTS);
  const roots = resolveSources({ extraRoots });

  const heuristic = discoverHeuristic(roots);
  const dirs = new Set(heuristic.extraMemoryDirs);
  const provenance: Profile["provenance"] = { ...heuristic.provenance };

  const existing = loadProfile(profilePath);
  for (const [k, v] of Object.entries(existing.provenance)) {
    if (v === "manual" && !dirs.has(k)) {
      dirs.add(k);
      provenance[k] = "manual";
    }
  }

  const profile: Profile = {
    version: 1,
    generatedAt: new Date().toISOString(),
    provenance,
    extraMemoryDirs: [...dirs].sort(),
  };
  saveProfile(profilePath, profile);

  console.log(`introspect: wrote ${profilePath}`);
  console.log(`  ${profile.extraMemoryDirs.length} memory dir(s) discovered`);
  for (const d of profile.extraMemoryDirs) {
    console.log(`  - ${d}  [${provenance[d]}]`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
