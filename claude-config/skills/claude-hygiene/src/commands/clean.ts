import { join } from "path";
import { existsSync, readdirSync, statSync, unlinkSync, rmSync } from "fs";
import { dirSize, formatBytes } from "../lib/scanner";
import { loadState, saveState, isArchived, stampLastRun } from "../lib/state";

const HOME = process.env.HOME || "/home/whoabuddy";
const CLAUDE_DIR = join(HOME, ".claude");

interface CleanOptions {
  dryRun: boolean;
  todos: boolean;
  sessionEnv: boolean;
  debug: boolean;
  deleteArchived: boolean;
  confirm: boolean;
}

interface CleanResult {
  type: string;
  path: string;
  sizeBytes: number;
  deleted: boolean;
}

/** Find empty todo files (<=3 bytes, typically `[]` or `[]\\n`) */
function findEmptyTodos(): CleanResult[] {
  const todosDir = join(CLAUDE_DIR, "todos");
  if (!existsSync(todosDir)) return [];

  const results: CleanResult[] = [];
  try {
    for (const entry of readdirSync(todosDir)) {
      const fullPath = join(todosDir, entry);
      try {
        const stat = statSync(fullPath);
        if (stat.isFile() && stat.size <= 3) {
          results.push({ type: "empty-todo", path: fullPath, sizeBytes: stat.size, deleted: false });
        }
      } catch {
        // Skip
      }
    }
  } catch {
    // Skip
  }
  return results;
}

/** Find orphaned session-env directories */
function findOrphanedSessionEnvs(): CleanResult[] {
  const sessionEnvDir = join(CLAUDE_DIR, "session-env");
  if (!existsSync(sessionEnvDir)) return [];

  const results: CleanResult[] = [];
  const projectsDir = join(CLAUDE_DIR, "projects");

  try {
    for (const envDir of readdirSync(sessionEnvDir, { withFileTypes: true })) {
      if (!envDir.isDirectory()) continue;
      const sessionId = envDir.name;
      const fullPath = join(sessionEnvDir, envDir.name);
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
        results.push({
          type: "orphaned-session-env",
          path: fullPath,
          sizeBytes: dirSize(fullPath),
          deleted: false,
        });
      }
    }
  } catch {
    // Skip
  }
  return results;
}

/** Find debug log files */
function findDebugLogs(thresholdDays: number = 0): CleanResult[] {
  const debugDir = join(CLAUDE_DIR, "debug");
  if (!existsSync(debugDir)) return [];

  const results: CleanResult[] = [];
  const now = Date.now();
  const thresholdMs = thresholdDays * 24 * 60 * 60 * 1000;

  try {
    for (const entry of readdirSync(debugDir)) {
      const fullPath = join(debugDir, entry);
      try {
        const stat = statSync(fullPath);
        if (stat.isFile()) {
          const ageMs = now - stat.mtimeMs;
          if (thresholdDays === 0 || ageMs > thresholdMs) {
            results.push({ type: "debug-log", path: fullPath, sizeBytes: stat.size, deleted: false });
          }
        }
      } catch {
        // Skip
      }
    }
  } catch {
    // Skip
  }
  return results;
}

/** Find archived originals (session JSONL files already in the archive) */
function findArchivedOriginals(): CleanResult[] {
  const state = loadState();
  const projectsDir = join(CLAUDE_DIR, "projects");
  if (!existsSync(projectsDir)) return [];

  const results: CleanResult[] = [];

  try {
    for (const project of readdirSync(projectsDir)) {
      const projectDir = join(projectsDir, project);
      try {
        for (const file of readdirSync(projectDir)) {
          if (!file.endsWith(".jsonl")) continue;
          const sessionId = file.replace(".jsonl", "");
          if (isArchived(state, sessionId)) {
            const fullPath = join(projectDir, file);
            try {
              const stat = statSync(fullPath);
              results.push({
                type: "archived-original",
                path: fullPath,
                sizeBytes: stat.size,
                deleted: false,
              });
            } catch {
              // Skip
            }
          }
        }
      } catch {
        // Skip
      }
    }
  } catch {
    // Skip
  }
  return results;
}

export async function runClean(options: CleanOptions): Promise<void> {
  const allResults: CleanResult[] = [];

  // Collect targets based on flags
  if (options.todos) {
    allResults.push(...findEmptyTodos());
  }
  if (options.sessionEnv) {
    allResults.push(...findOrphanedSessionEnvs());
  }
  if (options.debug) {
    allResults.push(...findDebugLogs());
  }
  if (options.deleteArchived) {
    if (!options.confirm) {
      console.error("ERROR: --delete-archived requires --confirm flag");
      process.exit(1);
    }
    allResults.push(...findArchivedOriginals());
  }

  // If no flags specified, show everything in dry-run
  if (!options.todos && !options.sessionEnv && !options.debug && !options.deleteArchived) {
    console.log("No cleanup targets specified. Showing all potential targets:");
    console.log();
    const todos = findEmptyTodos();
    const envs = findOrphanedSessionEnvs();
    const debugs = findDebugLogs();
    const archived = findArchivedOriginals();

    const todoSize = todos.reduce((s, r) => s + r.sizeBytes, 0);
    const envSize = envs.reduce((s, r) => s + r.sizeBytes, 0);
    const debugSize = debugs.reduce((s, r) => s + r.sizeBytes, 0);
    const archivedSize = archived.reduce((s, r) => s + r.sizeBytes, 0);

    console.log("| Target | Count | Size | Flag |");
    console.log("|--------|:-----:|------|------|");
    console.log(`| Empty todos | ${todos.length} | ${formatBytes(todoSize)} | --todos |`);
    console.log(`| Orphaned session-env | ${envs.length} | ${formatBytes(envSize)} | --session-env |`);
    console.log(`| Debug logs | ${debugs.length} | ${formatBytes(debugSize)} | --debug |`);
    console.log(`| Archived originals | ${archived.length} | ${formatBytes(archivedSize)} | --delete-archived --confirm |`);
    console.log();
    console.log(`**Total reclaimable:** ${formatBytes(todoSize + envSize + debugSize + archivedSize)}`);
    console.log();
    console.log("Use --dry-run with specific flags to preview, or remove --dry-run to clean.");
    return;
  }

  if (allResults.length === 0) {
    console.log("Nothing to clean.");
    return;
  }

  const totalSize = allResults.reduce((s, r) => s + r.sizeBytes, 0);

  if (options.dryRun) {
    console.log("## Dry Run - Would Delete:");
    console.log();

    // Group by type
    const byType = new Map<string, CleanResult[]>();
    for (const r of allResults) {
      const list = byType.get(r.type) || [];
      list.push(r);
      byType.set(r.type, list);
    }

    for (const [type, results] of byType) {
      const typeSize = results.reduce((s, r) => s + r.sizeBytes, 0);
      console.log(`### ${type} (${results.length} items, ${formatBytes(typeSize)})`);
      // Show first 10 of each type
      for (const r of results.slice(0, 10)) {
        const shortPath = r.path.replace(HOME, "~");
        console.log(`  ${shortPath} (${formatBytes(r.sizeBytes)})`);
      }
      if (results.length > 10) {
        console.log(`  ... and ${results.length - 10} more`);
      }
      console.log();
    }

    console.log(`**Total: ${allResults.length} items, ${formatBytes(totalSize)}**`);
    return;
  }

  // Actually delete
  let deleted = 0;
  let deletedSize = 0;
  let errors = 0;

  for (const result of allResults) {
    try {
      if (result.type === "orphaned-session-env") {
        rmSync(result.path, { recursive: true });
      } else {
        unlinkSync(result.path);
      }
      result.deleted = true;
      deleted++;
      deletedSize += result.sizeBytes;
    } catch (err) {
      errors++;
      console.error(`  Failed to delete ${result.path}: ${err}`);
    }
  }

  const state = loadState();
  stampLastRun(state, "clean");
  saveState(state);

  console.log("## Clean Summary");
  console.log(`- Items deleted: ${deleted}`);
  console.log(`- Space reclaimed: ${formatBytes(deletedSize)}`);
  if (errors > 0) {
    console.log(`- Errors: ${errors}`);
  }
}
