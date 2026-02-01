#!/usr/bin/env bun
/**
 * Access Tracker for Knowledge Base
 * Tracks when knowledge items are accessed to support decay/promotion
 *
 * Usage:
 *   bun access-tracker.ts record <path>         # Record an access
 *   bun access-tracker.ts query <path>          # Get access info for a file
 *   bun access-tracker.ts list                  # List all tracked items
 *   bun access-tracker.ts list --stale          # Items not accessed in 90+ days
 *   bun access-tracker.ts list --cold-active    # Cold items accessed 3+ times
 *   bun access-tracker.ts --json                # Output as JSON
 *
 * The access log is stored at ~/dev/whoabuddy/claude-knowledge/.access-log.json
 */

import { existsSync, readFileSync, writeFileSync } from "fs";
import { join, relative } from "path";

const KNOWLEDGE_BASE = join(process.env.HOME || "", "dev", "whoabuddy", "claude-knowledge");
const ACCESS_LOG_PATH = join(KNOWLEDGE_BASE, ".access-log.json");

// Default thresholds (in days)
const DECAY_THRESHOLD_DAYS = 90;
const PROMOTION_THRESHOLD_ACCESSES = 3;

interface AccessRecord {
  path: string; // Relative to knowledge base
  accessCount: number;
  firstAccessed: string; // ISO date
  lastAccessed: string; // ISO date
  tier: "warm" | "cold" | "icebox";
  coldAccessCount?: number; // Accesses while in cold storage
}

interface AccessLog {
  version: 1;
  updated: string;
  records: Record<string, AccessRecord>;
}

function loadAccessLog(): AccessLog {
  if (!existsSync(ACCESS_LOG_PATH)) {
    return {
      version: 1,
      updated: new Date().toISOString(),
      records: {},
    };
  }

  try {
    const content = readFileSync(ACCESS_LOG_PATH, "utf-8");
    return JSON.parse(content);
  } catch {
    return {
      version: 1,
      updated: new Date().toISOString(),
      records: {},
    };
  }
}

function saveAccessLog(log: AccessLog): void {
  log.updated = new Date().toISOString();
  writeFileSync(ACCESS_LOG_PATH, JSON.stringify(log, null, 2));
}

function normalizePath(inputPath: string): string {
  // Convert absolute path to relative path from knowledge base
  if (inputPath.startsWith(KNOWLEDGE_BASE)) {
    return relative(KNOWLEDGE_BASE, inputPath);
  }
  // Remove leading ./ if present
  if (inputPath.startsWith("./")) {
    return inputPath.slice(2);
  }
  return inputPath;
}

function determineTier(relativePath: string): "warm" | "cold" | "icebox" {
  if (relativePath.startsWith("archive/")) return "cold";
  if (relativePath.startsWith("icebox/")) return "icebox";
  return "warm";
}

function recordAccess(inputPath: string): AccessRecord {
  const log = loadAccessLog();
  const relativePath = normalizePath(inputPath);
  const now = new Date().toISOString();
  const tier = determineTier(relativePath);

  const existing = log.records[relativePath];

  if (existing) {
    existing.accessCount++;
    existing.lastAccessed = now;
    existing.tier = tier;

    // Track cold accesses separately for promotion logic
    if (tier === "cold") {
      existing.coldAccessCount = (existing.coldAccessCount || 0) + 1;
    }
  } else {
    log.records[relativePath] = {
      path: relativePath,
      accessCount: 1,
      firstAccessed: now,
      lastAccessed: now,
      tier,
      coldAccessCount: tier === "cold" ? 1 : undefined,
    };
  }

  saveAccessLog(log);
  return log.records[relativePath];
}

function queryAccess(inputPath: string): AccessRecord | null {
  const log = loadAccessLog();
  const relativePath = normalizePath(inputPath);
  return log.records[relativePath] || null;
}

function listRecords(filter?: "stale" | "cold-active"): AccessRecord[] {
  const log = loadAccessLog();
  let records = Object.values(log.records);

  if (filter === "stale") {
    const threshold = Date.now() - DECAY_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;
    records = records.filter((r) => {
      return r.tier === "warm" && new Date(r.lastAccessed).getTime() < threshold;
    });
  } else if (filter === "cold-active") {
    records = records.filter((r) => {
      return r.tier === "cold" && (r.coldAccessCount || 0) >= PROMOTION_THRESHOLD_ACCESSES;
    });
  }

  // Sort by last accessed (oldest first for stale, newest first otherwise)
  return records.sort((a, b) => {
    const aTime = new Date(a.lastAccessed).getTime();
    const bTime = new Date(b.lastAccessed).getTime();
    return filter === "stale" ? aTime - bTime : bTime - aTime;
  });
}

function updateTier(inputPath: string, newTier: "warm" | "cold" | "icebox"): void {
  const log = loadAccessLog();
  const relativePath = normalizePath(inputPath);

  if (log.records[relativePath]) {
    const record = log.records[relativePath];
    const oldTier = record.tier;
    record.tier = newTier;

    // Reset cold access count when promoted back to warm
    if (oldTier === "cold" && newTier === "warm") {
      record.coldAccessCount = 0;
    }

    saveAccessLog(log);
  }
}

function formatMarkdown(records: AccessRecord[], title: string): string {
  if (records.length === 0) {
    return `## ${title}\n\nNo items found.`;
  }

  const lines: string[] = [];
  lines.push(`## ${title}`);
  lines.push("");
  lines.push(`Found ${records.length} items:`);
  lines.push("");
  lines.push("| Path | Tier | Access Count | Last Accessed |");
  lines.push("|------|------|--------------|---------------|");

  for (const r of records.slice(0, 20)) {
    const lastAccessed = new Date(r.lastAccessed).toISOString().split("T")[0];
    lines.push(`| ${r.path} | ${r.tier} | ${r.accessCount} | ${lastAccessed} |`);
  }

  if (records.length > 20) {
    lines.push(`| ... | | | |`);
    lines.push(`| (${records.length - 20} more) | | | |`);
  }

  return lines.join("\n");
}

// Main
const args = process.argv.slice(2);

if (args.includes("--help") || args.length === 0) {
  console.log(`Usage:
  bun access-tracker.ts record <path>         Record an access
  bun access-tracker.ts query <path>          Get access info for a file
  bun access-tracker.ts list                  List all tracked items
  bun access-tracker.ts list --stale          Items not accessed in ${DECAY_THRESHOLD_DAYS}+ days
  bun access-tracker.ts list --cold-active    Cold items accessed ${PROMOTION_THRESHOLD_ACCESSES}+ times
  bun access-tracker.ts update-tier <path> <tier>  Update tier for a path
  bun access-tracker.ts --json                Output as JSON

Access log: ${ACCESS_LOG_PATH}`);
  process.exit(0);
}

const asJson = args.includes("--json");
const command = args[0];

switch (command) {
  case "record": {
    const path = args[1];
    if (!path) {
      console.error("Error: path required");
      process.exit(1);
    }
    const record = recordAccess(path);
    if (asJson) {
      console.log(JSON.stringify(record, null, 2));
    } else {
      console.log(`Recorded access: ${record.path}`);
      console.log(`  Tier: ${record.tier}`);
      console.log(`  Access count: ${record.accessCount}`);
      console.log(`  Last accessed: ${record.lastAccessed}`);
    }
    break;
  }

  case "query": {
    const path = args[1];
    if (!path) {
      console.error("Error: path required");
      process.exit(1);
    }
    const record = queryAccess(path);
    if (asJson) {
      console.log(JSON.stringify(record, null, 2));
    } else if (record) {
      console.log(`Access info for: ${record.path}`);
      console.log(`  Tier: ${record.tier}`);
      console.log(`  Access count: ${record.accessCount}`);
      console.log(`  First accessed: ${record.firstAccessed}`);
      console.log(`  Last accessed: ${record.lastAccessed}`);
      if (record.coldAccessCount !== undefined) {
        console.log(`  Cold access count: ${record.coldAccessCount}`);
      }
    } else {
      console.log("No access record found for this path.");
    }
    break;
  }

  case "list": {
    const stale = args.includes("--stale");
    const coldActive = args.includes("--cold-active");
    const filter = stale ? "stale" : coldActive ? "cold-active" : undefined;

    const records = listRecords(filter);
    const title = stale
      ? `Stale Items (${DECAY_THRESHOLD_DAYS}+ days since access)`
      : coldActive
        ? `Cold Items Ready for Promotion (${PROMOTION_THRESHOLD_ACCESSES}+ accesses)`
        : "All Tracked Items";

    if (asJson) {
      console.log(JSON.stringify(records, null, 2));
    } else {
      console.log(formatMarkdown(records, title));
    }
    break;
  }

  case "update-tier": {
    const path = args[1];
    const tier = args[2] as "warm" | "cold" | "icebox";
    if (!path || !tier) {
      console.error("Error: path and tier required");
      process.exit(1);
    }
    if (!["warm", "cold", "icebox"].includes(tier)) {
      console.error("Error: tier must be warm, cold, or icebox");
      process.exit(1);
    }
    updateTier(path, tier);
    console.log(`Updated tier for ${path} to ${tier}`);
    break;
  }

  default:
    console.error(`Unknown command: ${command}`);
    process.exit(1);
}
