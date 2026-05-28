import { spawn } from "node:child_process";
import { platform } from "node:process";
import { buildServer } from "../api/server.js";

const PORT = Number(process.env.INTROSPECT_PORT ?? 4317);

/** Open a URL in the default browser, best-effort and non-fatal. */
function openBrowser(url: string): void {
  const cmd =
    platform === "darwin" ? "open" : platform === "win32" ? "start" : "xdg-open";
  try {
    spawn(cmd, [url], { stdio: "ignore", detached: true, shell: platform === "win32" }).unref();
  } catch {
    // ignore — the URL is printed below regardless
  }
}

async function main(): Promise<void> {
  const extraRoots = (process.env.INTROSPECT_EXTRA_ROOTS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const app = buildServer({ extraRoots });
  await app.listen({ port: PORT, host: "127.0.0.1" });

  const url = `http://localhost:${PORT}`;
  console.log(`introspect listening on ${url}`);
  openBrowser(url);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
