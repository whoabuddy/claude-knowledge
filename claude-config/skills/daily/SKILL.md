---
name: daily
description: Generate daily summary of git activity across all repositories
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Task, TodoWrite
---

# Daily Summary Skill

Generates and publishes a team-friendly daily summary of work across all git repositories.

## Usage

```bash
/daily              # Uses today's date
/daily 2026-01-05   # Specific date
/daily --capture    # Run capture scan after summary (optional)
```

## Configuration

Set these in your environment or `~/.claude/CLAUDE.md`:
- `DAILY_LOGS_REPO` - GitHub repo for publishing summaries (e.g., `myorg/dev-logs`)
- Default dev directory: `~/dev/` (all `org/repo` subdirectories are scanned)

## Data Sources

### Git Commits
Raw git log data from repos under `~/dev/` and additional directories (`~/arc/`). Collected via `daily-git-summary.sh`.

### GitHub Events API
Activity from the primary user (`@me` / whoabuddy) plus additional tracked users (`arc0btc`). Captures pushes, PRs, issues, reviews, comments, forks, and repo creation for all configured users.

## Workflow

Follow the runbook: `runbook/daily-summary.md` in your knowledge base.

1. **Collect** - Run `daily-git-summary.sh` to gather raw git data
2. **Verify PR status** - Before listing PRs in Open Threads, check their actual state:
   ```bash
   gh pr view {number} --repo {org/repo} --json state -q '.state'
   ```
   Only list as "Awaiting review" if state is OPEN. Use "Merged" for MERGED PRs.
3. **Interpret** - Create/update team summary using TEMPLATE.md (includes Jekyll front matter)
4. **Sync** - Copy to your configured logs repo `_posts/` directory
5. **Push** - Commit and push to trigger GitHub Pages build

## Files

| File | Purpose |
|------|---------|
| `daily-git-summary.sh` | Bash helper for raw data collection |
| `extract-deployments.ts` | Bun script to extract deployment URLs from wrangler.jsonc |
| `TEMPLATE.md` | Summary format template |

## Deployment URLs

For repos with Cloudflare Workers (wrangler.jsonc), extract deployment links:

```bash
bun ~/.claude/skills/daily/extract-deployments.ts --from-repos org/repo1,org/repo2
```

This outputs a markdown table with staging/production URLs extracted from wrangler.jsonc routes.

## Optional Capture Integration

Use `--capture` flag to scan for knowledge captures after generating the daily summary:

```bash
/daily --capture    # Summary + capture scan
```

This runs the `/capture` skill after the summary is complete:
1. Scans git activity for the same date
2. Generates capture candidates using pattern matching
3. Writes pending captures to `~/logs/captures/pending/`
4. Shows capture candidates for later review

You can also chain commands manually:
```bash
/daily && /capture  # Equivalent to --capture flag
```

The capture step is optional - skip it if you're in a hurry or if the day's work doesn't warrant knowledge extraction.

### When to Use --capture

Good for:
- End of productive work sessions
- Days with significant debugging or learning
- When you've solved a tricky problem

Skip when:
- Quick administrative tasks
- Meeting-heavy days with little code work
- Already reviewed captures recently
