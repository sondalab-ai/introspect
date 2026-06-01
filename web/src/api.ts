export interface InstructionsItem { rootPath: string; path: string; content: string; }
export type ItemSource = "user" | "plugin";
export interface Precedence { source: ItemSource; shadowed: boolean; shadowedBy?: { source: ItemSource; path: string }; duplicate: boolean; }
export interface AgentItem extends Precedence { rootPath: string; path: string; name: string; description: string; tools: string; body: string; bodyPreview: string; }
export interface CommandItem extends Precedence { rootPath: string; path: string; name: string; description: string; body: string; bodyPreview: string; }
export interface SkillItem extends Precedence { rootPath: string; path: string; name: string; description: string; body: string; bodyPreview: string; }
export interface MemoryItem { rootPath: string; path: string; name: string; meta: Record<string, unknown>; body: string; bodyPreview: string; scope: string; cwd?: string; }
export interface PluginItem { rootPath: string; id: string; source: string; enabled: boolean; version: string; installPath: string; }
export interface SettingsItem {
  rootPath: string;
  fileName: string;
  path: string;
  hooks: Record<string, unknown>;
  permissions: Record<string, unknown>;
  env: Record<string, unknown>;
  other: Record<string, unknown>;
  redactedKeys: string[];
}

export interface ProjectItem {
  id: string;
  rootPath: string;
  slug: string;
  sessionCount: number;
  lastActivityMs: number;
  cwd?: string;
  cwdExists?: boolean;
}

export interface SessionMeta {
  sessionId: string;
  title?: string;
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

export interface SessionListItem extends SessionMeta {
  rootPath: string;
  slug: string;
  filePath: string;
  fileSize: number;
}

interface EventBase {
  uuid: string;
  parentUuid?: string;
  isSidechain: boolean;
  ts: string;
  requestId?: string;
}

export type SessionEvent =
  | (EventBase & { kind: "thinking"; text: string })
  | (EventBase & { kind: "text"; text: string })
  | (EventBase & { kind: "tool_use"; name: string; input: unknown; toolUseId: string })
  | (EventBase & { kind: "tool_result"; toolUseId: string; ok: boolean; preview: string })
  | (EventBase & { kind: "subagent_spawn"; toolUseId: string; subagentType: string; description: string })
  | (EventBase & { kind: "skill_use"; toolUseId: string; skill: string })
  | (EventBase & { kind: "user"; text: string })
  | (EventBase & { kind: "meta"; key: string; value: unknown });

export interface ExecutionNode {
  event: SessionEvent;
  children: ExecutionNode[];
}

export interface Transcript {
  events: SessionEvent[];
  tree: ExecutionNode[];
  meta: SessionMeta;
}

export interface LiveHello { type: "hello"; clients: number }
export interface LiveSessionStart {
  type: "session-start"; rootPath: string; slug: string; sessionId: string;
}
export interface LiveEvent {
  type: "event"; rootPath: string; slug: string; sessionId: string;
  event: SessionEvent;
}
export type LiveFrame = LiveHello | LiveSessionStart | LiveEvent;

export const ENDPOINTS = {
  instructions: "/instructions",
  agents: "/agents",
  commands: "/commands",
  skills: "/skills",
  memories: "/memories",
  plugins: "/plugins",
  settings: "/settings",
  projects: "/projects",
  sessionsAll: "/sessions",
  sources: "/sources",
  profile: "/profile",
  sessionsOf: (slug: string) => `/projects/${encodeURIComponent(slug)}/sessions`,
  session: (slug: string, id: string) =>
    `/sessions/${encodeURIComponent(slug)}/${encodeURIComponent(id)}`,
} as const;
