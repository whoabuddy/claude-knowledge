import { join } from "path";
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, unlinkSync } from "fs";
import type { ArchiveManifestEntry, SessionEntry } from "../types";

const HOME = process.env.HOME || "/home/whoabuddy";
const ARCHIVE_BASE = join(HOME, "logs", "archive", "claude");

export const ARCHIVE_DIRS = {
  sessions: join(ARCHIVE_BASE, "sessions"),
  debug: join(ARCHIVE_BASE, "debug"),
  fileHistory: join(ARCHIVE_BASE, "file-history"),
  extractions: join(ARCHIVE_BASE, "extractions"),
  manifest: join(ARCHIVE_BASE, "manifest.jsonl"),
} as const;

/** Ensure all archive directories exist */
export function ensureArchiveDirs(): void {
  for (const [key, path] of Object.entries(ARCHIVE_DIRS)) {
    if (key === "manifest") continue; // Not a directory
    mkdirSync(path, { recursive: true });
  }
}

/** Get the month-bucketed directory for a date */
export function getMonthBucket(dateStr: string): string {
  const date = new Date(dateStr);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

/** Compress a file using Bun's gzip */
export function gzipFile(inputPath: string): { data: Uint8Array; originalSize: number; compressedSize: number } {
  const content = readFileSync(inputPath);
  const compressed = Bun.gzipSync(new Uint8Array(content));
  return {
    data: compressed,
    originalSize: content.byteLength,
    compressedSize: compressed.byteLength,
  };
}

/** Verify gzip integrity with roundtrip */
export function verifyGzip(compressed: Uint8Array, originalContent: Buffer): boolean {
  try {
    const decompressed = Bun.gunzipSync(compressed);
    if (decompressed.byteLength !== originalContent.byteLength) return false;
    // Compare first and last 1KB as sanity check
    const checkSize = Math.min(1024, decompressed.byteLength);
    for (let i = 0; i < checkSize; i++) {
      if (decompressed[i] !== originalContent[i]) return false;
    }
    const tailStart = Math.max(0, decompressed.byteLength - checkSize);
    for (let i = tailStart; i < decompressed.byteLength; i++) {
      if (decompressed[i] !== originalContent[i]) return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** Archive a single session JSONL file */
export function archiveSession(
  entry: SessionEntry,
  options: { deleteOriginal: boolean }
): { success: boolean; manifestEntry?: ArchiveManifestEntry; error?: string } {
  const sourcePath = entry.fullPath;
  if (!existsSync(sourcePath)) {
    return { success: false, error: `Source file not found: ${sourcePath}` };
  }

  const monthBucket = getMonthBucket(entry.modified);
  const destDir = join(ARCHIVE_DIRS.sessions, monthBucket);
  mkdirSync(destDir, { recursive: true });

  const destPath = join(destDir, `${entry.sessionId}.jsonl.gz`);

  // Don't re-archive
  if (existsSync(destPath)) {
    return { success: false, error: `Archive already exists: ${destPath}` };
  }

  try {
    const originalContent = readFileSync(sourcePath);
    const { data: compressed, originalSize, compressedSize } = gzipFile(sourcePath);

    // Verify integrity
    if (!verifyGzip(compressed, originalContent)) {
      return { success: false, error: "Gzip verification failed" };
    }

    // Write compressed file
    writeFileSync(destPath, compressed);

    const manifestEntry: ArchiveManifestEntry = {
      sessionId: entry.sessionId,
      projectPath: entry.projectPath,
      originalPath: sourcePath,
      archivePath: destPath,
      originalSizeBytes: originalSize,
      compressedSizeBytes: compressedSize,
      summary: entry.summary,
      messageCount: entry.messageCount,
      created: entry.created,
      modified: entry.modified,
      archivedAt: new Date().toISOString(),
    };

    // Append to manifest
    appendFileSync(ARCHIVE_DIRS.manifest, JSON.stringify(manifestEntry) + "\n");

    // Optionally delete original
    if (options.deleteOriginal) {
      unlinkSync(sourcePath);
    }

    return { success: true, manifestEntry };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/** Read the archive manifest */
export function readManifest(): ArchiveManifestEntry[] {
  if (!existsSync(ARCHIVE_DIRS.manifest)) return [];

  const entries: ArchiveManifestEntry[] = [];
  const content = readFileSync(ARCHIVE_DIRS.manifest, "utf-8");

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      entries.push(JSON.parse(trimmed));
    } catch {
      // Skip malformed lines
    }
  }

  return entries;
}
