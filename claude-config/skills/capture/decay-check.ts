#!/usr/bin/env bun
/**
 * Decay Check for Knowledge Base
 * Identifies stale warm-tier items and moves them to cold storage (archive/)
 *
 * Usage:
 *   bun decay-check.ts                    # Check and report decay candidates
 *   bun decay-check.ts --dry-run          # Show what would be moved
 *   bun decay-check.ts --execute          # Actually move files to archive
 *   bun decay-check.ts --days 60          # Custom threshold (default: 90)
 *   bun decay-check.ts --promote          # Check and promote cold items
 *   bun decay-check.ts --json             # Output as JSON
 *
 * Decay: Warm tier items not accessed in N days move to archive/
 * Promotion: Cold items accessed 3+ times move back to warm tier
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync, readdirSync, statSync } from "fs";
import { join, dirname, basename, relative } from "path";

const KNOWLEDGE_BASE = join(process.env.HOME || "", "dev", "whoabuddy", "claude-knowledge");
const ACCESS_LOG_PATH = join(KNOWLEDGE_BASE, ".access-log.json");
const ARCHIVE_DIR = join(KNOWLEDGE_BASE, "archive");

// Warm tier directories
const WARM_DIRS = ["nuggets", "patterns", "runbook", "decisions"];

// Default thresholds
const DEFAULT_DECAY_DAYS = 90;
const PROMOTION_THRESHOLD = 3;

interface AccessRecord {
  path: string;
  accessCount: number;
  firstAccessed: string;
  lastAccessed: string;
  tier: "warm" | "cold" | "icebox";
  coldAccessCount?: number;
}

interface AccessLog {
  version: 1;
  updated: string;
  records: Record<string, AccessRecord>;
}

interface DecayCandidate {
  path: string;
  fullPath: string;
  category: string;
  lastAccessed: string;
  daysSinceAccess: number;
  accessCount: number;
}

interface PromotionCandidate {
  path: string;
  fullPath: string;
  originalCategory: string;
  coldAccessCount: number;
  lastAccessed: string;
}

function loadAccessLog(): AccessLog {
  if (!existsSync(ACCESS_LOG_PATH)) {
    return { version: 1, updated: new Date().toISOString(), records: {} };
  }
  try {
    return JSON.parse(readFileSync(ACCESS_LOG_PATH, "utf-8"));
  } catch {
    return { version: 1, updated: new Date().toISOString(), records: {} };
  }
}

function saveAccessLog(log: AccessLog): void {
  log.updated = new Date().toISOString();
  writeFileSync(ACCESS_LOG_PATH, JSON.stringify(log, null, 2));
}

function getAllWarmFiles(): { path: string; fullPath: string; category: string }[] {
  const files: { path: string; fullPath: string; category: string }[] = [];

  for (const category of WARM_DIRS) {
    const categoryDir = join(KNOWLEDGE_BASE, category);
    if (!existsSync(categoryDir)) continue;

    const entries = readdirSync(categoryDir, { recursive: true });
    for (const entry of entries) {
      const entryStr = String(entry);
      if (!entryStr.endsWith(".md")) continue;

      const fullPath = join(categoryDir, entryStr);
      if (!statSync(fullPath).isFile()) continue;

      files.push({
        path: join(category, entryStr),
        fullPath,
        category,
      });
    }
  }

  return files;
}

function getDecayCandidates(thresholdDays: number): DecayCandidate[] {
  const log = loadAccessLog();
  const warmFiles = getAllWarmFiles();
  const now = Date.now();
  const threshold = now - thresholdDays * 24 * 60 * 60 * 1000;
  const candidates: DecayCandidate[] = [];

  for (const file of warmFiles) {
    const record = log.records[file.path];

    // If no record, use file mtime as last access
    let lastAccessed: Date;
    let accessCount: number;

    if (record) {
      lastAccessed = new Date(record.lastAccessed);
      accessCount = record.accessCount;
    } else {
      const stat = statSync(file.fullPath);
      lastAccessed = stat.mtime;
      accessCount = 0;
    }

    if (lastAccessed.getTime() < threshold) {
      const daysSinceAccess = Math.floor((now - lastAccessed.getTime()) / (24 * 60 * 60 * 1000));
      candidates.push({
        path: file.path,
        fullPath: file.fullPath,
        category: file.category,
        lastAccessed: lastAccessed.toISOString().split("T")[0],
        daysSinceAccess,
        accessCount,
      });
    }
  }

  // Sort by days since access (oldest first)
  return candidates.sort((a, b) => b.daysSinceAccess - a.daysSinceAccess);
}

function getPromotionCandidates(): PromotionCandidate[] {
  const log = loadAccessLog();
  const candidates: PromotionCandidate[] = [];

  for (const [path, record] of Object.entries(log.records)) {
    if (record.tier === "cold" && (record.coldAccessCount || 0) >= PROMOTION_THRESHOLD) {
      // Extract original category from archive path
      // archive/nuggets/foo.md -> nuggets
      const match = path.match(/^archive\/(\w+)\//);
      const originalCategory = match ? match[1] : "unknown";

      candidates.push({
        path,
        fullPath: join(KNOWLEDGE_BASE, path),
        originalCategory,
        coldAccessCount: record.coldAccessCount || 0,
        lastAccessed: record.lastAccessed,
      });
    }
  }

  return candidates.sort((a, b) => b.coldAccessCount - a.coldAccessCount);
}

function archiveFile(candidate: DecayCandidate, reason: string = "decay"): void {
  const archivePath = join(ARCHIVE_DIR, candidate.path);
  const archiveDir = dirname(archivePath);

  // Ensure archive subdirectory exists
  if (!existsSync(archiveDir)) {
    mkdirSync(archiveDir, { recursive: true });
  }

  // Read original file
  const content = readFileSync(candidate.fullPath, "utf-8");

  // Add archive metadata to frontmatter
  const now = new Date().toISOString().split("T")[0];
  let newContent: string;

  if (content.startsWith("---")) {
    // Has existing frontmatter
    const endIndex = content.indexOf("---", 3);
    if (endIndex > 0) {
      const frontmatter = content.slice(4, endIndex);
      const rest = content.slice(endIndex);
      newContent = `---
${frontmatter.trim()}
archived: true
archived_date: ${now}
archived_reason: "${reason}"
original_path: "${candidate.path}"
access_count: ${candidate.accessCount}
last_accessed: ${candidate.lastAccessed}
${rest}`;
    } else {
      newContent = content;
    }
  } else {
    // No frontmatter, add it
    newContent = `---
archived: true
archived_date: ${now}
archived_reason: "${reason}"
original_path: "${candidate.path}"
access_count: ${candidate.accessCount}
last_accessed: ${candidate.lastAccessed}
---

${content}`;
  }

  // Write to archive
  writeFileSync(archivePath, newContent);

  // Remove from warm tier
  unlinkSync(candidate.fullPath);

  // Update access log
  const log = loadAccessLog();
  const archiveRelPath = relative(KNOWLEDGE_BASE, archivePath);

  // Move record to new path
  if (log.records[candidate.path]) {
    log.records[archiveRelPath] = {
      ...log.records[candidate.path],
      path: archiveRelPath,
      tier: "cold",
      coldAccessCount: 0,
    };
    delete log.records[candidate.path];
  } else {
    log.records[archiveRelPath] = {
      path: archiveRelPath,
      accessCount: candidate.accessCount,
      firstAccessed: candidate.lastAccessed,
      lastAccessed: candidate.lastAccessed,
      tier: "cold",
      coldAccessCount: 0,
    };
  }

  saveAccessLog(log);
}

function promoteFile(candidate: PromotionCandidate): void {
  const warmPath = join(KNOWLEDGE_BASE, candidate.originalCategory, basename(candidate.path));

  // Read archived file
  const content = readFileSync(candidate.fullPath, "utf-8");

  // Update frontmatter for promotion
  const now = new Date().toISOString().split("T")[0];
  let newContent: string;

  if (content.startsWith("---")) {
    const endIndex = content.indexOf("---", 3);
    if (endIndex > 0) {
      let frontmatter = content.slice(4, endIndex);
      const rest = content.slice(endIndex);

      // Remove archive metadata, add promotion metadata
      frontmatter = frontmatter
        .replace(/archived:.*\n/g, "")
        .replace(/archived_date:.*\n/g, "")
        .replace(/archived_reason:.*\n/g, "")
        .replace(/original_path:.*\n/g, "")
        .replace(/access_count:.*\n/g, "")
        .replace(/last_accessed:.*\n/g, "");

      newContent = `---
${frontmatter.trim()}
promoted_from_archive: true
promoted_date: ${now}
cold_access_count: ${candidate.coldAccessCount}
${rest}`;
    } else {
      newContent = content;
    }
  } else {
    newContent = content;
  }

  // Write to warm tier
  writeFileSync(warmPath, newContent);

  // Remove from archive
  unlinkSync(candidate.fullPath);

  // Update access log
  const log = loadAccessLog();
  const warmRelPath = join(candidate.originalCategory, basename(candidate.path));

  if (log.records[candidate.path]) {
    log.records[warmRelPath] = {
      ...log.records[candidate.path],
      path: warmRelPath,
      tier: "warm",
      coldAccessCount: undefined,
    };
    delete log.records[candidate.path];
  }

  saveAccessLog(log);
}

function formatDecayReport(candidates: DecayCandidate[], dryRun: boolean): string {
  if (candidates.length === 0) {
    return "## Decay Check\n\nNo decay candidates found. All warm-tier items are recently accessed.";
  }

  const lines: string[] = [];
  lines.push("## Decay Candidates");
  lines.push("");
  lines.push(`Found ${candidates.length} items not accessed in 90+ days:`);
  lines.push("");
  lines.push("| File | Category | Days Since Access | Access Count |");
  lines.push("|------|----------|-------------------|--------------|");

  for (const c of candidates) {
    lines.push(`| ${basename(c.path)} | ${c.category} | ${c.daysSinceAccess} | ${c.accessCount} |`);
  }

  if (dryRun) {
    lines.push("");
    lines.push("*Dry run - no files moved. Use --execute to archive.*");
  }

  return lines.join("\n");
}

function formatPromotionReport(candidates: PromotionCandidate[], dryRun: boolean): string {
  if (candidates.length === 0) {
    return "## Promotion Check\n\nNo promotion candidates found. No cold items have been accessed frequently.";
  }

  const lines: string[] = [];
  lines.push("## Promotion Candidates");
  lines.push("");
  lines.push(`Found ${candidates.length} cold items accessed ${PROMOTION_THRESHOLD}+ times:`);
  lines.push("");
  lines.push("| File | Original Category | Cold Accesses |");
  lines.push("|------|-------------------|---------------|");

  for (const c of candidates) {
    lines.push(`| ${basename(c.path)} | ${c.originalCategory} | ${c.coldAccessCount} |`);
  }

  if (dryRun) {
    lines.push("");
    lines.push("*Dry run - no files moved. Use --execute to promote.*");
  }

  return lines.join("\n");
}

// Main
const args = process.argv.slice(2);

if (args.includes("--help")) {
  console.log(`Usage:
  bun decay-check.ts                    Check and report decay candidates
  bun decay-check.ts --dry-run          Show what would be moved (default)
  bun decay-check.ts --execute          Actually move files to archive
  bun decay-check.ts --days 60          Custom threshold (default: ${DEFAULT_DECAY_DAYS})
  bun decay-check.ts --promote          Check and promote cold items
  bun decay-check.ts --json             Output as JSON

Decay: Warm tier items not accessed in N days move to archive/
Promotion: Cold items accessed ${PROMOTION_THRESHOLD}+ times move back to warm tier`);
  process.exit(0);
}

const dryRun = !args.includes("--execute");
const promote = args.includes("--promote");
const asJson = args.includes("--json");

// Parse custom days threshold
const daysIndex = args.indexOf("--days");
const thresholdDays = daysIndex >= 0 && args[daysIndex + 1] ? parseInt(args[daysIndex + 1], 10) : DEFAULT_DECAY_DAYS;

if (promote) {
  // Promotion mode
  const candidates = getPromotionCandidates();

  if (!dryRun && candidates.length > 0) {
    for (const candidate of candidates) {
      promoteFile(candidate);
      console.log(`Promoted: ${candidate.path} -> ${candidate.originalCategory}/`);
    }
    console.log(`\nPromoted ${candidates.length} items to warm tier.`);
  } else if (asJson) {
    console.log(JSON.stringify({ mode: "promotion", candidates, dryRun }, null, 2));
  } else {
    console.log(formatPromotionReport(candidates, dryRun));
  }
} else {
  // Decay mode
  const candidates = getDecayCandidates(thresholdDays);

  if (!dryRun && candidates.length > 0) {
    for (const candidate of candidates) {
      archiveFile(candidate, "decay");
      console.log(`Archived: ${candidate.path} -> archive/${candidate.category}/`);
    }
    console.log(`\nArchived ${candidates.length} items to cold storage.`);
  } else if (asJson) {
    console.log(JSON.stringify({ mode: "decay", thresholdDays, candidates, dryRun }, null, 2));
  } else {
    console.log(formatDecayReport(candidates, dryRun));
  }
}
