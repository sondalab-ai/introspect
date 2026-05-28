import type { SessionEvent } from "./types.js";

interface RawEnvelope {
  type?: string;
  uuid?: string;
  parentUuid?: string;
  isSidechain?: boolean;
  timestamp?: string;
  requestId?: string;
  message?: { content?: unknown[] };
}

const PREVIEW_LIMIT = 200;

function s(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function asObj(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function previewOfResult(c: unknown): string {
  if (typeof c === "string") return c.replace(/\s+/g, " ").trim().slice(0, PREVIEW_LIMIT);
  if (Array.isArray(c)) {
    const text = c
      .map((b) => {
        const o = asObj(b);
        return o && typeof o.text === "string" ? o.text : "";
      })
      .join(" ");
    return text.replace(/\s+/g, " ").trim().slice(0, PREVIEW_LIMIT);
  }
  return "";
}

function baseShape(env: RawEnvelope) {
  return {
    uuid: s(env.uuid),
    parentUuid: env.parentUuid ? s(env.parentUuid) : undefined,
    isSidechain: env.isSidechain === true,
    ts: s(env.timestamp),
    requestId: env.requestId ? s(env.requestId) : undefined,
  };
}

/** Normalize a single transcript JSONL line into 0+ `SessionEvent`s. */
export function normalizeLine(raw: string): SessionEvent[] {
  let env: RawEnvelope;
  try { env = JSON.parse(raw) as RawEnvelope; } catch { return []; }
  if (env === null || typeof env !== "object") return [];

  const base = baseShape(env);

  if (env.type === "assistant") return normalizeAssistant(env, base);
  if (env.type === "user") return normalizeUser(env, base);
  return [];
}

function normalizeAssistant(env: RawEnvelope, base: ReturnType<typeof baseShape>): SessionEvent[] {
  const out: SessionEvent[] = [];
  const content = Array.isArray(env.message?.content) ? env.message!.content! : [];
  for (const block of content) {
    const o = asObj(block);
    if (!o) continue;
    switch (o.type) {
      case "thinking":
        out.push({ ...base, kind: "thinking", text: s(o.thinking) });
        break;
      case "text":
        out.push({ ...base, kind: "text", text: s(o.text) });
        break;
      case "tool_use": {
        const name = s(o.name);
        const toolUseId = s(o.id);
        out.push({ ...base, kind: "tool_use", name, input: o.input, toolUseId });
        if (name === "Task" || name === "Agent") {
          const inp = asObj(o.input) ?? {};
          out.push({
            ...base, kind: "subagent_spawn", toolUseId,
            subagentType: s(inp.subagent_type),
            description: s(inp.description),
          });
        } else if (name === "Skill") {
          const inp = asObj(o.input) ?? {};
          out.push({ ...base, kind: "skill_use", toolUseId, skill: s(inp.skill) });
        }
        break;
      }
      default:
        break;
    }
  }
  return out;
}

function normalizeUser(env: RawEnvelope, base: ReturnType<typeof baseShape>): SessionEvent[] {
  const out: SessionEvent[] = [];
  const content = env.message?.content;
  if (typeof content === "string") {
    out.push({ ...base, kind: "user", text: content });
    return out;
  }
  if (!Array.isArray(content)) return out;
  let textParts = "";
  for (const block of content) {
    const o = asObj(block);
    if (!o) continue;
    if (o.type === "tool_result") {
      out.push({
        ...base, kind: "tool_result",
        toolUseId: s(o.tool_use_id),
        ok: o.is_error !== true,
        preview: previewOfResult(o.content),
      });
    } else if (o.type === "text") {
      textParts += (textParts ? " " : "") + s(o.text);
    }
  }
  if (textParts) out.push({ ...base, kind: "user", text: textParts });
  return out;
}
