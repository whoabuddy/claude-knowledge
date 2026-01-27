import { join } from "path";
import { existsSync, readdirSync, statSync } from "fs";
import { buildClaudeDirReport, formatBytes, scanRepoClaude, dirSize } from "../lib/scanner";
import { bucketByAge } from "../lib/session-parser";
import { loadState, saveState, stampLastRun } from "../lib/state";
import type { ReportOutput, SessionEntry } from "../types";

const HOME = process.env.HOME || "/home/whoabuddy";
const CLAUDE_DIR = join(HOME, ".claude");

interface ReportOptions {
  json: boolean;
  threshold: number;
}

/** Find empty todo files (2-byte `[]` files) */
function findEmptyTodos(): string[] {
  const todosDir = join(CLAUDE_DIR, "todos");
  if (!existsSync(todosDir)) return [];

  const empty: string[] = [];
  try {
    const entries = readdirSync(todosDir);
    for (const entry of entries) {
      const fullPath = join(todosDir, entry);
      try {
        const stat = statSync(fullPath);
        if (stat.isFile() && stat.size <= 3) {
          empty.push(fullPath);
        }
      } catch {
        // Skip
      }
    }
  } catch {
    // Skip
  }
  return empty;
}

/** Find orphaned session-env directories (no matching session JSONL) */
function findOrphanedSessionEnvs(): string[] {
  const sessionEnvDir = join(CLAUDE_DIR, "session-env");
  if (!existsSync(sessionEnvDir)) return [];

  const orphans: string[] = [];
  try {
    const envDirs = readdirSync(sessionEnvDir, { withFileTypes: true });
    for (const envDir of envDirs) {
      if (!envDir.isDirectory()) continue;
      // Check if there's a matching session JSONL anywhere in projects/
      const sessionId = envDir.name;
      const projectsDir = join(CLAUDE_DIR, "projects");
      let found = false;

      if (existsSync(projectsDir)) {
        for (const project of readdirSync(projectsDir)) {
          const jsonlPath = join(projectsDir, project, `${sessionId}.jsonl`);
          if (existsSync(jsonlPath)) {
            found = true;
            break;
          }
        }
      }

      if (!found) {
        orphans.push(join(sessionEnvDir, envDir.name));
      }
    }
  } catch {
    // Skip
  }
  return orphans;
}

export async function runReport(options: ReportOptions): Promise<void> {
  const state = loadState();
  const report = buildClaudeDirReport();

  // Collect all sessions across all projects
  const allSessions: SessionEntry[] = [];
  for (const project of report.projects) {
    allSessions.push(...project.sessions);
  }

  const ageBuckets = bucketByAge(allSessions);
  const emptyTodos = findEmptyTodos();
  const orphanedEnvs = findOrphanedSessionEnvs();

  // Estimate reclaimable space
  let archiveBytes = 0;
  const thresholdMs = options.threshold * 24 * 60 * 60 * 1000;
  const now = Date.now();
  for (const session of allSessions) {
    const ageMs = now - new Date(session.modified).getTime();
    if (ageMs > thresholdMs) {
      try {
        const stat = statSync(session.fullPath);
        archiveBytes += stat.size;
      } catch {
        // Skip
      }
    }
  }

  let cleanBytes = 0;
  // Empty todos are tiny but count them
  cleanBytes += emptyTodos.length * 3;
  // Orphaned session-env dirs
  for (const path of orphanedEnvs) {
    cleanBytes += dirSize(path);
  }
  // Debug logs
  const debugDir = join(CLAUDE_DIR, "debug");
  if (existsSync(debugDir)) {
    cleanBytes += dirSize(debugDir);
  }

  const output: ReportOutput = {
    timestamp: new Date().toISOString(),
    claudeDir: report,
    ageBuckets,
    orphans: { emptyTodos, orphanedSessionEnvs: orphanedEnvs },
    reclaimable: { archiveBytes, cleanBytes },
  };

  stampLastRun(state, "report");
  saveState(state);

  if (options.json) {
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  // Pretty print
  console.log("# Claude Data Report");
  console.log(`Generated: ${output.timestamp}`);
  console.log();

  // Overall size
  console.log("## Directory Sizes");
  console.log(`Total: ${formatBytes(report.totalBytes)}`);
  console.log();
  console.log("| Directory | Size |");
  console.log("|-----------|------|");
  const sortedDirs = Object.entries(report.directories).sort((a, b) => b[1] - a[1]);
  for (const [name, size] of sortedDirs) {
    if (size > 0) {
      console.log(`| ${name} | ${formatBytes(size)} |`);
    }
  }
  console.log();

  // Projects breakdown
  console.log("## Projects (Top 15 by size)");
  console.log("| Project | Size | Sessions |");
  console.log("|---------|------|----------|");
  for (const project of report.projects.slice(0, 15)) {
    const shortPath = project.projectPath.replace(HOME, "~");
    console.log(`| ${shortPath} | ${formatBytes(project.sizeBytes)} | ${project.sessionCount} |`);
  }
  if (report.projects.length > 15) {
    console.log(`| ... and ${report.projects.length - 15} more | | |`);
  }
  console.log();

  // Repo-level .claude dirs
  const repoDirs = scanRepoClaude();
  if (repoDirs.length > 0) {
    console.log("## Repo-Level .claude Directories");
    console.log(`Found ${repoDirs.length} repo-level .claude directories under ~/dev/`);
    let repoTotal = 0;
    for (const dir of repoDirs) {
      repoTotal += dirSize(dir);
    }
    console.log(`Total repo-level size: ${formatBytes(repoTotal)}`);
    console.log();
  }

  // Session age distribution
  console.log("## Session Age Distribution");
  console.log(`| Bucket | Count |`);
  console.log(`|--------|-------|`);
  console.log(`| < 7 days | ${ageBuckets.recent.length} |`);
  console.log(`| 7-30 days | ${ageBuckets.moderate.length} |`);
  console.log(`| > 30 days | ${ageBuckets.old.length} |`);
  console.log(`| **Total** | **${allSessions.length}** |`);
  console.log();

  // Orphans
  console.log("## Orphaned Data");
  console.log(`- Empty todo files: ${emptyTodos.length}`);
  console.log(`- Orphaned session-env dirs: ${orphanedEnvs.length}`);
  console.log();

  // Reclaimable
  console.log("## Reclaimable Space");
  console.log(`- Archive (sessions > ${options.threshold}d): ${formatBytes(output.reclaimable.archiveBytes)}`);
  console.log(`- Clean (todos + envs + debug): ${formatBytes(output.reclaimable.cleanBytes)}`);
  console.log(`- **Total potential**: ${formatBytes(output.reclaimable.archiveBytes + output.reclaimable.cleanBytes)}`);
}
