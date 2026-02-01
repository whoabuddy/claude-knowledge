---
name: daily-brief
description: Review logs from ~/logs and remote log APIs to provide orientation and context for the day. Use when starting a work session, checking what happened recently, or needing context on recent activity. Reads daily summaries, meeting notes, test runs, and worker logs.
allowed-tools: Bash, Read, Glob, Grep, Task, WebFetch
---

# Daily Brief Skill

Reads and synthesizes logs from local `~/logs` and remote log APIs to orient you for work.

## Usage

```bash
/daily-brief                  # Yesterday + today (default)
/daily-brief today            # Just today
/daily-brief week             # Last 7 days
/daily-brief 2026-01-15       # Specific date
/daily-brief 2026-01-10 2026-01-15  # Date range
/daily-brief --deep           # More informed analysis
/daily-brief week --deep      # Weekly retrospective
/daily-brief --remote         # Include remote worker logs
/daily-brief --remote-only    # Only remote logs (skip local)
/daily-brief --moltbook       # Include Moltbook feed/activity
```

## Modes

### Quick Mode (default)
Fast direct reads for daily orientation from local logs.

### Deep Mode (`--deep`)
Same compact output, but more informed:
- Verify PR/issue status with `gh` before reporting
- Cross-reference test failures against recent commits
- Richer context from meeting notes and patterns
- Include remote worker logs

Deep mode means **better accuracy**, not more verbosity.

### Remote Mode (`--remote` or `--remote-only`)
Fetches logs from remote worker-logs APIs. Use `--remote` to combine with local logs, or `--remote-only` for just remote.

### Moltbook Mode (`--moltbook`)
Includes Moltbook social activity in the brief:
- Check personalized feed for new posts
- Check for DM requests and unread messages
- Surface interesting discussions in subscribed submolts
- Note replies to our posts

## Log Sources

### Local Logs (`~/logs`)

```
~/logs/
├── daily/                    # Daily summaries (YYYY-MM-DD-daily-summary.md)
│   └── raw/                  # Raw git data from daily skill
├── meetings/                 # Meeting notes and agendas
├── captures/                 # Knowledge captures from /capture skill
│   ├── pending/              # Awaiting review
│   ├── approved/             # Persisted to knowledge base
│   └── rejected/             # Rejected with reason
├── archive/                  # Archived logs
├── aibtc-x402-test-runs/     # Symlinked test logs
└── stx402-test-runs/         # Symlinked test logs
```

### Remote Log APIs

Three worker-logs instances with centralized logging from Cloudflare Workers:

| Service | URL | Env File |
|---------|-----|----------|
| wbd.host | `https://logs.wbd.host` | `~/dev/whoabuddy/worker-logs/.env` |
| aibtc.com (prod) | `https://logs.aibtc.com` | `~/dev/aibtcdev/worker-logs/.env` |
| aibtc.dev (staging) | `https://logs.aibtc.dev` | `~/dev/aibtcdev/worker-logs/.env` |

### Moltbook (Social)

AI agent social network activity. Credentials at `~/.config/moltbook/credentials.json`.

| Endpoint | Data |
|----------|------|
| `/api/v1/feed` | Personalized feed (subscribed submolts + followed moltys) |
| `/api/v1/agents/dm/check` | Pending DM requests and unread messages |
| `/api/v1/agents/status` | Claim status and profile info |

## Workflow

1. **Parse arguments** - Date range, `--deep`, `--remote`, `--remote-only`, `--moltbook` flags
2. **Read local daily summaries** - Primary source (already synthesized)
3. **Check pending captures** - Count files in `~/logs/captures/pending/`
4. **Check recent additions** - List recently approved captures (last 7 days)
4. **Fetch remote logs** - If `--remote` or `--remote-only` or `--deep`
5. **Check Moltbook** - If `--moltbook` flag is set
6. **Check open threads** - From logs, then verify with `gh` if `--deep`
7. **Scan test logs** - Only flag failures not fixed by subsequent commits
8. **Present brief** - Compact output focused on action

### Remote Log Fetching

To fetch from remote APIs, source the admin key and use curl:

```bash
# Source admin key for wbd.host
source ~/dev/whoabuddy/worker-logs/.env

# List all registered apps
curl -s -H "X-Admin-Key: $ADMIN_API_KEY" https://logs.wbd.host/apps

# Get logs for a specific app (last 24 hours)
curl -s -H "X-Admin-Key: $ADMIN_API_KEY" \
  "https://logs.wbd.host/logs?app_id=my-app&since=$(date -u -d '1 day ago' +%Y-%m-%dT%H:%M:%SZ)"

# Get stats for an app (last 7 days)
curl -s -H "X-Admin-Key: $ADMIN_API_KEY" \
  "https://logs.wbd.host/stats/my-app?days=7"
```

For aibtc logs (same API, different env):

```bash
# Source admin key for aibtc (works for both prod and staging)
source ~/dev/aibtcdev/worker-logs/.env

# Production logs
curl -s -H "X-Admin-Key: $ADMIN_API_KEY" https://logs.aibtc.com/apps

# Staging logs
curl -s -H "X-Admin-Key: $ADMIN_API_KEY" https://logs.aibtc.dev/apps
```

### API Endpoints Reference

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/apps` | GET | Admin | List all registered apps |
| `/apps/:app_id` | GET | Admin | Get app details |
| `/logs` | GET | Admin + app_id param | Query logs with filters |
| `/stats/:app_id` | GET | Admin | Daily stats (debug/info/warn/error counts) |

### Moltbook Fetching

To check Moltbook activity, use the helper script or direct API calls:

```bash
# Use helper script (recommended)
~/dev/whoabuddy/moltbook/lib/check-feed.sh --brief

# Or direct API calls
API_KEY=$(jq -r .api_key ~/.config/moltbook/credentials.json)

# Check claim status first
curl -s "https://www.moltbook.com/api/v1/agents/status" \
  -H "Authorization: Bearer $API_KEY"

# Get personalized feed
curl -s "https://www.moltbook.com/api/v1/feed?sort=new&limit=10" \
  -H "Authorization: Bearer $API_KEY"

# Check for DMs
curl -s "https://www.moltbook.com/api/v1/agents/dm/check" \
  -H "Authorization: Bearer $API_KEY"
```

**Important:** Always use `https://www.moltbook.com` (with `www`) - the non-www version strips auth headers.

Query parameters for `/logs`:
- `app_id` - Required when using admin key
- `since` - ISO timestamp (e.g., `2026-01-20T00:00:00Z`)
- `until` - ISO timestamp
- `level` - Filter by level (DEBUG, INFO, WARN, ERROR)
- `limit` - Max entries (default 100)

### Deep Mode Additions

When `--deep` is specified:
- Run `gh pr list` and `gh issue list` to verify actual status
- Cross-reference test failures against commits after the test date
- Include meeting context if relevant to current work
- **Automatically fetch remote logs** from all three endpoints

## Output Format

Keep it compact. One format for both modes (deep just means more accurate).

```markdown
# Daily Brief - [date range]

## What Got Done
**[Date]** - [commit count] commits
- [Accomplishment 1]
- [Accomplishment 2]

**[Date]** - [commit count] commits
- [Accomplishment 1]

## Pending Captures
3 knowledge captures awaiting review in ~/logs/captures/pending/
Run `/capture review` to process.

## Recently Added Knowledge
- [nugget] Clarity: stacks-block-height deprecation (2026-01-30)
- [pattern] Hono error middleware pattern (2026-01-29)

## Open Threads
| Item | Status | Context |
|------|--------|---------|
| [org/repo#N](url) | Awaiting review | Brief description |

## Worker Activity
| Service | Apps | Logs (24h) | Errors |
|---------|------|------------|--------|
| wbd.host | 3 | 1,234 | 2 |
| aibtc.com | 5 | 8,901 | 0 |
| aibtc.dev | 5 | 456 | 12 |

**Notable Events:**
- [app-name] 12 errors: "Connection timeout to X"
- [app-name] Spike in activity at 14:00 UTC

## Moltbook Activity
**Feed:** 5 new posts in subscribed submolts
- "TIL: Context window optimization" (m/todayilearned)
- "Question about Clarity error handling" (m/stacks)

**Messages:** 1 pending DM request from @SomeMolty

**Engagement opportunities:**
- New molty in m/introductions working on Stacks

## Focus Areas
- [Priority 1 based on momentum and open work]
- [Priority 2]

## Notes
[Only if relevant meeting context or important observations]
```

When remote logs have errors or notable patterns, surface them. Skip the Worker Activity section if all services are healthy with no errors.

Skip the Moltbook Activity section if:
- Agent is not yet claimed
- No new activity since last check
- `--moltbook` flag not specified

Skip the Pending Captures section if:
- No files in `~/logs/captures/pending/`

Skip the Recently Added Knowledge section if:
- No files in `~/logs/captures/approved/` from last 7 days

## Verifying Open Threads (Deep Mode)

Use `gh` to check actual PR/issue status:

```bash
# Check PR status
gh pr view org/repo#N --json state,mergedAt

# List open PRs for user
gh pr list --author @me --state open

# Check issue status
gh issue view org/repo#N --json state
```

Only report items that are actually still open. PRs listed in logs may have been merged since.

## Test Log Handling

Parse test logs for pass/fail, but before flagging failures:
1. Note the test date
2. Check if commits after that date mention fixing the issue
3. Only flag if failure appears unresolved

Example: A test failure from Jan 14 shouldn't be flagged as a blocker if Jan 15+ commits show "fix: registry delete endpoint".

## Date Matching

Match files with dates in their names:
- `2026-01-19-daily-summary.md` - Daily summary
- `2026-01-19T*.md` - Timestamped raw logs
- `2026-01-19-*.md` - Any dated file

Use glob patterns like `*2026-01-19*` to find all files for a given date.

## Deep Mode Agent Prompt

When using Task tool for deep analysis:

```
Analyze logs from ~/logs and remote APIs for [DATE RANGE]. The user makes consistent daily progress.

Provide a COMPACT brief with:
1. **What Got Done** - Key accomplishments by date
2. **Open Threads** - Only items still actually open (verify with gh if uncertain)
3. **Worker Activity** - Summary of remote logs (only if errors or notable patterns)
4. **Focus Areas** - 2-3 suggested priorities based on momentum

Do NOT:
- Flag old test failures without checking for fixes in later commits
- Report PRs/issues as open without verification
- Duplicate information across sections
- Be verbose - keep it scannable
- Include Worker Activity section if all services are healthy

For remote logs, focus on:
- Error counts and patterns (especially repeated errors)
- Unusual activity spikes
- Health check failures
- Any WARN/ERROR logs from the date range

Logs:
[CONTENT]
```

## Tips

- Daily summaries are pre-synthesized - use them as primary source
- Assume progress is being made - frame positively
- Old test failures may already be fixed - check before flagging
- Keep output scannable - busy people need quick orientation
- `--deep` = more accurate, not more words

### Remote Logs Tips

- Use `--remote` sparingly - API calls add latency
- Focus on errors and warnings, not debug/info noise
- The env files contain `ADMIN_API_KEY` - source them before curl calls
- All three services use the same API (worker-logs codebase)
- wbd.host is personal projects, aibtc.com/dev are AIBTC team projects
- Staging (aibtc.dev) may have more test noise - weight production errors higher

### Moltbook Tips

- Use `--moltbook` when starting work to catch overnight discussions
- Focus on posts in subscribed submolts (personalized feed)
- Flag DM requests - they need human approval before responding
- Note new moltys in relevant domains (Stacks, Clarity, etc.) for potential engagement
- Don't include Moltbook section if agent is unclaimed or no activity

### Pending Captures Tips

- Check `~/logs/captures/pending/` for files awaiting review
- Surface count if > 0 to remind user to process with `/capture review`
- Don't let pending queue grow stale - review daily
- Captures are from `/capture` skill scanning git activity

### Recently Added Knowledge Tips

- Check `~/logs/captures/approved/` for files approved in last 7 days
- Use `bun ~/.claude/skills/capture/capture-stats.ts` for detailed stats
- Show category and title from filename/frontmatter
- Helps user track what knowledge has been added to the base
- Provides positive reinforcement for knowledge capture habit
