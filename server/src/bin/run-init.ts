import { LAYOUT, header, lockup, nextLine, paint, stepLine, summary } from "@sondalab/ui-kit/term.js";
import { discoverHeuristic } from "../discovery/heuristic.js";
import { defaultProfilePath, loadProfile, saveProfile } from "../discovery/profile.js";
import type { Profile } from "../discovery/types.js";
import { resolveSources } from "../sources/index.js";
import { context, continuation, fallbackContext, helpText, packageVersion, parseFlags, reportFailure, type Ctx, type Io } from "./cli.js";
import { parseExtraRoots } from "./env.js";

const NAME = "introspect-init";

/**
 * The `introspect-init` command: discover memory dirs, merge the manual entries of the
 * existing profile, write it. Step lines on stdout, then Summary; a failure is an
 * error block on stderr with the stack only under --debug. Returns the exit code.
 */
export async function runInit(io: Io): Promise<number> {
  let ctx: Ctx = fallbackContext(io);
  try {
    ctx = context(io, parseFlags(io.argv, NAME, ["with-claude"]));
    const version = packageVersion();
    if (ctx.flags.version) {
      io.stdout.write(lockup(NAME, version, ctx.out) + "\n");
      return 0;
    }
    io.stdout.write(header(NAME, version, "", { compact: true, env: ctx.env, isTTY: io.stdout.isTTY === true }));
    if (ctx.flags.help) {
      io.stdout.write(helpText(ctx, NAME, [["--with-claude", "planned: enrich via the claude CLI"]], [
        ["INTROSPECT_PROFILE", "profile path, default ~/.config/introspect/profile.json"],
        ["INTROSPECT_EXTRA_ROOTS", "extra Claude config roots, comma-separated"],
        ["CLAUDE_CONFIG_DIR", "primary Claude config root"],
      ]));
      return 0;
    }

    const line = (glyph: string, label: string, detail = "", mode = ctx.out): string =>
      stepLine(glyph, label, detail, { ascii: ctx.ascii, mode }) + "\n";
    let warned = 0;
    if (ctx.flags.extra["with-claude"]) {
      io.stderr.write(line("warn", "Skipped Claude enrichment", "--with-claude is not wired yet", ctx.err));
      warned += 1;
    }

    const env = ctx.env;
    const profilePath = defaultProfilePath({ env });
    const roots = resolveSources({ env, extraRoots: parseExtraRoots(env.INTROSPECT_EXTRA_ROOTS) });
    io.stdout.write(line("done", "Resolved config roots", plural(roots.length, "root")));

    const profile = mergeProfile(discoverHeuristic(roots), loadProfile(profilePath));
    const manual = profile.extraMemoryDirs.filter((d) => profile.provenance[d] === "manual").length;
    io.stdout.write(line("done", "Discovered memory dirs", `${plural(profile.extraMemoryDirs.length, "dir")}, ${manual} manual`));
    for (const dir of profile.extraMemoryDirs) {
      io.stdout.write(continuation(`${dir}  ${paint(profile.provenance[dir] ?? "", "dim", ctx.out)}`) + "\n");
    }

    saveProfile(profilePath, profile);
    io.stdout.write(line("done", "Wrote profile", profilePath));
    io.stdout.write(nextLine("introspect", { mode: ctx.out }) + "\n");
    io.stdout.write("\n".repeat(LAYOUT.blankBeforeSummary) + summary(3, 0, warned, 0, { mode: ctx.out, ascii: ctx.ascii }) + "\n");
    return 0;
  } catch (error) {
    reportFailure(ctx, error, NAME, "Could not build the discovery profile");
    return 1;
  }
}

/** The heuristic result plus every manual entry of `existing`, dirs sorted. */
function mergeProfile(heuristic: ReturnType<typeof discoverHeuristic>, existing: Profile): Profile {
  const dirs = new Set(heuristic.extraMemoryDirs);
  const provenance: Profile["provenance"] = { ...heuristic.provenance };
  for (const [k, v] of Object.entries(existing.provenance)) {
    if (v === "manual" && !dirs.has(k)) {
      dirs.add(k);
      provenance[k] = "manual";
    }
  }
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    provenance,
    extraMemoryDirs: [...dirs].sort(),
  };
}

/** `n thing` or `n things`. */
function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}
