import { join } from "path";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { scanProjects } from "../lib/scanner";
import {
  scoreSession,
  extractSessionText,
  extractKeyExchanges,
} from "../lib/session-parser";
import { loadState, saveState, markScored, isScored, stampLastRun } from "../lib/state";
import { ensureArchiveDirs, ARCHIVE_DIRS } from "../lib/archiver";
import type { SessionEntry, SessionScore } from "../types";

const HOME = process.env.HOME || "/home/whoabuddy";

interface ExtractOptions {
  days: number;
  limit: number;
  project?: string;
  threshold: number;
}

export async function runExtract(options: ExtractOptions): Promise<void> {
  const state = loadState();
  const projects = scanProjects();

  const cutoffMs = options.days * 24 * 60 * 60 * 1000;
  const now = Date.now();

  // Collect candidate sessions
  const candidates: SessionEntry[] = [];
  for (const project of projects) {
    // Filter by project path if specified
    if (options.project) {
      const normalizedProject = options.project.replace(/^~/, HOME);
      if (!project.projectPath.includes(normalizedProject)) continue;
    }

    for (const session of project.sessions) {
      const ageMs = now - new Date(session.modified).getTime();
      if (ageMs <= cutoffMs && !isScored(state, session.sessionId)) {
        candidates.push(session);
      }
    }
  }

  if (candidates.length === 0) {
    console.log(
      `No unscored sessions found within the last ${options.days} days.`
    );
    return;
  }

  console.log(`Scoring ${candidates.length} sessions...`);

  // Score all candidates
  const scores: SessionScore[] = [];
  for (const entry of candidates) {
    // Read session text for deeper analysis
    let sessionText: string | undefined;
    if (existsSync(entry.fullPath)) {
      sessionText = extractSessionText(entry.fullPath);
    }

    const score = scoreSession(entry, sessionText);
    scores.push(score);
    markScored(state, entry.sessionId);
  }

  // Sort by score descending and apply threshold + limit
  const filtered = scores
    .filter((s) => s.score >= options.threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, options.limit);

  if (filtered.length === 0) {
    console.log(
      `No sessions scored above threshold (${options.threshold}). Highest score: ${Math.max(...scores.map((s) => s.score))}`
    );
    stampLastRun(state, "extract");
    saveState(state);
    return;
  }

  console.log(
    `Found ${filtered.length} sessions above threshold (${options.threshold}):`
  );
  console.log();

  // Display summary table
  console.log("| Score | Session | Messages | Summary | Reasons |");
  console.log("|:-----:|---------|:--------:|---------|---------|");
  for (const s of filtered) {
    const shortId = s.sessionId.slice(0, 8) + "...";
    const summary = (s.entry.summary || "").slice(0, 50);
    const reasons = s.reasons.slice(0, 2).join("; ");
    console.log(
      `| ${s.score} | ${shortId} | ${s.entry.messageCount} | ${summary} | ${reasons} |`
    );
  }

  // Generate extraction markdown
  ensureArchiveDirs();
  const dateStr = new Date().toISOString().split("T")[0];
  const outputPath = join(
    ARCHIVE_DIRS.extractions,
    `${dateStr}-extraction-review.md`
  );

  const lines: string[] = [
    `# Extraction Review - ${dateStr}`,
    "",
    `Generated from ${candidates.length} sessions, ${filtered.length} above threshold (${options.threshold}).`,
    "",
    "Review these sessions and move valuable learnings to:",
    "- `nuggets/` - Quick facts",
    "- `patterns/` - Recurring solutions",
    "- `decisions/` - Architecture decisions",
    "- `runbook/` - Operational procedures",
    "",
    "---",
    "",
  ];

  for (const s of filtered) {
    lines.push(`## ${s.entry.summary || "Untitled Session"}`);
    lines.push("");
    lines.push(`- **Session:** ${s.sessionId}`);
    lines.push(`- **Score:** ${s.score}`);
    lines.push(`- **Messages:** ${s.entry.messageCount}`);
    lines.push(`- **Project:** ${s.entry.projectPath}`);
    lines.push(`- **Branch:** ${s.entry.gitBranch || "unknown"}`);
    lines.push(
      `- **Date:** ${new Date(s.entry.created).toISOString().split("T")[0]} to ${new Date(s.entry.modified).toISOString().split("T")[0]}`
    );
    lines.push(`- **First Prompt:** ${s.entry.firstPrompt || "N/A"}`);
    lines.push(`- **Reasons:** ${s.reasons.join(", ")}`);
    lines.push("");

    // Extract key exchanges
    if (existsSync(s.entry.fullPath)) {
      const exchanges = extractKeyExchanges(s.entry.fullPath, 5);
      if (exchanges.length > 0) {
        lines.push("### Key Exchanges");
        lines.push("");
        for (const exchange of exchanges) {
          lines.push(exchange);
          lines.push("");
        }
      }
    }

    lines.push("### Learnings to Extract");
    lines.push("");
    lines.push("<!-- TODO: Review and extract learnings -->");
    lines.push("- [ ] ...");
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  writeFileSync(outputPath, lines.join("\n"));
  console.log();
  console.log(`Extraction review written to: ${outputPath}`);

  stampLastRun(state, "extract");
  saveState(state);
}
