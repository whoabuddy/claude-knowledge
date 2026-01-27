#!/usr/bin/env bun
/**
 * Claude Hygiene System
 * Manage ~/.claude/ data: report, archive, extract learnings, clean up.
 *
 * Usage: bun run src/hygiene.ts <command> [options]
 */

import { Command } from "commander";
import { runReport } from "./commands/report";
import { runArchive } from "./commands/archive";
import { runExtract } from "./commands/extract";
import { runClean } from "./commands/clean";

const program = new Command();

program
  .name("claude-hygiene")
  .description("Manage ~/.claude/ data: report, archive, extract, clean")
  .version("1.0.0");

program
  .command("report")
  .description("Audit current state of all .claude data")
  .option("--json", "Output as JSON", false)
  .option("--threshold <days>", "Age threshold in days for archive estimates", "30")
  .action(async (opts) => {
    await runReport({
      json: opts.json,
      threshold: parseInt(opts.threshold, 10),
    });
  });

program
  .command("archive")
  .description("Compress old sessions to ~/logs/archive/claude/")
  .option("--dry-run", "Preview what would be archived (default)", true)
  .option("--no-dry-run", "Actually perform the archive")
  .option("--threshold <days>", "Sessions older than this are archived", "30")
  .option("--delete-originals", "Delete original files after archive", false)
  .action(async (opts) => {
    await runArchive({
      dryRun: opts.dryRun,
      threshold: parseInt(opts.threshold, 10),
      deleteOriginals: opts.deleteOriginals,
    });
  });

program
  .command("extract")
  .description("Find sessions worth learning from")
  .option("--days <n>", "Look back this many days", "90")
  .option("--limit <n>", "Maximum sessions to extract", "20")
  .option("--project <path>", "Filter to a specific project path")
  .option("--threshold <score>", "Minimum score to include", "3")
  .action(async (opts) => {
    await runExtract({
      days: parseInt(opts.days, 10),
      limit: parseInt(opts.limit, 10),
      project: opts.project,
      threshold: parseInt(opts.threshold, 10),
    });
  });

program
  .command("clean")
  .description("Delete low-value data")
  .option("--dry-run", "Preview what would be deleted (default)", true)
  .option("--no-dry-run", "Actually perform the cleanup")
  .option("--todos", "Clean empty todo files")
  .option("--session-env", "Clean orphaned session-env dirs")
  .option("--debug", "Clean debug log files")
  .option("--delete-archived", "Delete originals already archived")
  .option("--confirm", "Required with --delete-archived")
  .action(async (opts) => {
    await runClean({
      dryRun: opts.dryRun,
      todos: opts.todos || false,
      sessionEnv: opts.sessionEnv || false,
      debug: opts.debug || false,
      deleteArchived: opts.deleteArchived || false,
      confirm: opts.confirm || false,
    });
  });

program.parse();
