#!/usr/bin/env node
import { processIo } from "./cli.js";
import { runIntrospect } from "./run-introspect.js";

const code = await runIntrospect(processIo());
if (code !== 0) process.exit(code);
