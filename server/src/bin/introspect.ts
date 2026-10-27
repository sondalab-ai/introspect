#!/usr/bin/env node
import { processIo } from "./cli.js";
import { defaultDeps, runIntrospect } from "./run-introspect.js";

let bound = false;
const code = await runIntrospect(processIo(), {
  ...defaultDeps,
  listen: async (port, extraRoots) => {
    const server = await defaultDeps.listen(port, extraRoots);
    bound = true;
    return server;
  },
});
process.exitCode = code;
// A server that bound and then failed may leave handles open: exit once stderr has flushed.
if (code !== 0 && bound) process.stderr.write("", () => process.exit(code));
