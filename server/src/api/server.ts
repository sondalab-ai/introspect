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
import { readProjects } from "../readers/projects.js";
import { readSessions, readSession, readAllSessions } from "../readers/sessions.js";
import { defaultProfilePath, loadProfile } from "../discovery/profile.js";
import { createBundleStream } from "../export/bundle.js";

/** Build the read-only API. `opts` are forwarded to the source resolver. */
export function buildServer(opts: ResolveOptions = {}): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get("/health", async () => ({ status: "ok" }));
  app.get("/sources", async () => resolveSources(opts));

  app.get("/instructions", async () => readInstructions(resolveSources(opts)));
  app.get("/agents", async () => readAgents(resolveSources(opts)));
  app.get("/commands", async () => readCommands(resolveSources(opts)));
  app.get("/skills", async () => readSkills(resolveSources(opts)));
  app.get("/memories", async () => {
    const profile = loadProfile(defaultProfilePath());
    return readMemories(resolveSources(opts), profile.extraMemoryDirs);
  });
  app.get("/plugins", async () => readPlugins(resolveSources(opts)));
  app.get("/settings", async () => readSettings(resolveSources(opts)));

  app.get("/projects", async () => readProjects(resolveSources(opts)));
  app.get("/sessions", async () => readAllSessions(resolveSources(opts)));

  app.get("/profile", async () => {
    const path = defaultProfilePath();
    return { path, profile: loadProfile(path) };
  });

  app.get("/export", async (_req, reply) => {
    const roots = resolveSources(opts);
    const { stream, filename, finalize } = createBundleStream(roots, defaultProfilePath());
    reply.header("Content-Type", "application/zip");
    reply.header("Content-Disposition", `attachment; filename="${filename}"`);
    finalize();
    return reply.send(stream);
  });

  app.get<{ Params: { slug: string } }>("/projects/:slug/sessions", async (req) =>
    readSessions(resolveSources(opts), req.params.slug),
  );

  app.get<{ Params: { slug: string; id: string } }>(
    "/sessions/:slug/:id",
    async (req, reply) => {
      const t = readSession(resolveSources(opts), req.params.slug, req.params.id);
      if (!t) return reply.code(404).send({ error: "not found" });
      return t;
    },
  );

  return app;
}
