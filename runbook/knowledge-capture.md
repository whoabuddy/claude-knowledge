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

Captures stay in `pending/` until reviewed. Use `/capture review` to process.

## Review Workflow

### Starting a Review

```bash
/capture review       # Process one at a time
/capture review all   # Process all pending
/capture status       # Check pending count first
```

### Review Actions

For each pending capture, choose one of:

#### Approve

Approving a capture:
1. Moves file from `pending/` to `approved/`
2. Adds `approved_date` to frontmatter
3. Persists content to the knowledge base

Persistence by category:

| Category | Destination | How |
|----------|-------------|-----|
| `nugget` | `nuggets/{topic}.md` | Append to existing file, or create if topic is new |
| `pattern` | `patterns/{name}.md` | Create new file (kebab-case name from title) |
| `runbook` | `runbook/{task}.md` | Create new file (kebab-case name from title) |
| `decision` | `decisions/{nnnn}-{name}.md` | Create with next sequential ADR number |

Example approval flow:
```
Category: nugget
Topic derived from title: "clarity"

Appending to: ~/dev/whoabuddy/claude-knowledge/nuggets/clarity.md

---
### stacks-block-height vs block-height

Use `stacks-block-height` for current block height.
`block-height` is legacy and deprecated.

*Source: aibtcdev/aibtc-contracts, 2026-02-01*
---

Done! Capture approved and persisted.
```

#### Reject

Rejecting a capture:
1. Moves file from `pending/` to `rejected/`
2. Adds rejection metadata to frontmatter

Rejection frontmatter:
```yaml
---
rejected: true
rejected_date: 2026-02-01
rejected_reason: "Duplicate of existing nugget in clarity.md"
# ... original frontmatter preserved ...
---
```

Common rejection reasons:
- **Duplicate**: Already exists in knowledge base
- **Too specific**: Not reusable, one-off solution
- **Needs validation**: Not confident enough yet
- **Not accurate**: Contains errors or misconceptions
- **Sensitive**: Contains credentials or internal info

Example rejection flow:
```
Why reject this capture?
1. Duplicate of existing knowledge
2. Too specific (not reusable)
3. Needs more validation
4. Not accurate
5. Contains sensitive info
6. Other (provide reason)

> 1

Moving to rejected/ with reason: "Duplicate of existing knowledge"
```

#### Edit

Editing allows refinement before approve/reject:

1. **Edit content**: Rewrite or clarify the knowledge
2. **Change category**: Move from nugget to pattern, etc.
3. **Adjust confidence**: High/medium/low
4. **Update metadata**: Repos, source, etc.

Example edit flow:
```
What to edit?
1. Content (title and body)
2. Category (currently: nugget)
3. Confidence (currently: medium)
4. Skip (return to approve/reject)

> 1

Current content:
---
# Clarity: Use try! for Error Propagation
...
---

Enter new content (or 'cancel'):
> [User provides refined content]

Updated! Now: [a]pprove / [r]eject / [e]dit again?
```

#### Skip

Skip leaves the capture in `pending/` for later review.

### Batch Review

With `/capture review all`:
- Process each capture in sequence
- Can still skip individual items
- Shows progress: "Capture 3/7"
- Summary at end: "Approved: 4, Rejected: 2, Skipped: 1"

## Integration Points

### With /daily Skill

After generating daily summary, optionally run capture:
```
/daily && /capture
/daily --capture    # Integrated capture at end
```

### With /daily-brief Skill

Morning brief surfaces pending capture count and recent additions:
```
## Pending Captures

3 captures awaiting review in ~/logs/captures/pending/
Run /capture review to process.

## Recently Added Knowledge

- [nugget] Clarity: stacks-block-height deprecation (2026-01-30)
- [pattern] Hono error middleware pattern (2026-01-29)
```

### With /learn Command

Existing `/learn` for immediate capture continues to work.
`/capture` is for batch extraction from session work.

## Daily Workflow Integration

The capture system integrates with your daily rhythm for seamless knowledge management.

### Morning Routine (with /daily-brief)

Start each day with orientation:

```bash
/daily-brief    # Quick summary of pending work
```

The brief shows:
- **Pending captures**: Prompts to review if queue is building up
- **Recently added**: Reinforces the value of capture habit
- **Open threads**: Context from previous days

If pending > 5, consider running `/capture review --batch` before starting new work.

### Evening Routine (with /daily)

End productive days with capture:

```bash
/daily --capture    # Summary + knowledge scan
```

Or chain manually:
```bash
/daily && /capture  # Equivalent
```

When to capture:
- After debugging sessions (learnings are fresh)
- After implementing new patterns
- After solving tricky problems
- Before starting a new project context

When to skip:
- Quick administrative tasks
- Meeting-heavy days
- Already reviewed recently

### Weekly Review

Check capture health once per week:

```bash
/capture status --week
```

Target metrics:
- **Pending queue < 10**: Don't let items go stale
- **Approval rate > 70%**: Captures are relevant
- **Category balance**: Mix of nuggets, patterns, runbooks

If approval rate is low, adjust capture sensitivity:
- More selective pattern matching
- Higher confidence threshold
- Focus on verified fixes over inferred patterns

### Batch Review Mode

For efficient review of accumulated captures:

```bash
/capture review --batch
```

Batch mode:
- Shows all pending captures in sequence
- Auto-approves high confidence (press Enter)
- Quick action for medium/low (A/R/S)
- Summary at end with approve/reject/skip counts

Use batch mode when:
- Pending queue is large (> 5 items)
- You have 10-15 minutes for focused review
- Weekly capture cleanup

### Helper Scripts

The capture skill includes TypeScript helpers:

```bash
# Statistics
bun ~/.claude/skills/capture/capture-stats.ts              # Quick summary
bun ~/.claude/skills/capture/capture-stats.ts --week       # Last 7 days
bun ~/.claude/skills/capture/capture-stats.ts --json       # Machine-readable

# Generate candidates (what /capture uses internally)
bun ~/.claude/skills/capture/capture-candidates.ts         # Today
bun ~/.claude/skills/capture/capture-candidates.ts --week  # Last 7 days
```

### Example Daily Flow

**Morning:**
```
> /daily-brief

## What Got Done
**2026-01-31** - 8 commits
- Implemented Clarity contract testing with clarinet SDK
- Fixed authentication flow in MCP server

## Pending Captures
2 captures awaiting review
Run /capture review to process.

## Recently Added Knowledge
- [nugget] Clarinet SDK simnet reset behavior (2026-01-30)

## Focus Areas
- Continue MCP server work
- Review pending captures
```

**Evening:**
```
> /daily --capture

[Daily summary generated...]

## Capture Candidates for 2026-02-01

Found 3 potential captures:

### High Confidence
- [nugget] Fix authentication header parsing
  Repos: aibtcdev/aibtc-mcp-server

### Medium Confidence
- [pattern] Hono middleware error propagation
  Repos: whoabuddy/moltbook

Captures written to ~/logs/captures/pending/
Use /capture review to approve/reject.
```

**Weekly (Friday):**
```
> /capture status --week

## Capture Statistics

| Status | Count |
|--------|------:|
| Pending | 4 |
| Approved | 7 |
| Rejected | 2 |

**Approval Rate:** 78%

### By Category
| Category | Pending | Approved | Rejected |
|----------|:-------:|:--------:|:--------:|
| nugget | 3 | 5 | 1 |
| pattern | 1 | 2 | 1 |

Looking good! Queue is manageable and approval rate is healthy.
```

## Knowledge Base Persistence

On approval, captures persist to `~/dev/whoabuddy/claude-knowledge/`:

### Nuggets

Append to topic file (create if doesn't exist):

```bash
# If nuggets/clarity.md exists, append
# Otherwise, create with header

# Example append format:
### [Title from capture]

[Content from capture]

*Source: [repos], [date]*
```

### Patterns

Create new pattern file:

```bash
# patterns/error-handling-middleware.md
# Use kebab-case from title

# Include full content from capture
# Add any examples and context
```

### Runbook

Create new runbook file:

```bash
# runbook/testnet-deploy.md
# Use kebab-case from title

# Preserve step-by-step structure
# Add prerequisites and verification steps
```

### Decisions (ADR)

Create with next sequential number:

```bash
# Find next ADR number
ls decisions/*.md | sort | tail -1
# If last is 0003-*, next is 0004

# decisions/0004-error-strategy.md
# Follow ADR format: status, context, decision, consequences
```

## Memory Tiers

Captures feed into the four-tier memory system:

| Tier | Description | Location | Loaded |
|------|-------------|----------|--------|
| **Hot** | Always loaded | `~/.claude/CLAUDE.md` Quick Facts | Every session |
| **Warm** | On-demand | `nuggets/`, `patterns/`, `runbook/` | When relevant |
| **Cold** | Archived | `archive/` | Rarely, manual |
| **Icebox** | Parked ideas | `icebox/` | Never auto-loaded |

New captures default to Warm tier. Frequently referenced items may be promoted to Hot (Quick Facts in CLAUDE.md).

### Tier Transitions

#### Decay (Warm -> Cold)

Items not accessed for 90+ days automatically decay to cold storage:

```bash
# Check what would be archived
/capture decay --dry-run

# Execute decay (move to archive/)
/capture decay --execute

# Custom threshold
/capture decay --days 60 --execute
```

Decayed files:
- Move to `archive/{category}/` preserving structure
- Add decay metadata (date, reason, original path, access count)
- Remain searchable but don't pollute active knowledge

#### Promotion (Cold -> Warm)

Items accessed 3+ times while in cold storage promote back to warm:

```bash
# Check cold items ready for promotion
/capture promote

# Execute promotion
/capture promote --execute
```

#### Manual Archive

Archive knowledge that's outdated but might be useful later:

```bash
# Archive specific file
/capture archive nuggets/old-api.md --reason "API deprecated in v2.0"

# Archive by pattern
/capture archive patterns/legacy-*.md
```

#### Icebox

Park ideas that aren't ready for the knowledge base:

```bash
# Add new idea
/capture icebox "Consider using property-based testing for contracts"

# List parked ideas
/capture icebox list

# View specific idea
/capture icebox get 3

# Promote validated idea to capture
/capture icebox promote 3
```

Icebox is for unvalidated ideas, unlike archive which holds validated knowledge that decayed.

### Access Tracking

The system tracks when knowledge is accessed to support decay/promotion:

```bash
# Record an access (done automatically during retrieval)
bun ~/.claude/skills/capture/access-tracker.ts record nuggets/clarity.md

# Query access info
bun ~/.claude/skills/capture/access-tracker.ts query nuggets/clarity.md

# List stale items (90+ days)
bun ~/.claude/skills/capture/access-tracker.ts list --stale

# List cold items ready for promotion
bun ~/.claude/skills/capture/access-tracker.ts list --cold-active
```

Access log stored at `~/dev/whoabuddy/claude-knowledge/.access-log.json`.

### Tier Management Best Practices

1. **Run decay check monthly** - Keep warm tier focused on active knowledge
2. **Review promotion candidates** - Frequently accessed archived items should return
3. **Use icebox liberally** - Better to park than pollute the knowledge base
4. **Archive vs delete** - Prefer archive over delete; knowledge might be useful later
5. **Track tier stats** - Use `/capture status --tiers` to monitor balance

## Best Practices

1. **Run at session end** - Context is fresh, patterns are clear
2. **Prefer high confidence** - Better to under-capture than noise
3. **Be specific** - Include examples, not just descriptions
4. **Include context** - Which commits/files triggered this
5. **Don't capture secrets** - No credentials, internal URLs
6. **Review daily** - Don't let pending queue grow stale
7. **Batch when possible** - `/capture review all` is efficient

## Troubleshooting

### Capture generated but not useful

Reject with "too specific" or "needs validation". These go to `rejected/` for reference but don't pollute the knowledge base.

### Duplicate capture

Check if knowledge already exists before approving:
```bash
grep -r "stacks-block-height" ~/dev/whoabuddy/claude-knowledge/
```

If duplicate, reject with reason.

### Wrong category

Use edit to change category before approving. A nugget might actually be a pattern if it has enough structure.

### Low confidence captures

Review more carefully. Ask:
- Is this a one-off or will it recur?
- Is this verified or just a hypothesis?
- Does this add value to the knowledge base?

When in doubt, reject with "needs validation" and revisit if the pattern recurs.

## Related

- `~/.claude/skills/capture/SKILL.md` - Skill definition
- `~/.claude/skills/daily/SKILL.md` - Daily summary skill
- `~/.claude/skills/daily-brief/SKILL.md` - Morning orientation
- `runbook/logs-structure.md` - Logs directory conventions
