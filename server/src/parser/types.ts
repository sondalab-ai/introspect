/** Normalized event derived from a transcript `.jsonl` line. */
export type SessionEvent =
  | ThinkingEvent | TextEvent | ToolUseEvent | ToolResultEvent
  | SubagentSpawnEvent | SkillUseEvent | UserEvent | MetaEvent;

export interface EventBase {
  uuid: string;
  parentUuid?: string;
  isSidechain: boolean;
  ts: string;
  requestId?: string;
}

export interface ThinkingEvent extends EventBase { kind: "thinking"; text: string }
export interface TextEvent extends EventBase { kind: "text"; text: string }
export interface ToolUseEvent extends EventBase {
  kind: "tool_use";
  name: string;
  input: unknown;
  toolUseId: string;
}
export interface ToolResultEvent extends EventBase {
  kind: "tool_result";
  toolUseId: string;
  ok: boolean;
  preview: string;
}
export interface SubagentSpawnEvent extends EventBase {
  kind: "subagent_spawn";
  toolUseId: string;
  subagentType: string;
  description: string;
}
export interface SkillUseEvent extends EventBase {
  kind: "skill_use";
  toolUseId: string;
  skill: string;
}
export interface UserEvent extends EventBase { kind: "user"; text: string }
export interface MetaEvent extends EventBase { kind: "meta"; key: string; value: unknown }

/** Tree node for the main-thread → subagent → tool → file execution view. */
export interface ExecutionNode {
  event: SessionEvent;
  children: ExecutionNode[];
}

/** Per-session summary computed during normalization. */
export interface SessionMeta {
  sessionId: string;
  firstTs?: string;
  lastTs?: string;
  models: string[];
  cwd?: string;
  gitBranch?: string;
  messageCounts: { user: number; assistant: number; sidechain: number };
  toolCounts: Record<string, number>;
  subagentCount: number;
  totalUsageTokens: number;
}

export function emptyMeta(sessionId: string): SessionMeta {
  return {
    sessionId,
    models: [],
    messageCounts: { user: 0, assistant: 0, sidechain: 0 },
    toolCounts: {},
    subagentCount: 0,
    totalUsageTokens: 0,
  };
}
