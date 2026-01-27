/** Session entry from sessions-index.json */
export interface SessionEntry {
  sessionId: string;
  fullPath: string;
  fileMtime: number;
  firstPrompt: string;
  summary: string;
  messageCount: number;
  created: string;
  modified: string;
  gitBranch: string;
  projectPath: string;
  isSidechain: boolean;
}

/** sessions-index.json root */
export interface SessionIndex {
  version: number;
  entries: SessionEntry[];
}

/** A discovered .claude project directory */
export interface ProjectDir {
  /** Path to the project dir under ~/.claude/projects/ */
  path: string;
  /** Decoded project path (e.g., /home/user/dev/org/repo) */
  projectPath: string;
  /** Size in bytes of all files in this dir */
  sizeBytes: number;
  /** Number of session JSONL files */
  sessionCount: number;
  /** Parsed session index if available */
  sessions: SessionEntry[];
}

/** Size breakdown of ~/.claude/ top-level directories */
export interface ClaudeDirReport {
  totalBytes: number;
  directories: Record<string, number>;
  projects: ProjectDir[];
  /** Global session data (from ~/.claude/ itself) */
  globalSessions: SessionEntry[];
}

/** Age bucket for sessions */
export interface AgeBuckets {
  recent: SessionEntry[]; // < 7 days
  moderate: SessionEntry[]; // 7-30 days
  old: SessionEntry[]; // > 30 days
}

/** Archive manifest entry appended to manifest.jsonl */
export interface ArchiveManifestEntry {
  sessionId: string;
  projectPath: string;
  originalPath: string;
  archivePath: string;
  originalSizeBytes: number;
  compressedSizeBytes: number;
  summary: string;
  messageCount: number;
  created: string;
  modified: string;
  archivedAt: string;
}

/** Incremental processing state stored at ~/.claude/.hygiene/state.json */
export interface HygieneState {
  version: number;
  /** Session IDs that have been archived */
  archivedSessions: string[];
  /** Session IDs that have been scored for extraction */
  scoredSessions: string[];
  /** Last run timestamps */
  lastRun: {
    report?: string;
    archive?: string;
    extract?: string;
    clean?: string;
  };
}

/** Extraction score for a session */
export interface SessionScore {
  sessionId: string;
  entry: SessionEntry;
  score: number;
  reasons: string[];
}

/** Report output format */
export interface ReportOutput {
  timestamp: string;
  claudeDir: ClaudeDirReport;
  ageBuckets: AgeBuckets;
  orphans: {
    emptyTodos: string[];
    orphanedSessionEnvs: string[];
  };
  reclaimable: {
    archiveBytes: number;
    cleanBytes: number;
  };
}
