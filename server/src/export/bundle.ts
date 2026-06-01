// @types/archiver lags behind archiver 8 (named exports). Use the runtime named export.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error — archiver@8 exports ZipArchive as a named ESM export; types still default to v7 (function form).
import { ZipArchive } from "archiver";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import type { Readable } from "node:stream";
import type { ResolvedRoot } from "../sources/types.js";
import { redactSecrets } from "../readers/secrets.js";

/** Top-level dirs to include from each config root. */
const INCLUDED_DIRS = ["agents", "commands", "skills", "memory"];

/** Top-level files copied verbatim from each config root. */
const PLAIN_FILES = ["CLAUDE.md", "plugins.json"];

/** Settings file gets parsed + redacted before inclusion. */
const SETTINGS_FILE = "settings.json";

export interface BundleEntry {
  rootDeclared: string;
  rootReal: string;
  basenameDir: string;
}

export interface BundleManifest {
  generatedAt: string;
  roots: BundleEntry[];
  introspectVersion: string;
  notes: string[];
}

function bundleBasename(root: ResolvedRoot): string {
  return basename(root.root.realPath) || "root";
}

function isInside(root: string, p: string): boolean {
  return p === root || p.startsWith(root + "/");
}

export interface BundleOptions {
  /** zlib deflate level (0 = store, 9 = max). Default 6. */
  compressionLevel?: number;
}

/** Compose a streaming ZIP of the user's config — no transcripts, no secrets. */
export function createBundleStream(
  roots: ResolvedRoot[],
  profilePath: string | null,
  opts: BundleOptions = {},
): {
  stream: Readable;
  filename: string;
  finalize: () => void;
} {
  const archive = new ZipArchive({ zlib: { level: opts.compressionLevel ?? 6 } });
  const manifest: BundleManifest = {
    generatedAt: new Date().toISOString(),
    roots: [],
    introspectVersion: "0.0.0",
    notes: [
      "Transcripts under projects/ are intentionally excluded.",
      "settings.json is parsed and passed through redactSecrets() before being archived.",
      "If parsing fails (malformed JSON), the file is omitted and the failure is logged in this manifest.",
    ],
  };
  const redactionReport: Record<string, string[]> = {};
  const failedSettings: string[] = [];

  const seen = new Set<string>();
  for (const r of roots) {
    const dir = bundleBasename(r);
    const declared = r.root.declaredPath;
    if (seen.has(r.root.realPath)) continue;
    seen.add(r.root.realPath);
    manifest.roots.push({ rootDeclared: declared, rootReal: r.root.realPath, basenameDir: dir });

    for (const f of PLAIN_FILES) {
      const p = join(r.root.realPath, f);
      if (!existsSync(p)) continue;
      try {
        if (!statSync(p).isFile()) continue;
      } catch { continue; }
      archive.file(p, { name: `roots/${dir}/${f}` });
    }

    // settings.json — parse, redact, then archive a sanitized copy
    const sp = join(r.root.realPath, SETTINGS_FILE);
    if (existsSync(sp)) {
      let isFile = false;
      try { isFile = statSync(sp).isFile(); } catch { /* skip */ }
      if (isFile) {
        try {
          const raw = readFileSync(sp, "utf8");
          const parsed: unknown = JSON.parse(raw);
          const { value, redactedKeys } = redactSecrets(parsed);
          archive.append(JSON.stringify(value, null, 2) + "\n",
            { name: `roots/${dir}/${SETTINGS_FILE}` });
          if (redactedKeys.length > 0) redactionReport[dir] = redactedKeys;
        } catch {
          failedSettings.push(dir);
        }
      }
    }

    for (const d of INCLUDED_DIRS) {
      const p = join(r.root.realPath, d);
      if (!existsSync(p)) continue;
      try {
        if (!statSync(p).isDirectory()) continue;
      } catch { continue; }
      archive.directory(p, `roots/${dir}/${d}`);
    }

    const projectsRoot = join(r.root.realPath, "projects");
    if (existsSync(projectsRoot)) {
      try {
        if (statSync(projectsRoot).isDirectory()) {
          // include only per-project memory subdir, never .jsonl transcripts
          for (const entry of safeReaddir(projectsRoot)) {
            const projDir = join(projectsRoot, entry);
            const memDir = join(projDir, "memory");
            if (existsSync(memDir)) {
              try {
                if (statSync(memDir).isDirectory()) {
                  archive.directory(memDir, `roots/${dir}/projects/${entry}/memory`);
                }
              } catch { /* skip */ }
            }
          }
        }
      } catch { /* skip */ }
    }
  }

  if (profilePath && existsSync(profilePath)) {
    archive.file(profilePath, { name: "profile.json" });
  }

  const finalManifest = {
    ...manifest,
    redactedSettingsKeys: redactionReport,
    failedSettings,
  };
  archive.append(JSON.stringify(finalManifest, null, 2) + "\n", { name: "manifest.json" });

  const filename = `introspect-bundle-${manifest.generatedAt.replace(/[:.]/g, "-")}.zip`;
  return {
    stream: archive,
    filename,
    finalize: () => { archive.finalize(); },
  };
}

function safeReaddir(p: string): string[] {
  try { return readdirSync(p); } catch { return []; }
}

// Defensive guard kept for the test suite.
export function _isSafeBundlePath(rootReal: string, child: string): boolean {
  return isInside(rootReal, child);
}
