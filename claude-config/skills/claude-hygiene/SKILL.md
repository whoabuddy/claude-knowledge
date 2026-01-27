---
name: claude-hygiene
description: Manage ~/.claude/ data - report, archive, extract learnings, clean up
allowed-tools: Bash, Read, Write, Glob, Grep
---

# Claude Hygiene Skill

Manage and maintain `~/.claude/` data: audit sizes, archive old sessions, extract learnings, and clean up low-value files.

## Usage

```bash
/claude-hygiene                    # Show help
/claude-hygiene report             # Audit current state
/claude-hygiene archive            # Archive old sessions (dry-run)
/claude-hygiene extract            # Find high-value sessions
/claude-hygiene clean              # Show cleanup targets
```

## Commands

Run all commands via Bun from the skill directory:

```bash
SKILL_DIR=~/dev/whoabuddy/claude-knowledge/claude-config/skills/claude-hygiene
```

### Report

Audit all `.claude` data with size breakdown, session age distribution, and reclaimable space estimates.

```bash
bun run $SKILL_DIR/src/hygiene.ts report
bun run $SKILL_DIR/src/hygiene.ts report --json
bun run $SKILL_DIR/src/hygiene.ts report --threshold 14
```

### Archive

Compress old session JSONL files with gzip and move to `~/logs/archive/claude/sessions/{YYYY-MM}/`.

```bash
bun run $SKILL_DIR/src/hygiene.ts archive                    # Dry run (default)
bun run $SKILL_DIR/src/hygiene.ts archive --no-dry-run       # Actually archive
bun run $SKILL_DIR/src/hygiene.ts archive --threshold 14     # Archive sessions >14 days old
bun run $SKILL_DIR/src/hygiene.ts archive --no-dry-run --delete-originals  # Archive + delete
```

### Extract

Score sessions by heuristics and generate a review file for manual knowledge curation.

```bash
bun run $SKILL_DIR/src/hygiene.ts extract                    # Last 90 days, score >= 3
bun run $SKILL_DIR/src/hygiene.ts extract --days 30          # Last 30 days only
bun run $SKILL_DIR/src/hygiene.ts extract --project ~/dev/aibtcdev/x402-api
bun run $SKILL_DIR/src/hygiene.ts extract --threshold 5      # Only high-value sessions
```

Output goes to `~/logs/archive/claude/extractions/`.

### Clean

Delete low-value files. Always preview first with dry-run (default).

```bash
bun run $SKILL_DIR/src/hygiene.ts clean                      # Show all targets
bun run $SKILL_DIR/src/hygiene.ts clean --todos              # Dry-run empty todos
bun run $SKILL_DIR/src/hygiene.ts clean --todos --no-dry-run # Actually delete
bun run $SKILL_DIR/src/hygiene.ts clean --debug --no-dry-run # Delete debug logs
bun run $SKILL_DIR/src/hygiene.ts clean --delete-archived --confirm --no-dry-run  # Delete archived originals
```

## Workflow

When the user invokes `/claude-hygiene`, determine the intent:

1. **No args or "report"** - Run the report command and display results
2. **Specific command** - Run that command with the given flags
3. **"weekly"** - Run report, then suggest archive + extract based on results
4. **"monthly"** - Run report, archive --no-dry-run, extract, then suggest clean targets

Always show dry-run results first before performing destructive operations.

## State

Processing state is tracked at `~/.claude/.hygiene/state.json` to avoid re-processing sessions.
Archive manifest is at `~/logs/archive/claude/manifest.jsonl`.
