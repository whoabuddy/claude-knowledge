---
name: capture
description: Review session work and propose knowledge captures for human review. Scans git commits, changed files, and patterns used across repos to generate structured knowledge items. Part of the memory capture/review workflow.
allowed-tools: Bash, Read, Write, Edit, Glob, Grep
---

# Knowledge Capture Skill

Reviews work done in the current session and proposes knowledge items for human review before persisting to the knowledge base.

## Usage

```bash
/capture              # Review today's session work
/capture week         # Review the past week
/capture 2026-01-15   # Review a specific date
```

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
- **Review pending**: Use `/capture review` (Phase 2) to approve/reject

## Workflow

See `runbook/knowledge-capture.md` in the knowledge base for full workflow documentation.

## Files

| Location | Purpose |
|----------|---------|
| `~/logs/captures/pending/` | Captures awaiting review |
| `~/logs/captures/approved/` | Reviewed and persisted |
| `~/logs/captures/rejected/` | Rejected with reason |
| `~/dev/whoabuddy/claude-knowledge/` | Knowledge base destination |

## Tips

- Run at end of work session when context is fresh
- Higher confidence for explicit learnings (debugging gotchas)
- Lower confidence for inferred patterns (might be one-off)
- Captures are proposals - human reviews before persistence
- Don't capture sensitive info (credentials, internal URLs)

## Example Session

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
