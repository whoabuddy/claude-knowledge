# Claude Hygiene Runbook

Procedures for maintaining `~/.claude/` data using the claude-hygiene toolkit.

## Quick Reference

```bash
SKILL_DIR=~/dev/whoabuddy/claude-knowledge/claude-config/skills/claude-hygiene

# Install dependencies (first time only)
cd $SKILL_DIR && bun install

# Commands
bun run $SKILL_DIR/src/hygiene.ts report       # Audit
bun run $SKILL_DIR/src/hygiene.ts archive      # Compress old sessions (dry-run)
bun run $SKILL_DIR/src/hygiene.ts extract      # Find learnings
bun run $SKILL_DIR/src/hygiene.ts clean        # Show cleanup targets
```

Or use the skill: `/claude-hygiene report`

## Weekly Procedure

Run every Monday or when disk usage feels high.

1. **Report** - Get current state
   ```bash
   bun run $SKILL_DIR/src/hygiene.ts report
   ```
   Check the reclaimable space estimate. If > 500MB, proceed with archive.

2. **Extract** - Find learning opportunities from the past week
   ```bash
   bun run $SKILL_DIR/src/hygiene.ts extract --days 7 --threshold 3
   ```
   Review the output file at `~/logs/archive/claude/extractions/`. Move valuable findings into:
   - `nuggets/` - Quick facts and TILs
   - `patterns/` - Recurring solutions
   - `decisions/` - ADRs for significant choices

3. **Clean** - Remove low-value data
   ```bash
   bun run $SKILL_DIR/src/hygiene.ts clean --todos --no-dry-run
   ```
   Empty todos are always safe to remove.

## Monthly Procedure

Run on the first of each month.

1. **Report** - Full audit
   ```bash
   bun run $SKILL_DIR/src/hygiene.ts report --json > ~/logs/archive/claude/report-$(date +%Y-%m).json
   ```

2. **Archive** - Compress sessions > 30 days old
   ```bash
   # Preview first
   bun run $SKILL_DIR/src/hygiene.ts archive

   # Then archive for real
   bun run $SKILL_DIR/src/hygiene.ts archive --no-dry-run
   ```

3. **Extract** - Deep review of the past month
   ```bash
   bun run $SKILL_DIR/src/hygiene.ts extract --days 30 --threshold 2
   ```

4. **Clean** - Full cleanup
   ```bash
   # Preview all targets
   bun run $SKILL_DIR/src/hygiene.ts clean

   # Clean safe targets
   bun run $SKILL_DIR/src/hygiene.ts clean --todos --session-env --debug --no-dry-run

   # Optionally delete archived originals (after verifying archive integrity)
   bun run $SKILL_DIR/src/hygiene.ts clean --delete-archived --confirm --no-dry-run
   ```

## Archive Structure

Archives live at `~/logs/archive/claude/`:

```
~/logs/archive/claude/
├── sessions/{YYYY-MM}/     # Compressed JSONL by month
│   └── {sessionId}.jsonl.gz
├── debug/{YYYY-MM}/        # Archived debug logs (future)
├── file-history/{YYYY-MM}/ # Archived file snapshots (future)
├── extractions/            # Learning review files
│   └── YYYY-MM-DD-extraction-review.md
└── manifest.jsonl          # Append-only archive log
```

## Verification

After archiving, verify integrity:

```bash
# Check manifest entry count matches archive file count
wc -l ~/logs/archive/claude/manifest.jsonl
find ~/logs/archive/claude/sessions -name '*.gz' | wc -l

# Spot-check a random archive file decompresses
FILE=$(find ~/logs/archive/claude/sessions -name '*.gz' | shuf -n 1)
bun -e "const f = Bun.file('$FILE'); const d = Bun.gunzipSync(new Uint8Array(await f.arrayBuffer())); console.log('OK:', d.byteLength, 'bytes')"
```

## State Management

The hygiene state file at `~/.claude/.hygiene/state.json` tracks:
- Which sessions have been archived (prevents re-archiving)
- Which sessions have been scored (prevents re-scoring)
- Last run timestamps for each command

To reset state and re-process everything:
```bash
rm ~/.claude/.hygiene/state.json
```

## Troubleshooting

**Report shows 0 sessions:** Check that `sessions-index.json` exists in project directories. Not all project dirs have an index.

**Archive fails on a session:** The JSONL file may have been removed already. Check the error message - the session will be skipped and can be cleaned up later.

**Extract scores seem low:** Lower the threshold with `--threshold 1` to see more candidates. The default (3) is tuned for genuinely valuable sessions.

**Clean refuses to delete archived originals:** The `--confirm` flag is required as a safety measure. Only use this after verifying archive integrity.
