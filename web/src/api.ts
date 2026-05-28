export interface InstructionsItem { rootPath: string; path: string; content: string; }
export interface AgentItem { rootPath: string; path: string; name: string; description: string; tools: string; body: string; bodyPreview: string; }
export interface CommandItem { rootPath: string; path: string; name: string; description: string; body: string; bodyPreview: string; }
export interface SkillItem { rootPath: string; path: string; name: string; description: string; body: string; bodyPreview: string; }
export interface MemoryItem { rootPath: string; path: string; name: string; meta: Record<string, unknown>; body: string; bodyPreview: string; scope: string; }
export interface PluginItem { rootPath: string; id: string; source: string; enabled: boolean; version: string; }
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

export const ENDPOINTS = {
  instructions: "/instructions",
  agents: "/agents",
  commands: "/commands",
  skills: "/skills",
  memories: "/memories",
  plugins: "/plugins",
  settings: "/settings",
} as const;
