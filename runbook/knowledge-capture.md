# Knowledge Capture Workflow

Automated knowledge extraction from work sessions with human review before persistence.

## Overview

Sessions generate valuable learnings that are easy to forget. This workflow:
1. Scans git activity and session patterns
2. Proposes knowledge captures with categorization
3. Stages captures for human review
4. Persists approved items to the knowledge base

## Directory Structure

```
~/logs/captures/
├── pending/     # Captures awaiting review
│   └── 2026-02-01-clarity-try-unwrap.md
├── approved/    # Reviewed and persisted
│   └── 2026-02-01-clarity-try-unwrap.md
└── rejected/    # Rejected with reason
    └── 2026-02-01-some-capture.md
```

## Capture Format

Each capture is a markdown file with YAML frontmatter:

```yaml
---
category: nugget | pattern | runbook | decision
confidence: high | medium | low
source: session | git-diff | pattern-match
repos: [list, of, repos]
date: YYYY-MM-DD
---

# Title

Content appropriate for the category.

## Context

What triggered this capture (commit, file change, pattern observed).
```

## Categories

| Category | Destination | Use For |
|----------|-------------|---------|
| `nugget` | `nuggets/{topic}.md` | Quick facts, gotchas, one-liners |
| `pattern` | `patterns/{name}.md` | Recurring solutions, code patterns |
| `runbook` | `runbook/{task}.md` | Step-by-step procedures |
| `decision` | `decisions/{nnnn}-{name}.md` | Architecture/design choices |

## Session Review Process

### 1. Scan Git Activity

Find commits for the date range across all repos:

```bash
# Today's commits
for repo in ~/dev/*/*/.git; do
  git -C "$(dirname $repo)" log --oneline --since="midnight" --author="$(git config user.email)" 2>/dev/null
done

# Specific date
for repo in ~/dev/*/*/.git; do
  git -C "$(dirname $repo)" log --oneline --since="2026-01-15" --until="2026-01-16" --author="$(git config user.email)" 2>/dev/null
done
```

### 2. Analyze Changed Files

For each repo with commits:
- `git diff --stat HEAD~N` to see file changes
- `git diff HEAD~N -- *.clar` to examine specific file types
- Note heavily edited files (debugging, iteration)

### 3. Identify Patterns

Look for signals:

| Signal | Potential Capture |
|--------|------------------|
| Same file edited 3+ times | Debugging session, gotcha |
| New file in patterns/utils | Reusable pattern |
| Config file changes | Setup/deployment procedure |
| Test file additions | Testing pattern |
| Commit message "fix:" | Bug/gotcha to document |
| Commit message "docs:" | Explicit documentation |

### 4. Generate Captures

For each identified learning:
1. Determine category based on content type
2. Set confidence based on clarity:
   - **high**: Explicit learning, verified fix
   - **medium**: Useful pattern, might need refinement
   - **low**: Tentative, needs validation
3. Write capture file to `~/logs/captures/pending/`

### 5. Human Review

Captures stay in `pending/` until reviewed:
- **Approve**: Move to `approved/`, persist to knowledge base
- **Reject**: Move to `rejected/` with reason in file
- **Edit**: Modify content, then approve

## Integration Points

### With /daily Skill

After generating daily summary, optionally run capture:
```
/daily && /capture
```

### With /daily-brief Skill

Morning brief can surface pending capture count:
```
Pending captures: 3 items in ~/logs/captures/pending/
```

### With /learn Command

Existing `/learn` for immediate capture continues to work.
`/capture` is for batch extraction from session work.

## Knowledge Base Persistence

On approval, captures persist to `~/dev/whoabuddy/claude-knowledge/`:

```bash
# Nugget - append to topic file
cat capture.md >> nuggets/clarity.md

# Pattern - create new file
cp capture.md patterns/error-handling.md

# Runbook - create new file
cp capture.md runbook/testnet-deploy.md

# Decision - create with next number
cp capture.md decisions/0004-error-strategy.md
```

## Memory Tiers

Captures feed into the four-tier memory system:

| Tier | Description | Location |
|------|-------------|----------|
| Hot | Always loaded | `~/.claude/CLAUDE.md` Quick Facts |
| Warm | On-demand | `nuggets/`, `patterns/`, `runbook/` |
| Cold | Archived | `archive/` |
| Icebox | Parked ideas | `icebox/` |

New captures default to Warm tier. Frequently referenced items may be promoted to Hot (Quick Facts in CLAUDE.md).

## Best Practices

1. **Run at session end** - Context is fresh, patterns are clear
2. **Prefer high confidence** - Better to under-capture than noise
3. **Be specific** - Include examples, not just descriptions
4. **Include context** - Which commits/files triggered this
5. **Don't capture secrets** - No credentials, internal URLs

## Related

- `~/.claude/skills/capture/SKILL.md` - Skill definition
- `~/.claude/skills/daily/SKILL.md` - Daily summary skill
- `~/.claude/skills/daily-brief/SKILL.md` - Morning orientation
- `runbook/logs-structure.md` - Logs directory conventions
