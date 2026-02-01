#!/usr/bin/env bun
/**
 * Capture Statistics Helper
 * Computes stats for pending/approved/rejected captures plus tier info
 *
 * Usage:
 *   bun capture-stats.ts              # Quick summary
 *   bun capture-stats.ts --week       # Last 7 days detailed
 *   bun capture-stats.ts --month      # Last 30 days detailed
 *   bun capture-stats.ts --tiers      # Include tier statistics
 *   bun capture-stats.ts --json       # Output as JSON
 *
 * Output: Markdown or JSON with capture statistics
 */

import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { join, basename } from "path";

const CAPTURES_DIR = join(process.env.HOME || "", "logs", "captures");
const PENDING_DIR = join(CAPTURES_DIR, "pending");
const APPROVED_DIR = join(CAPTURES_DIR, "approved");
const REJECTED_DIR = join(CAPTURES_DIR, "rejected");

const KNOWLEDGE_BASE = join(process.env.HOME || "", "dev", "whoabuddy", "claude-knowledge");
const ARCHIVE_DIR = join(KNOWLEDGE_BASE, "archive");
const ICEBOX_DIR = join(KNOWLEDGE_BASE, "icebox");
const ACCESS_LOG_PATH = join(KNOWLEDGE_BASE, ".access-log.json");

// Warm tier directories
const WARM_DIRS = ["nuggets", "patterns", "runbook", "decisions"];
const DECAY_THRESHOLD_DAYS = 90;

interface CaptureFile {
  filename: string;
  path: string;
  date: string;
  category: string;
  confidence: string;
  status: "pending" | "approved" | "rejected";
  mtime: Date;
}

interface TierStats {
  warm: number;
  cold: number;
  icebox: number;
  decayCandidates: number; // warm items approaching threshold
  promotionCandidates: number; // cold items accessed frequently
}

interface CaptureStats {
  pending: number;
  approved: number;
  rejected: number;
  total: number;
  approvalRate: number;
  byCategory: Record<string, { pending: number; approved: number; rejected: number }>;
  byConfidence: Record<string, number>;
  recentApproved: CaptureFile[];
  recentPending: CaptureFile[];
  weeklyTrend: { week: string; approved: number; rejected: number }[];
  tiers?: TierStats;
}

function parseCaptureFrontmatter(content: string): { category: string; confidence: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return { category: "unknown", confidence: "unknown" };

  const frontmatter = match[1];
  const categoryMatch = frontmatter.match(/category:\s*(\w+)/);
  const confidenceMatch = frontmatter.match(/confidence:\s*(\w+)/);

  return {
    category: categoryMatch?.[1] || "unknown",
    confidence: confidenceMatch?.[1] || "unknown",
  };
}

function readCapturesFromDir(dir: string, status: "pending" | "approved" | "rejected"): CaptureFile[] {
  if (!existsSync(dir)) return [];

  const files: CaptureFile[] = [];
  const entries = readdirSync(dir).filter((f) => f.endsWith(".md"));

  for (const filename of entries) {
    const path = join(dir, filename);
    const stat = statSync(path);
    const content = readFileSync(path, "utf-8");
    const { category, confidence } = parseCaptureFrontmatter(content);

    // Extract date from filename (YYYY-MM-DD-*.md)
    const dateMatch = filename.match(/^(\d{4}-\d{2}-\d{2})/);
    const date = dateMatch?.[1] || stat.mtime.toISOString().split("T")[0];

    files.push({
      filename,
      path,
      date,
      category,
      confidence,
      status,
      mtime: stat.mtime,
    });
  }

  return files;
}

function countFilesRecursive(dir: string): number {
  if (!existsSync(dir)) return 0;
  let count = 0;
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      count += countFilesRecursive(join(dir, entry.name));
    } else if (entry.name.endsWith(".md") && entry.name !== "README.md") {
      count++;
    }
  }
  return count;
}

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

function loadAccessLog(): AccessLog | null {
  if (!existsSync(ACCESS_LOG_PATH)) return null;
  try {
    return JSON.parse(readFileSync(ACCESS_LOG_PATH, "utf-8"));
  } catch {
    return null;
  }
}

function calculateTierStats(): TierStats {
  // Count warm tier items
  let warmCount = 0;
  for (const dir of WARM_DIRS) {
    warmCount += countFilesRecursive(join(KNOWLEDGE_BASE, dir));
  }

  // Count cold tier (archive)
  const coldCount = countFilesRecursive(ARCHIVE_DIR);

  // Count icebox
  const iceboxCount = countFilesRecursive(ICEBOX_DIR);

  // Check access log for decay/promotion candidates
  let decayCandidates = 0;
  let promotionCandidates = 0;

  const accessLog = loadAccessLog();
  if (accessLog) {
    const now = Date.now();
    const threshold = now - DECAY_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;

    for (const record of Object.values(accessLog.records)) {
      if (record.tier === "warm") {
        const lastAccess = new Date(record.lastAccessed).getTime();
        // Count items within 30 days of decay threshold
        const daysUntilDecay = (lastAccess + DECAY_THRESHOLD_DAYS * 24 * 60 * 60 * 1000 - now) / (24 * 60 * 60 * 1000);
        if (daysUntilDecay <= 30 && daysUntilDecay > 0) {
          decayCandidates++;
        }
      } else if (record.tier === "cold" && (record.coldAccessCount || 0) >= 3) {
        promotionCandidates++;
      }
    }
  }

  return {
    warm: warmCount,
    cold: coldCount,
    icebox: iceboxCount,
    decayCandidates,
    promotionCandidates,
  };
}

function calculateStats(days?: number, includeTiers?: boolean): CaptureStats {
  const pending = readCapturesFromDir(PENDING_DIR, "pending");
  const approved = readCapturesFromDir(APPROVED_DIR, "approved");
  const rejected = readCapturesFromDir(REJECTED_DIR, "rejected");

  const all = [...pending, ...approved, ...rejected];

  // Filter by date if days specified
  const cutoff = days ? new Date(Date.now() - days * 24 * 60 * 60 * 1000) : new Date(0);
  const filtered = days ? all.filter((c) => new Date(c.date) >= cutoff) : all;
  const filteredApproved = approved.filter((c) => new Date(c.date) >= cutoff);
  const filteredRejected = rejected.filter((c) => new Date(c.date) >= cutoff);

  // Category breakdown
  const byCategory: Record<string, { pending: number; approved: number; rejected: number }> = {};
  for (const capture of filtered) {
    if (!byCategory[capture.category]) {
      byCategory[capture.category] = { pending: 0, approved: 0, rejected: 0 };
    }
    byCategory[capture.category][capture.status]++;
  }

  // Confidence breakdown (approved only)
  const byConfidence: Record<string, number> = {};
  for (const capture of filteredApproved) {
    byConfidence[capture.confidence] = (byConfidence[capture.confidence] || 0) + 1;
  }

  // Recent approved (last 7 days)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recentApproved = approved
    .filter((c) => c.mtime >= sevenDaysAgo)
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime())
    .slice(0, 5);

  // Recent pending (oldest first for review priority)
  const recentPending = pending.sort((a, b) => a.mtime.getTime() - b.mtime.getTime()).slice(0, 5);

  // Weekly trend (last 4 weeks)
  const weeklyTrend: { week: string; approved: number; rejected: number }[] = [];
  for (let i = 0; i < 4; i++) {
    const weekStart = new Date(Date.now() - (i + 1) * 7 * 24 * 60 * 60 * 1000);
    const weekEnd = new Date(Date.now() - i * 7 * 24 * 60 * 60 * 1000);
    const weekLabel = weekStart.toISOString().split("T")[0];

    const weekApproved = approved.filter((c) => {
      const d = new Date(c.date);
      return d >= weekStart && d < weekEnd;
    }).length;

    const weekRejected = rejected.filter((c) => {
      const d = new Date(c.date);
      return d >= weekStart && d < weekEnd;
    }).length;

    weeklyTrend.push({ week: weekLabel, approved: weekApproved, rejected: weekRejected });
  }

  const reviewedCount = filteredApproved.length + filteredRejected.length;
  const approvalRate = reviewedCount > 0 ? (filteredApproved.length / reviewedCount) * 100 : 0;

  const stats: CaptureStats = {
    pending: pending.length,
    approved: days ? filteredApproved.length : approved.length,
    rejected: days ? filteredRejected.length : rejected.length,
    total: days ? filtered.length : all.length,
    approvalRate: Math.round(approvalRate),
    byCategory,
    byConfidence,
    recentApproved,
    recentPending,
    weeklyTrend: weeklyTrend.reverse(),
  };

  if (includeTiers) {
    stats.tiers = calculateTierStats();
  }

  return stats;
}

function formatMarkdown(stats: CaptureStats, detailed: boolean): string {
  const lines: string[] = [];

  // Summary
  lines.push("## Capture Statistics");
  lines.push("");
  lines.push(`| Status | Count |`);
  lines.push(`|--------|------:|`);
  lines.push(`| Pending | ${stats.pending} |`);
  lines.push(`| Approved | ${stats.approved} |`);
  lines.push(`| Rejected | ${stats.rejected} |`);
  lines.push(`| **Total** | **${stats.total}** |`);
  lines.push("");
  lines.push(`**Approval Rate:** ${stats.approvalRate}%`);

  // Tier stats (if included)
  if (stats.tiers) {
    lines.push("");
    lines.push("### Knowledge Tiers");
    lines.push("");
    lines.push("| Tier | Items |");
    lines.push("|------|------:|");
    lines.push(`| Warm (active) | ${stats.tiers.warm} |`);
    lines.push(`| Cold (archived) | ${stats.tiers.cold} |`);
    lines.push(`| Icebox (parked) | ${stats.tiers.icebox} |`);

    if (stats.tiers.decayCandidates > 0 || stats.tiers.promotionCandidates > 0) {
      lines.push("");
      lines.push("**Tier transitions:**");
      if (stats.tiers.decayCandidates > 0) {
        lines.push(`- ${stats.tiers.decayCandidates} warm items approaching decay (within 30 days)`);
      }
      if (stats.tiers.promotionCandidates > 0) {
        lines.push(`- ${stats.tiers.promotionCandidates} cold items ready for promotion`);
      }
    }
  }

  if (detailed) {
    // Category breakdown
    if (Object.keys(stats.byCategory).length > 0) {
      lines.push("");
      lines.push("### By Category");
      lines.push("");
      lines.push("| Category | Pending | Approved | Rejected |");
      lines.push("|----------|:-------:|:--------:|:--------:|");
      for (const [cat, counts] of Object.entries(stats.byCategory)) {
        lines.push(`| ${cat} | ${counts.pending} | ${counts.approved} | ${counts.rejected} |`);
      }
    }

    // Weekly trend
    if (stats.weeklyTrend.some((w) => w.approved > 0 || w.rejected > 0)) {
      lines.push("");
      lines.push("### Weekly Trend");
      lines.push("");
      lines.push("| Week | Approved | Rejected |");
      lines.push("|------|:--------:|:--------:|");
      for (const week of stats.weeklyTrend) {
        lines.push(`| ${week.week} | ${week.approved} | ${week.rejected} |`);
      }
    }
  }

  // Recent approved
  if (stats.recentApproved.length > 0) {
    lines.push("");
    lines.push("### Recently Approved");
    lines.push("");
    for (const capture of stats.recentApproved) {
      const title = basename(capture.filename, ".md").replace(/^\d{4}-\d{2}-\d{2}-/, "");
      lines.push(`- [${capture.category}] ${title} (${capture.date})`);
    }
  }

  // Pending items
  if (stats.recentPending.length > 0) {
    lines.push("");
    lines.push("### Pending Review");
    lines.push("");
    for (const capture of stats.recentPending) {
      const title = basename(capture.filename, ".md").replace(/^\d{4}-\d{2}-\d{2}-/, "");
      lines.push(`- [${capture.category}] ${title} (${capture.date})`);
    }
    if (stats.pending > stats.recentPending.length) {
      lines.push(`- ... and ${stats.pending - stats.recentPending.length} more`);
    }
  }

  return lines.join("\n");
}

// Main
const args = process.argv.slice(2);

if (args.includes("--help")) {
  console.log(`Usage:
  bun capture-stats.ts              Quick summary
  bun capture-stats.ts --week       Last 7 days detailed
  bun capture-stats.ts --month      Last 30 days detailed
  bun capture-stats.ts --tiers      Include tier statistics (warm/cold/icebox)
  bun capture-stats.ts --json       Output as JSON

Output: Markdown or JSON with capture statistics`);
  process.exit(0);
}

const detailed = args.includes("--week") || args.includes("--month");
const days = args.includes("--month") ? 30 : args.includes("--week") ? 7 : undefined;
const includeTiers = args.includes("--tiers");
const asJson = args.includes("--json");

const stats = calculateStats(days, includeTiers);

if (asJson) {
  console.log(JSON.stringify(stats, null, 2));
} else {
  console.log(formatMarkdown(stats, detailed));
}
