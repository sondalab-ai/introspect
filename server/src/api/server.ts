import Fastify, { type FastifyInstance } from "fastify";
import { resolveSources } from "../sources/index.js";
import type { ResolveOptions } from "../sources/index.js";

/** Build the read-only API. `opts` are forwarded to the source resolver. */
export function buildServer(opts: ResolveOptions = {}): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get("/health", async () => ({ status: "ok" }));

  app.get("/sources", async () => resolveSources(opts));

  return app;
}
