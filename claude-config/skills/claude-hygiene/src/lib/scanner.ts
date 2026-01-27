import { join, basename } from "path";
import { readdirSync, statSync, existsSync } from "fs";
import type { ProjectDir, SessionEntry, SessionIndex, ClaudeDirReport } from "../types";

const HOME = process.env.HOME || "/home/whoabuddy";
const CLAUDE_DIR = join(HOME, ".claude");
const PROJECTS_DIR = join(CLAUDE_DIR, "projects");
const DEV_DIR = join(HOME, "dev");

/** Calculate total size of a directory recursively */
export function dirSize(dirPath: string): number {
  if (!existsSync(dirPath)) return 0;
  let total = 0;
  try {
    const entries = readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);
      if (entry.isDirectory()) {
        total += dirSize(fullPath);
      } else if (entry.isFile()) {
        try {
          total += statSync(fullPath).size;
        } catch {
          // Skip inaccessible files
        }
      }
    }
  } catch {
    // Skip inaccessible directories
  }
  return total;
}

/** Get size breakdown of top-level directories in ~/.claude/ */
export function getClaudeDirSizes(): Record<string, number> {
  const sizes: Record<string, number> = {};
  if (!existsSync(CLAUDE_DIR)) return sizes;

  const entries = readdirSync(CLAUDE_DIR, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(CLAUDE_DIR, entry.name);
    if (entry.isDirectory()) {
      sizes[entry.name] = dirSize(fullPath);
    } else if (entry.isFile()) {
      try {
        sizes[entry.name] = statSync(fullPath).size;
      } catch {
        sizes[entry.name] = 0;
      }
    }
  }
  return sizes;
}

/** Decode project directory name back to a path */
export function decodeProjectDirName(name: string): string {
  // e.g., "-home-whoabuddy-dev-org-repo" -> "/home/whoabuddy/dev/org/repo"
  return "/" + name.replace(/^-/, "").replace(/-/g, "/");
}

/** Parse sessions-index.json from a project directory */
export function parseSessionIndex(projectDir: string): SessionEntry[] {
  const indexPath = join(projectDir, "sessions-index.json");
  if (!existsSync(indexPath)) return [];

  try {
    const raw = Bun.file(indexPath);
    // Use sync read
    const text = require("fs").readFileSync(indexPath, "utf-8");
    const data: SessionIndex = JSON.parse(text);
    return data.entries || [];
  } catch {
    return [];
  }
}

/** Count JSONL session files in a project directory */
export function countSessionFiles(projectDir: string): number {
  if (!existsSync(projectDir)) return 0;
  try {
    return readdirSync(projectDir).filter((f) => f.endsWith(".jsonl")).length;
  } catch {
    return 0;
  }
}

/** Scan all project directories under ~/.claude/projects/ */
export function scanProjects(): ProjectDir[] {
  if (!existsSync(PROJECTS_DIR)) return [];

  const projects: ProjectDir[] = [];
  const entries = readdirSync(PROJECTS_DIR, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const fullPath = join(PROJECTS_DIR, entry.name);
    const projectPath = decodeProjectDirName(entry.name);
    const sessions = parseSessionIndex(fullPath);
    const sessionCount = countSessionFiles(fullPath);
    const sizeBytes = dirSize(fullPath);

    projects.push({ path: fullPath, projectPath, sizeBytes, sessionCount, sessions });
  }

  return projects.sort((a, b) => b.sizeBytes - a.sizeBytes);
}

/** Find all repo-level .claude directories under ~/dev/ */
export function scanRepoClaude(): string[] {
  const dirs: string[] = [];
  if (!existsSync(DEV_DIR)) return dirs;

  // Walk two levels: ~/dev/{org}/{repo}/.claude
  try {
    for (const org of readdirSync(DEV_DIR, { withFileTypes: true })) {
      if (!org.isDirectory()) continue;
      const orgPath = join(DEV_DIR, org.name);
      try {
        for (const repo of readdirSync(orgPath, { withFileTypes: true })) {
          if (!repo.isDirectory()) continue;
          const claudeDir = join(orgPath, repo.name, ".claude");
          if (existsSync(claudeDir)) {
            dirs.push(claudeDir);
          }
        }
      } catch {
        // Skip inaccessible org dirs
      }
    }
  } catch {
    // Skip if dev dir not readable
  }
  return dirs;
}

/** Build a full report of the .claude directory */
export function buildClaudeDirReport(): ClaudeDirReport {
  const directories = getClaudeDirSizes();
  const totalBytes = Object.values(directories).reduce((sum, s) => sum + s, 0);
  const projects = scanProjects();

  // Global sessions from ~/.claude/projects/-home-whoabuddy/ if it exists
  const globalProjectDir = join(PROJECTS_DIR, `-home-${basename(HOME)}`);
  const globalSessions = existsSync(globalProjectDir) ? parseSessionIndex(globalProjectDir) : [];

  return { totalBytes, directories, projects, globalSessions };
}

/** Format bytes as human-readable string */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return `${val.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}
