import { spawn } from "node:child_process";
import { platform } from "node:process";
import { TermError, header, lockup, stepLine } from "@sondalab/ui-kit/term.js";
import { buildServer } from "../api/server.js";
import { attachLive } from "../live/attach.js";
import { context, fallbackContext, helpText, packageVersion, parseFlags, reportFailure, type Ctx, type Io } from "./cli.js";
import { parseExtraRoots } from "./env.js";

const NAME = "introspect";
const DESCRIPTION = "Audit and observe how your coding agent is configured and runs.";
const DEFAULT_PORT = 4317;

/** A listening dashboard: its URL and the live watcher still to start. */
export interface Server {
  url: string;
  watch(): Promise<void>;
}

/** The side effects runIntrospect performs, injectable for tests. */
export interface IntrospectDeps {
  listen(port: number, extraRoots: string[]): Promise<Server>;
  openBrowser(url: string): void;
}

/**
 * The `introspect` command: header on a TTY, start the server and the live watcher
 * as step lines, open the browser. Returns the exit code; 0 means the server runs on.
 * Failures are error blocks on stderr, with the stack only under --debug.
 */
export async function runIntrospect(io: Io, deps: IntrospectDeps = { listen, openBrowser }): Promise<number> {
  let ctx: Ctx = fallbackContext(io);
  try {
    ctx = context(io, parseFlags(io.argv, NAME));
    const version = packageVersion();
    const step = (label: string, detail = ""): void => {
      io.stdout.write(stepLine("done", label, detail, { ascii: ctx.ascii, mode: ctx.out }) + "\n");
    };

    if (ctx.flags.version) {
      io.stdout.write(lockup(NAME, version, ctx.out) + "\n");
      return 0;
    }
    const head = header(NAME, version, DESCRIPTION, { env: ctx.env, isTTY: io.stdout.isTTY === true });
    io.stdout.write(head ? head + "\n" : "");
    if (ctx.flags.help) {
      io.stdout.write(helpText(ctx, NAME, [], [
        ["INTROSPECT_PORT", `listen port, default ${DEFAULT_PORT}`],
        ["INTROSPECT_EXTRA_ROOTS", "extra Claude config roots, comma-separated"],
      ]));
      return 0;
    }

    const port = parsePort(ctx.env.INTROSPECT_PORT);
    const server = await deps.listen(port, parseExtraRoots(ctx.env.INTROSPECT_EXTRA_ROOTS)).catch((e: unknown) => {
      throw portError(e, port);
    });
    step("Started server", server.url);
    await server.watch();
    step("Started live watcher");
    deps.openBrowser(server.url);
    return 0;
  } catch (error) {
    reportFailure(ctx, error, NAME, "Could not start the dashboard");
    return 1;
  }
}

/** INTROSPECT_PORT as a port number; unset means the default, anything else invalid is a TermError. */
function parsePort(raw: string | undefined): number {
  if (raw === undefined || raw === "") return DEFAULT_PORT;
  const port = Number(raw);
  if (Number.isInteger(port) && port > 0 && port < 65536) return port;
  throw new TermError(
    `Invalid INTROSPECT_PORT ${raw}`,
    "the port must be a whole number from 1 to 65535",
    `INTROSPECT_PORT=${DEFAULT_PORT} ${NAME}`,
  );
}

/** A port already taken becomes an error block naming the next port; other errors pass through. */
function portError(error: unknown, port: number): unknown {
  if ((error as NodeJS.ErrnoException | null)?.code !== "EADDRINUSE") return error;
  return new TermError(
    `Could not start server on port ${port}`,
    `127.0.0.1:${port} is already in use (EADDRINUSE)`,
    `INTROSPECT_PORT=${port + 1} ${NAME}`,
  );
}

/** Build and bind the dashboard on 127.0.0.1, with shutdown on SIGINT and SIGTERM. */
async function listen(port: number, extraRoots: string[]): Promise<Server> {
  const app = buildServer({ extraRoots });
  const live = attachLive(app, { extraRoots });
  await app.listen({ port, host: "127.0.0.1" });

  const shutdown = async (): Promise<void> => {
    await live.stop();
    await app.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  return { url: `http://localhost:${port}`, watch: () => live.watcher.start() };
}

/** Open a URL in the default browser, best-effort and non-fatal. */
function openBrowser(url: string): void {
  const cmd =
    platform === "darwin" ? "open" : platform === "win32" ? "start" : "xdg-open";
  try {
    const child = spawn(cmd, [url], {
      stdio: "ignore",
      detached: true,
      shell: platform === "win32",
    });
    child.on("error", () => {
      // best-effort: missing browser binary or PATH issue is non-fatal
    });
    child.unref();
  } catch {
    // sync spawn failure — also non-fatal
  }
}
