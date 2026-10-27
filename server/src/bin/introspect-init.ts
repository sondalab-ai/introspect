#!/usr/bin/env node
import { processIo } from "./cli.js";
import { runInit } from "./run-init.js";

process.exitCode = await runInit(processIo());
