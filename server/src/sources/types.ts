export type SourceId =
  | "instructions"
  | "skills"
  | "agents"
  | "commands"
  | "memories"
  | "settings"
  | "plugins"
  | "projects"
  | "history"
  | "debug"
  | "debugDecisions";

export interface ConfigRoot {
  /** Path as detected or supplied, before symlink resolution. */
  declaredPath: string;
  /** realpath()-resolved absolute path. */
  realPath: string;
  /** inode of the resolved path, used for deduplication. */
  inode: number;
}

export interface ResolvedSource {
  id: SourceId;
  realPath: string;
  status: "present" | "missing";
}

export interface ResolvedRoot {
  root: ConfigRoot;
  sources: ResolvedSource[];
}

export interface ResolveOptions {
  /** Defaults to process.env. */
  env?: NodeJS.ProcessEnv;
  /** Extra config roots to include alongside the detected base. */
  extraRoots?: string[];
  /** Defaults to os.homedir(). Injectable for tests. */
  homeDir?: string;
}
