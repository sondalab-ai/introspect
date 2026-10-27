import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import {
  LAYOUT,
  TermError,
  asciiMode,
  colorMode,
  errorBlock,
  heading,
  kvLine,
  type ColorMode,
} from "@sondalab/ui-kit/term.js";

/** A writable terminal stream; `isTTY` decides colour, the header and prompts. */
export interface Stream {
  write(chunk: string): unknown;
  isTTY?: boolean;
}

/** Everything a bin reads from its process, injectable for tests. */
export interface Io {
  argv: string[];
  env: NodeJS.ProcessEnv;
  stdout: Stream;
  stderr: Stream;
}

/** The flags every introspect bin accepts, plus the bin's own booleans in `extra`. */
export interface Flags {
  debug: boolean;
  ascii: boolean;
  /** --color or --no-color; undefined lets NO_COLOR, FORCE_COLOR and the TTY decide. */
  color: boolean | undefined;
  version: boolean;
  help: boolean;
  extra: Record<string, boolean>;
}

/** Resolved output settings: one colour mode per stream, the glyph set and the env term.js reads. */
export interface Ctx {
  io: Io;
  flags: Flags;
  env: NodeJS.ProcessEnv;
  ascii: boolean;
  out: ColorMode;
  err: ColorMode;
}

const COMMON = ["debug", "ascii", "color", "no-color", "version", "help"] as const;

/** The server package's version, read at run time so `rootDir: src` holds. */
export function packageVersion(): string {
  const raw = readFileSync(new URL("../../package.json", import.meta.url), "utf8");
  return (JSON.parse(raw) as { version: string }).version;
}

/**
 * Parse `argv` strictly: the common flags plus `extra` booleans. An unknown flag or a
 * positional argument throws a TermError whose fix is `<command> --help`.
 */
export function parseFlags(argv: string[], command: string, extra: readonly string[] = []): Flags {
  const options = Object.fromEntries(
    [...COMMON, ...extra].map((name) => [name, { type: "boolean" as const }]),
  );
  let values: Record<string, boolean | undefined>;
  try {
    values = parseArgs({ args: argv, options, strict: true, allowPositionals: false }).values as Record<string, boolean | undefined>;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const accepted = Object.keys(options).map((name) => `--${name}`).join(", ");
    throw new TermError(
      (message.split(". ")[0] ?? message).replaceAll("'", ""),
      `${command} takes only ${accepted}`,
      `${command} --help`,
    );
  }
  const color = values["no-color"] ? false : values.color ? true : undefined;
  return {
    debug: values.debug === true,
    ascii: values.ascii === true,
    color,
    version: values.version === true,
    help: values.help === true,
    extra: Object.fromEntries(extra.map((name) => [name, values[name] === true])),
  };
}

/**
 * Resolve the output settings for `flags`. header() reads only the env, so the flags
 * are folded into it: `--ascii` as SONDALAB_ASCII=1, `--no-color` as NO_COLOR=1 and
 * `--color` as FORCE_COLOR=1 with NO_COLOR dropped.
 */
export function context(io: Io, flags: Flags): Ctx {
  const env: NodeJS.ProcessEnv = { ...io.env };
  if (flags.ascii) env.SONDALAB_ASCII = "1";
  if (flags.color === false) env.NO_COLOR = "1";
  if (flags.color === true) {
    delete env.NO_COLOR;
    env.FORCE_COLOR = "1";
  }
  return {
    io,
    flags,
    env,
    ascii: asciiMode({ override: flags.ascii || undefined, env }),
    out: colorMode({ flag: flags.color, env, isTTY: io.stdout.isTTY === true }),
    err: colorMode({ flag: flags.color, env, isTTY: io.stderr.isTTY === true }),
  };
}

/** A continuation line: `text` starting in the label column. */
export function continuation(text: string): string {
  return " ".repeat(LAYOUT.indent + 2) + text;
}

/**
 * Write a failure to stderr as the three-line error block. A TermError keeps its own
 * what/why/fix; anything else is unexpected: `what` names it and the fix is
 * `<command> --debug`. Under --debug the stack, then each cause's, comes first, so
 * `Try:` stays last.
 */
export function reportFailure(ctx: Ctx, error: unknown, command: string, what: string): void {
  const opts = { env: ctx.env, ascii: ctx.ascii, mode: ctx.err };
  if (ctx.flags.debug) {
    for (let e: unknown = error; e instanceof Error; e = e.cause) {
      if (e.stack) ctx.io.stderr.write((e === error ? "" : "Caused by: ") + e.stack + "\n\n");
    }
  }
  const block = error instanceof TermError
    ? error.block(opts)
    : errorBlock(what, describe(error), `${command} --debug`, opts);
  ctx.io.stderr.write(block + "\n");
}

/** The why line of an unexpected failure: its message, then its code when the message lacks it. */
function describe(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const code = (error as NodeJS.ErrnoException).code;
  return code && !error.message.includes(code) ? `${error.message} (${code})` : error.message;
}

/** The context for a failure before the flags parsed: env, TTYs and the --debug flag alone. */
export function fallbackContext(io: Io): Ctx {
  return context(io, {
    debug: io.argv.includes("--debug"),
    ascii: io.argv.includes("--ascii"),
    color: io.argv.includes("--no-color") ? false : io.argv.includes("--color") ? true : undefined,
    version: false,
    help: false,
    extra: {},
  });
}

/** The real process as an Io. */
export function processIo(): Io {
  return { argv: process.argv.slice(2), env: process.env, stdout: process.stdout, stderr: process.stderr };
}

type Row = readonly [string, string];

/** The --help body: usage, then the bin's own flags and the common ones, then its environment. */
export function helpText(ctx: Ctx, command: string, flags: readonly Row[], env: readonly Row[]): string {
  const common: Row[] = [
    ["--ascii", "ASCII glyphs only"],
    ["--color, --no-color", "force or drop colour"],
    ["--debug", "print the stack on failure"],
    ["--version", "print the version"],
    ["--help", "print this help"],
  ];
  const lines = [
    `Usage: ${command} [flags]`,
    "",
    heading("Flags", { mode: ctx.out }),
    ...[...flags, ...common].map(([k, v]) => kvLine(k, v)),
    "",
    heading("Environment", { mode: ctx.out }),
    ...env.map(([k, v]) => kvLine(k, v)),
  ];
  return lines.join("\n") + "\n";
}
