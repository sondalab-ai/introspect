#!/usr/bin/env node
import { spawn } from "node:child_process";
import { platform } from "node:process";
import { buildServer } from "../api/server.js";
import { attachLive } from "../live/attach.js";
import { parseExtraRoots } from "./env.js";

const PORT = Number(process.env.INTROSPECT_PORT ?? 4317);

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

async function main(): Promise<void> {
  const extraRoots = parseExtraRoots(process.env.INTROSPECT_EXTRA_ROOTS);

  const app = buildServer({ extraRoots });
  const live = attachLive(app, { extraRoots });
  await app.listen({ port: PORT, host: "127.0.0.1" });
  await live.watcher.start();

  const shutdown = async (): Promise<void> => {
    await live.stop();
    await app.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  const url = `http://localhost:${PORT}`;
  console.log(`introspect listening on ${url}`);
  openBrowser(url);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
