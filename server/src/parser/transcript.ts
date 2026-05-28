import { basename } from "node:path";
import { readLinesFrom } from "./jsonlReader.js";
import { normalizeLine } from "./eventNormalizer.js";
import { buildTree } from "./executionTree.js";
import { emptyMeta, type ExecutionNode, type SessionEvent, type SessionMeta } from "./types.js";

export interface Transcript {
  events: SessionEvent[];
  tree: ExecutionNode[];
  meta: SessionMeta;
}

function asObj(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function s(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function sessionIdFromFile(path: string): string {
  const base = basename(path);
  return base.endsWith(".jsonl") ? base.slice(0, -".jsonl".length) : base;
}

/** Parse a full transcript file in one pass. */
export function readTranscript(path: string): Transcript {
  const { lines } = readLinesFrom(path, 0);
  const sessionId = sessionIdFromFile(path);
  const meta = emptyMeta(sessionId);
  const events: SessionEvent[] = [];
  const modelsSeen = new Set<string>();

  for (const raw of lines) {
    let env: Record<string, unknown> | null;
    try { env = asObj(JSON.parse(raw)); } catch { env = null; }
    if (env) {
      if (env.type === "assistant") meta.messageCounts.assistant += 1;
      else if (env.type === "user") meta.messageCounts.user += 1;
      if (env.isSidechain === true) meta.messageCounts.sidechain += 1;
      const msg = asObj(env.message);
      if (msg) {
        const model = s(msg.model);
        if (model && !modelsSeen.has(model)) { modelsSeen.add(model); meta.models.push(model); }
        const usage = asObj(msg.usage);
        if (usage) {
          const inT = typeof usage.input_tokens === "number" ? usage.input_tokens : 0;
          const outT = typeof usage.output_tokens === "number" ? usage.output_tokens : 0;
          meta.totalUsageTokens += inT + outT;
        }
      }
      const cwd = s(env.cwd);
      if (cwd && !meta.cwd) meta.cwd = cwd;
      const gb = s(env.gitBranch);
      if (gb && !meta.gitBranch) meta.gitBranch = gb;
      const ts = s(env.timestamp);
      if (ts) {
        if (!meta.firstTs) meta.firstTs = ts;
        meta.lastTs = ts;
      }
    }

    const normalized = normalizeLine(raw);
    for (const e of normalized) {
      events.push(e);
      if (e.kind === "tool_use") {
        meta.toolCounts[e.name] = (meta.toolCounts[e.name] ?? 0) + 1;
      } else if (e.kind === "subagent_spawn") {
        meta.subagentCount += 1;
      }
    }
  }

  return { events, tree: buildTree(events), meta };
}
