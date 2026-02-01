#!/usr/bin/env bun
/**
 * Capture Candidates Generator
 * Auto-generates capture candidates from git diffs and session patterns
 *
 * Usage:
 *   bun capture-candidates.ts              # Today's activity
 *   bun capture-candidates.ts 2026-02-01   # Specific date
 *   bun capture-candidates.ts --week       # Last 7 days
 *   bun capture-candidates.ts --json       # Output as JSON
 *
 * Output: JSON or markdown with candidate captures for review
 */

import { execSync } from "child_process";
import { existsSync, readdirSync, statSync } from "fs";
import { join, basename } from "path";

const DEV_DIR = join(process.env.HOME || "", "dev");

interface Commit {
  hash: string;
  message: string;
  date: string;
  files: string[];
  repo: string;
}

interface CaptureCandidate {
  title: string;
  category: "nugget" | "pattern" | "runbook" | "decision";
  confidence: "high" | "medium" | "low";
  source: "git-diff" | "pattern-match" | "commit-message";
  repos: string[];
  commits: string[];
  reason: string;
}

function execGit(repoPath: string, command: string): string {
  try {
    return execSync(`git -C "${repoPath}" ${command}`, {
      encoding: "utf-8",
      timeout: 10000,
    }).trim();
  } catch {
    return "";
  }
}

function getRepos(): string[] {
  const repos: string[] = [];
  if (!existsSync(DEV_DIR)) return repos;

  // Find all org/repo directories with .git
  for (const org of readdirSync(DEV_DIR)) {
    const orgPath = join(DEV_DIR, org);
    if (!statSync(orgPath).isDirectory()) continue;

    for (const repo of readdirSync(orgPath)) {
      const repoPath = join(orgPath, repo);
      if (existsSync(join(repoPath, ".git"))) {
        repos.push(`${org}/${repo}`);
      }
    }
  }

  return repos;
}

function getCommitsForDate(repoPath: string, repoName: string, dateStr: string): Commit[] {
  const authorEmail = execGit(repoPath, "config user.email");
  if (!authorEmail) return [];

  const logOutput = execGit(
    repoPath,
    `log --oneline --author="${authorEmail}" --since="${dateStr} 00:00:00" --until="${dateStr} 23:59:59" --format="%H|%s|%ai"`
  );

  if (!logOutput) return [];

  const commits: Commit[] = [];
  for (const line of logOutput.split("\n")) {
    const [hash, message, date] = line.split("|");
    if (!hash || !message) continue;

    // Get files changed in this commit
    const filesOutput = execGit(repoPath, `show --name-only --format="" ${hash}`);
    const files = filesOutput.split("\n").filter(Boolean);

    commits.push({
      hash: hash.slice(0, 7),
      message,
      date: date.split(" ")[0],
      files,
      repo: repoName,
    });
  }

  return commits;
}

function analyzeCommits(commits: Commit[]): CaptureCandidate[] {
  const candidates: CaptureCandidate[] = [];

  // Group commits by repo
  const byRepo = new Map<string, Commit[]>();
  for (const commit of commits) {
    const existing = byRepo.get(commit.repo) || [];
    existing.push(commit);
    byRepo.set(commit.repo, existing);
  }

  // Pattern 1: Fix commits (high confidence nuggets)
  for (const commit of commits) {
    if (commit.message.match(/^fix[(:!]/i)) {
      const title = extractKnowledgeTitle(commit.message, "fix");
      if (title) {
        candidates.push({
          title,
          category: "nugget",
          confidence: "high",
          source: "commit-message",
          repos: [commit.repo],
          commits: [commit.hash],
          reason: `Fix commit often captures a gotcha or bug pattern: "${commit.message}"`,
        });
      }
    }
  }

  // Pattern 2: Debugging sessions (same file edited 3+ times)
  for (const [repo, repoCommits] of byRepo) {
    const fileEdits = new Map<string, number>();
    for (const commit of repoCommits) {
      for (const file of commit.files) {
        fileEdits.set(file, (fileEdits.get(file) || 0) + 1);
      }
    }

    for (const [file, count] of fileEdits) {
      if (count >= 3) {
        candidates.push({
          title: `Debugging: ${basename(file)} iteration`,
          category: "nugget",
          confidence: "medium",
          source: "pattern-match",
          repos: [repo],
          commits: repoCommits.filter((c) => c.files.includes(file)).map((c) => c.hash),
          reason: `File ${file} edited ${count} times - likely debugging session with learnings`,
        });
      }
    }
  }

  // Pattern 3: Clarity contracts (domain-specific)
  for (const commit of commits) {
    const clarityFiles = commit.files.filter((f) => f.endsWith(".clar"));
    if (clarityFiles.length > 0) {
      candidates.push({
        title: `Clarity: ${extractClarityTopic(commit.message)}`,
        category: "nugget",
        confidence: "medium",
        source: "git-diff",
        repos: [commit.repo],
        commits: [commit.hash],
        reason: `Clarity contract changes in: ${clarityFiles.join(", ")}`,
      });
    }
  }

  // Pattern 4: Config/setup changes (runbook candidates)
  for (const commit of commits) {
    const configFiles = commit.files.filter(
      (f) =>
        f.includes("wrangler") ||
        f.includes(".env") ||
        f.includes("Dockerfile") ||
        f.includes("package.json") ||
        f.includes("tsconfig")
    );
    if (configFiles.length > 0 && commit.message.match(/^(chore|feat|fix)[(:!]/i)) {
      candidates.push({
        title: `Setup: ${extractSetupTopic(commit.message)}`,
        category: "runbook",
        confidence: "low",
        source: "git-diff",
        repos: [commit.repo],
        commits: [commit.hash],
        reason: `Configuration changes may document a setup procedure: ${configFiles.join(", ")}`,
      });
    }
  }

  // Pattern 5: New patterns directory files
  for (const commit of commits) {
    const patternFiles = commit.files.filter(
      (f) => f.includes("/patterns/") || f.includes("/utils/") || f.includes("/helpers/")
    );
    if (patternFiles.length > 0 && commit.message.match(/^(feat|add)[(:!]/i)) {
      candidates.push({
        title: `Pattern: ${extractPatternTopic(commit.message)}`,
        category: "pattern",
        confidence: "medium",
        source: "git-diff",
        repos: [commit.repo],
        commits: [commit.hash],
        reason: `New utility or pattern file: ${patternFiles.join(", ")}`,
      });
    }
  }

  // Deduplicate by title
  const seen = new Set<string>();
  return candidates.filter((c) => {
    const key = c.title.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractKnowledgeTitle(message: string, prefix: string): string {
  // Remove conventional commit prefix
  const cleaned = message.replace(/^(fix|feat|chore|docs|refactor|test)\(?[^)]*\)?[!:]?\s*/i, "");
  // Capitalize first letter
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function extractClarityTopic(message: string): string {
  const cleaned = message.replace(/^(fix|feat|chore|docs|refactor|test)\(?[^)]*\)?[!:]?\s*/i, "");
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function extractSetupTopic(message: string): string {
  const cleaned = message.replace(/^(fix|feat|chore|docs|refactor|test)\(?[^)]*\)?[!:]?\s*/i, "");
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function extractPatternTopic(message: string): string {
  const cleaned = message.replace(/^(fix|feat|add|chore|docs|refactor|test)\(?[^)]*\)?[!:]?\s*/i, "");
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function formatMarkdown(candidates: CaptureCandidate[], dateRange: string): string {
  if (candidates.length === 0) {
    return `## Capture Candidates for ${dateRange}\n\nNo capture candidates found. Either no git activity or nothing matched capture patterns.`;
  }

  const lines: string[] = [];
  lines.push(`## Capture Candidates for ${dateRange}`);
  lines.push("");
  lines.push(`Found ${candidates.length} potential captures:`);
  lines.push("");

  // Group by confidence
  const high = candidates.filter((c) => c.confidence === "high");
  const medium = candidates.filter((c) => c.confidence === "medium");
  const low = candidates.filter((c) => c.confidence === "low");

  if (high.length > 0) {
    lines.push("### High Confidence");
    lines.push("");
    for (const c of high) {
      lines.push(`- **[${c.category}]** ${c.title}`);
      lines.push(`  - Repos: ${c.repos.join(", ")}`);
      lines.push(`  - Reason: ${c.reason}`);
      lines.push("");
    }
  }

  if (medium.length > 0) {
    lines.push("### Medium Confidence");
    lines.push("");
    for (const c of medium) {
      lines.push(`- **[${c.category}]** ${c.title}`);
      lines.push(`  - Repos: ${c.repos.join(", ")}`);
      lines.push(`  - Reason: ${c.reason}`);
      lines.push("");
    }
  }

  if (low.length > 0) {
    lines.push("### Low Confidence");
    lines.push("");
    for (const c of low) {
      lines.push(`- **[${c.category}]** ${c.title}`);
      lines.push(`  - Repos: ${c.repos.join(", ")}`);
      lines.push(`  - Reason: ${c.reason}`);
      lines.push("");
    }
  }

  return lines.join("\n");
}

// Main
const args = process.argv.slice(2);

if (args.includes("--help")) {
  console.log(`Usage:
  bun capture-candidates.ts              Today's activity
  bun capture-candidates.ts 2026-02-01   Specific date
  bun capture-candidates.ts --week       Last 7 days
  bun capture-candidates.ts --json       Output as JSON

Output: JSON or markdown with candidate captures`);
  process.exit(0);
}

const asJson = args.includes("--json");
const isWeek = args.includes("--week");
const dateArg = args.find((a) => a.match(/^\d{4}-\d{2}-\d{2}$/));

const repos = getRepos();
let allCommits: Commit[] = [];
let dateRange: string;

if (isWeek) {
  dateRange = "last 7 days";
  for (let i = 0; i < 7; i++) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const dateStr = d.toISOString().split("T")[0];
    for (const repo of repos) {
      const repoPath = join(DEV_DIR, repo);
      allCommits.push(...getCommitsForDate(repoPath, repo, dateStr));
    }
  }
} else {
  const dateStr = dateArg || new Date().toISOString().split("T")[0];
  dateRange = dateStr;
  for (const repo of repos) {
    const repoPath = join(DEV_DIR, repo);
    allCommits.push(...getCommitsForDate(repoPath, repo, dateStr));
  }
}

const candidates = analyzeCommits(allCommits);

if (asJson) {
  console.log(
    JSON.stringify(
      {
        dateRange,
        commitCount: allCommits.length,
        candidateCount: candidates.length,
        candidates,
      },
      null,
      2
    )
  );
} else {
  console.log(formatMarkdown(candidates, dateRange));
}
