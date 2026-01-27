import { statSync } from "fs";
import { scanProjects, formatBytes } from "../lib/scanner";
import { archiveSession, ensureArchiveDirs } from "../lib/archiver";
import { loadState, saveState, markArchived, isArchived, stampLastRun } from "../lib/state";
import type { SessionEntry } from "../types";

interface ArchiveOptions {
  dryRun: boolean;
  threshold: number;
  deleteOriginals: boolean;
}

export async function runArchive(options: ArchiveOptions): Promise<void> {
  const state = loadState();
  const projects = scanProjects();

  const thresholdMs = options.threshold * 24 * 60 * 60 * 1000;
  const now = Date.now();

  // Find sessions older than threshold
  const candidates: SessionEntry[] = [];
  for (const project of projects) {
    for (const session of project.sessions) {
      const ageMs = now - new Date(session.modified).getTime();
      if (ageMs > thresholdMs && !isArchived(state, session.sessionId)) {
        candidates.push(session);
      }
    }
  }

  if (candidates.length === 0) {
    console.log(`No sessions older than ${options.threshold} days to archive.`);
    return;
  }

  // Calculate total size
  let totalOriginalSize = 0;
  const validCandidates: Array<{ entry: SessionEntry; size: number }> = [];
  for (const entry of candidates) {
    try {
      const size = statSync(entry.fullPath).size;
      totalOriginalSize += size;
      validCandidates.push({ entry, size });
    } catch {
      // File may have been removed
    }
  }

  console.log(`Found ${validCandidates.length} sessions to archive (${formatBytes(totalOriginalSize)} total)`);
  console.log(`Threshold: ${options.threshold} days`);

  if (options.dryRun) {
    console.log();
    console.log("## Dry Run - Would Archive:");
    console.log("| Session | Project | Messages | Modified | Size |");
    console.log("|---------|---------|----------|----------|------|");
    for (const { entry, size } of validCandidates) {
      const shortProject = entry.projectPath.replace(process.env.HOME || "", "~");
      const modified = new Date(entry.modified).toISOString().split("T")[0];
      console.log(
        `| ${entry.sessionId.slice(0, 8)}... | ${shortProject} | ${entry.messageCount} | ${modified} | ${formatBytes(size)} |`
      );
    }
    console.log();
    console.log(`Would compress ${formatBytes(totalOriginalSize)} of session data.`);
    if (options.deleteOriginals) {
      console.log("Would delete originals after successful archive.");
    }
    return;
  }

  // Actually archive
  ensureArchiveDirs();

  let archived = 0;
  let totalCompressedSize = 0;
  let errors = 0;

  for (const { entry } of validCandidates) {
    const result = archiveSession(entry, { deleteOriginal: options.deleteOriginals });

    if (result.success && result.manifestEntry) {
      markArchived(state, entry.sessionId);
      totalCompressedSize += result.manifestEntry.compressedSizeBytes;
      archived++;
      const ratio = (
        (1 - result.manifestEntry.compressedSizeBytes / result.manifestEntry.originalSizeBytes) *
        100
      ).toFixed(1);
      console.log(
        `  Archived ${entry.sessionId.slice(0, 8)}... (${formatBytes(result.manifestEntry.originalSizeBytes)} -> ${formatBytes(result.manifestEntry.compressedSizeBytes)}, ${ratio}% reduction)`
      );
    } else {
      errors++;
      console.error(`  Failed: ${entry.sessionId.slice(0, 8)}... - ${result.error}`);
    }
  }

  stampLastRun(state, "archive");
  saveState(state);

  console.log();
  console.log("## Archive Summary");
  console.log(`- Sessions archived: ${archived}`);
  console.log(`- Original size: ${formatBytes(totalOriginalSize)}`);
  console.log(`- Compressed size: ${formatBytes(totalCompressedSize)}`);
  if (totalOriginalSize > 0) {
    const overallRatio = ((1 - totalCompressedSize / totalOriginalSize) * 100).toFixed(1);
    console.log(`- Compression ratio: ${overallRatio}% reduction`);
  }
  if (errors > 0) {
    console.log(`- Errors: ${errors}`);
  }
  if (options.deleteOriginals) {
    console.log(`- Originals deleted: ${archived}`);
  }
}
