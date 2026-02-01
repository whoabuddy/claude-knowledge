---
name: capture
description: Review session work and propose knowledge captures for human review. Scans git commits, changed files, and patterns used across repos to generate structured knowledge items. Includes review workflow to approve/reject/edit pending captures before persisting to the knowledge base.
allowed-tools: Bash, Read, Write, Edit, Glob, Grep
---

# Knowledge Capture Skill

Reviews work done in the current session and proposes knowledge items for human review before persisting to the knowledge base.

## Usage

```bash
/capture              # Review today's session work
/capture week         # Review the past week
/capture 2026-01-15   # Review a specific date
/capture review       # Process pending captures (approve/reject/edit)
/capture review all   # Process all pending captures in batch
/capture review --batch  # Quick batch mode: approve high, skip low
/capture status       # Show pending/approved/rejected counts
/capture status --week   # Detailed stats for last 7 days
/capture status --tiers  # Include tier breakdown (warm/cold/icebox)
/capture archive <file>  # Manually archive knowledge to cold storage
/capture icebox "idea"   # Park an idea in the icebox
/capture icebox list     # List parked ideas
/capture decay           # Check for items ready to decay
/capture promote         # Check for cold items ready to promote
```

## Subcommands

### /capture (default) - Generate Captures

Scans git activity and generates new captures to `~/logs/captures/pending/`.

### /capture review - Process Pending

Interactive workflow to review pending captures:

1. **List pending** - Show all captures awaiting review
2. **Present each** - Display content, metadata, confidence
3. **Ask action** - Approve, reject, or edit
4. **Process** - Persist approved, archive rejected

Options:
- `review` - Process one capture at a time
- `review all` - Batch process all pending captures
- `review --batch` - Quick batch mode for efficient processing

### Batch Review Mode

Use `review --batch` for quick bulk processing:

```
> /capture review --batch

Processing 5 pending captures in batch mode...

1. [nugget] Clarity: stacks-block-height deprecation
   Confidence: high | Repos: aibtcdev/agent-contracts
   Quick action? [A]pprove / [R]eject / [S]kip (default: approve high)

2. [pattern] Error handling middleware
   Confidence: medium | Repos: whoabuddy/moltbook
   Quick action? [A]pprove / [R]eject / [S]kip

...

Batch complete!
- Approved: 3
- Rejected: 1
- Skipped: 1
```

Batch mode defaults:
- Auto-approve high confidence captures (press Enter)
- Ask for medium/low confidence
- Skip items you're unsure about for later review

### /capture status - Show Counts

Display summary of capture activity:
```
Pending:  3 captures awaiting review
Approved: 12 captures persisted this month
Rejected: 2 captures archived
```

Options:
- `status` - Quick summary counts
- `status --week` - Detailed stats with category breakdown and weekly trend
- `status --month` - 30-day detailed view
- `status --tiers` - Include tier breakdown (warm/cold/icebox)

Uses `capture-stats.ts` helper for statistics.

### /capture archive - Move to Cold Storage

Manually archive knowledge items that are outdated or rarely needed:

```bash
/capture archive nuggets/old-api.md              # Archive specific file
/capture archive patterns/deprecated-*.md        # Archive by pattern
/capture archive nuggets/clarity.md --reason "superseded by new version"
```

Archived files:
- Move to `archive/{category}/` preserving structure
- Add archive metadata (date, reason, original path)
- Remain searchable but don't pollute active knowledge
- Can be promoted back if accessed frequently

### /capture icebox - Park Ideas

Park ideas that aren't ready for the knowledge base:

```bash
/capture icebox "Consider using Deno for scripts"  # Add new idea
/capture icebox list                               # List all parked ideas
/capture icebox get 3                              # View specific idea
/capture icebox delete 3                           # Remove idea
/capture icebox promote 3                          # Promote to capture
```

Icebox is for:
- Unvalidated ideas
- Future possibilities
- Low-priority improvements
- Speculative patterns

Unlike archive (validated knowledge that decayed), icebox holds ideas that never reached warm tier.

### /capture decay - Check Stale Items

Find warm-tier items that haven't been accessed in 90+ days:

```bash
/capture decay                 # Show decay candidates
/capture decay --dry-run       # Preview what would move
/capture decay --execute       # Actually move to archive
/capture decay --days 60       # Custom threshold
```

Uses `decay-check.ts` helper. Decay is not automatic - run periodically or with `/capture status`.

### /capture promote - Check Cold Items

Find archived items that should return to warm tier:

```bash
/capture promote               # Show promotion candidates
/capture promote --execute     # Actually move back to warm
```

Items are promoted when accessed 3+ times while in cold storage.

## What It Does

1. **Scans git activity** - Commits across repos in `~/dev/` for the date range
2. **Identifies patterns** - New techniques, debugging approaches, common scenarios
3. **Generates captures** - Structured markdown files with category and confidence
4. **Writes to pending** - Saves to `~/logs/captures/pending/` for review

## Output Format

Each capture is a markdown file in `~/logs/captures/pending/`:

```
2026-02-01-clarity-try-unwrap.md
```

File structure:

```yaml
---
category: nugget | pattern | runbook | decision
confidence: high | medium | low
source: session | git-diff | pattern-match
repos: [repo1, repo2]
date: 2026-02-01
---

# Clarity: Use try! for Error Propagation

`try!` unwraps a response and propagates the error to the caller.
Prefer over `unwrap!` when you want the caller to handle errors.

## Example
(define-public (transfer (amount uint))
  (try! (stx-transfer? amount tx-sender recipient))
  (ok true))

## Context
Observed in aibtcdev/aibtc-contracts during session review.
Commit: abc123 "fix: propagate transfer errors properly"
```

## Review Workflow

### Approve

When approved, the capture is:
1. Moved to `~/logs/captures/approved/`
2. Persisted to the knowledge base at `~/dev/whoabuddy/claude-knowledge/`

Destination by category:

| Category | Destination | Action |
|----------|-------------|--------|
| `nugget` | `nuggets/{topic}.md` | Append to existing or create new |
| `pattern` | `patterns/{name}.md` | Create new file |
| `runbook` | `runbook/{task}.md` | Create new file |
| `decision` | `decisions/{nnnn}-{name}.md` | Create with next ADR number |

### Reject

When rejected, the capture is:
1. Moved to `~/logs/captures/rejected/`
2. Reason added to frontmatter

Rejection reasons:
- Duplicate of existing knowledge
- Too specific (not reusable)
- Needs more validation
- Not accurate
- Custom reason

### Edit

When editing:
1. Display current content
2. Ask what to change (content, category, confidence)
3. Apply edits
4. Then approve or reject

## Categories

| Category | Description | Destination |
|----------|-------------|-------------|
| `nugget` | Quick fact or gotcha | `nuggets/{topic}.md` |
| `pattern` | Recurring solution | `patterns/{name}.md` |
| `runbook` | Procedural workflow | `runbook/{task}.md` |
| `decision` | Architecture choice | `decisions/{nnnn}-{name}.md` |

## Confidence Levels

- **high**: Clear, verified, immediately useful
- **medium**: Probably useful, might need refinement
- **low**: Tentative, needs validation

## Session Review Logic

The skill analyzes:

### Git Commits
```bash
# Find today's commits across all repos
for repo in ~/dev/*/*/.git; do
  git -C "$(dirname $repo)" log --oneline --since="midnight" --author="$(git config user.email)"
done
```

### Changed Files
- Look for new techniques or patterns in diffs
- Note files that were heavily edited (debugging, refactoring)

### Pattern Recognition
- Debugging sessions (multiple commits to same file)
- New feature work (new files added)
- Refactoring (renames, restructuring)
- Integration work (config file changes)

## Integration

- **After work sessions**: Run `/capture` to review the day
- **With /daily**: Optionally call capture at end of daily summary
- **Morning review**: `/capture review` to process pending items
- **With /daily-brief**: Surfaces pending capture count

## Workflow

See `runbook/knowledge-capture.md` in the knowledge base for full workflow documentation.

## Files

| Location | Purpose |
|----------|---------|
| `~/logs/captures/pending/` | Captures awaiting review |
| `~/logs/captures/approved/` | Reviewed and persisted |
| `~/logs/captures/rejected/` | Rejected with reason |
| `~/dev/whoabuddy/claude-knowledge/` | Knowledge base destination |

## Knowledge Tiers

| Tier | Description | Location | Loaded |
|------|-------------|----------|--------|
| **Hot** | Always loaded | `~/.claude/CLAUDE.md` Quick Facts | Every session |
| **Warm** | On-demand | `nuggets/`, `patterns/`, `runbook/` | When relevant |
| **Cold** | Archived | `archive/` | Rarely, manual |
| **Icebox** | Parked ideas | `icebox/` | Never auto-loaded |

### Tier Transitions

- **Warm -> Cold (Decay)**: Items not accessed in 90 days move to archive
- **Cold -> Warm (Promotion)**: Items accessed 3+ times while archived return to warm
- **Warm -> Icebox**: Manual; for ideas not ready for knowledge base
- **Icebox -> Warm**: Manual promotion when idea is validated

## Tips

- Run at end of work session when context is fresh
- Higher confidence for explicit learnings (debugging gotchas)
- Lower confidence for inferred patterns (might be one-off)
- Captures are proposals - human reviews before persistence
- Don't capture sensitive info (credentials, internal URLs)
- Review pending captures in morning (with daily-brief) or before EOD

## Example Session

### Generating Captures

```
> /capture

Reviewing session work for 2026-02-01...

Found 12 commits across 3 repos:
- aibtcdev/aibtc-contracts: 5 commits (Clarity patterns)
- whoabuddy/moltbook: 4 commits (TypeScript, Hono)
- stacks-network/docs: 3 commits (documentation)

Generated 3 captures:

1. [nugget] Clarity: stacks-block-height vs block-height
   Confidence: high
   Source: aibtcdev/aibtc-contracts commit "fix: use current block height"

2. [pattern] Hono middleware error handling
   Confidence: medium
   Source: moltbook pattern observed across 3 files

3. [runbook] Deploying Clarity contracts to testnet
   Confidence: low
   Source: Inferred from commit sequence

Captures written to ~/logs/captures/pending/
Use /capture review to approve/reject.
```

### Reviewing Captures

```
> /capture review

Pending captures: 3

---
## Capture 1/3: Clarity: stacks-block-height vs block-height

Category: nugget
Confidence: high
Source: aibtcdev/aibtc-contracts

Content:
Use `stacks-block-height` instead of `block-height` for current block.
`block-height` is legacy and deprecated.

---

Action? [a]pprove / [r]eject / [e]dit / [s]kip

> a

Approved! Persisted to nuggets/clarity.md

---
## Capture 2/3: Hono middleware error handling
...
```

## Helper Scripts

The skill uses TypeScript helpers for stats and candidate generation:

### capture-stats.ts

Compute capture statistics for status reporting:

```bash
bun ~/.claude/skills/capture/capture-stats.ts              # Quick summary
bun ~/.claude/skills/capture/capture-stats.ts --week       # Last 7 days detailed
bun ~/.claude/skills/capture/capture-stats.ts --month      # Last 30 days detailed
bun ~/.claude/skills/capture/capture-stats.ts --tiers      # Include tier stats
bun ~/.claude/skills/capture/capture-stats.ts --json       # Output as JSON
```

Output includes:
- Pending/approved/rejected counts
- Approval rate percentage
- Category breakdown (nugget, pattern, runbook, decision)
- Weekly trend (last 4 weeks)
- Recently approved captures
- Pending items for review
- Tier counts (with --tiers): warm, cold, icebox
- Decay/promotion candidates

### access-tracker.ts

Track when knowledge items are accessed:

```bash
bun ~/.claude/skills/capture/access-tracker.ts record <path>    # Record an access
bun ~/.claude/skills/capture/access-tracker.ts query <path>     # Get access info
bun ~/.claude/skills/capture/access-tracker.ts list             # All tracked items
bun ~/.claude/skills/capture/access-tracker.ts list --stale     # Items ready for decay
bun ~/.claude/skills/capture/access-tracker.ts list --cold-active  # Cold items to promote
```

Access log stored at `~/dev/whoabuddy/claude-knowledge/.access-log.json`.

### decay-check.ts

Check for and execute tier transitions:

```bash
bun ~/.claude/skills/capture/decay-check.ts                # Report decay candidates
bun ~/.claude/skills/capture/decay-check.ts --dry-run      # Preview changes
bun ~/.claude/skills/capture/decay-check.ts --execute      # Move files to archive
bun ~/.claude/skills/capture/decay-check.ts --days 60      # Custom threshold
bun ~/.claude/skills/capture/decay-check.ts --promote      # Check promotion candidates
bun ~/.claude/skills/capture/decay-check.ts --promote --execute  # Execute promotions
```

### capture-candidates.ts

Auto-generate capture candidates from git activity:

```bash
bun ~/.claude/skills/capture/capture-candidates.ts              # Today's activity
bun ~/.claude/skills/capture/capture-candidates.ts 2026-02-01   # Specific date
bun ~/.claude/skills/capture/capture-candidates.ts --week       # Last 7 days
bun ~/.claude/skills/capture/capture-candidates.ts --json       # Output as JSON
```

Pattern matching:
- Fix commits -> high confidence nuggets
- Same file edited 3+ times -> debugging session nuggets
- Clarity contract changes -> domain-specific nuggets
- Config file changes -> runbook candidates
- New utils/patterns files -> pattern candidates

## Daily Workflow Integration

### Morning (with /daily-brief)

The daily-brief skill surfaces:
- Pending capture count
- Recently approved captures (last 7 days)
- Prompt to run `/capture review` if pending > 0

### Evening (with /daily)

After generating daily summary, optionally run capture:

```bash
/daily && /capture        # Generate summary, then scan for captures
/daily --capture          # Integrated capture at end (optional)
```

### Weekly Review

Use stats to track capture health:

```bash
/capture status --week    # See approval rate, trends, categories
```

Target metrics:
- Keep pending queue < 10
- Approval rate > 70% (captures are relevant)
- Review daily to prevent staleness
