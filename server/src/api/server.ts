import Fastify, { type FastifyInstance } from "fastify";
import { resolveSources } from "../sources/index.js";
import type { ResolveOptions } from "../sources/index.js";
import { readInstructions } from "../readers/instructions.js";
import { readAgents } from "../readers/agents.js";
import { readCommands } from "../readers/commands.js";
import { readSkills } from "../readers/skills.js";
import { readMemories } from "../readers/memories.js";
import { readPlugins } from "../readers/plugins.js";
import { readSettings } from "../readers/settings.js";

/** Build the read-only API. `opts` are forwarded to the source resolver. */
export function buildServer(opts: ResolveOptions = {}): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get("/health", async () => ({ status: "ok" }));
  app.get("/sources", async () => resolveSources(opts));

  app.get("/instructions", async () => readInstructions(resolveSources(opts)));
  app.get("/agents", async () => readAgents(resolveSources(opts)));
  app.get("/commands", async () => readCommands(resolveSources(opts)));
  app.get("/skills", async () => readSkills(resolveSources(opts)));
  app.get("/memories", async () => readMemories(resolveSources(opts)));
  app.get("/plugins", async () => readPlugins(resolveSources(opts)));
  app.get("/settings", async () => readSettings(resolveSources(opts)));

  return app;
}
