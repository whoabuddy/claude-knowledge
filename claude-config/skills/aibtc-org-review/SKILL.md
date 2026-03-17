---
name: aibtc-org-review
description: Review open issues and PRs across aibtcdev repos with prioritized next steps
allowed-tools: Bash
---

# AIBTC Org Review

Scan aibtcdev GitHub repos for open issues, PRs, and fork sync status. Produce a prioritized summary with next steps.

## Usage

```bash
/aibtc-org-review       # Full org review
```

## Repos to Scan

```
landing-page
agent-news
aibtc-mcp-server
skills
x402-sponsor-relay
x402-api
worker-logs
```

## Fork Sync Check

`aibtcdev/loop-starter-kit` is a fork of `secret-mars/loop-starter-kit`. Check if the fork is behind upstream.

## Workflow

### Step 1: Gather data in parallel

Run these Bash commands **in parallel** (one call per repo):

For each repo in the list above:
```bash
gh issue list --repo aibtcdev/<repo> --state open --limit 50 2>&1
gh pr list --repo aibtcdev/<repo> --state open --limit 50 2>&1
```

Using `2>&1` captures errors gracefully — some repos may have issues disabled.

### Step 2: Check fork sync

```bash
gh api repos/aibtcdev/loop-starter-kit/compare/main...secret-mars:main --jq '{ahead_by: .ahead_by, behind_by: .behind_by, status: .status}' 2>&1
```

If this errors, try with `master` instead of `main` for either side.

### Step 3: Compile per-repo summaries

For each repo, create a section with:
- Issue count and PR count
- Table of open items (number, title, author, age)
- Note if issues are disabled or repo has zero activity (mark as "clean")

### Step 4: Generate cross-repo priority table

Create a **Next Steps** table sorted by impact. Apply these priority rules:

| Signal | Priority | Action |
|--------|----------|--------|
| Release-please PR open | High (quick win) | Merge to cut a release |
| PR that fixes an open issue | High | Review and merge |
| PR with approvals, no merge | High | Merge if CI passes |
| Stale PR (>30 days) | Medium | Ping author or close |
| Bug-labeled issue | Medium | Triage and assign |
| Feature request | Low | Backlog review |

### Step 5: Fork sync summary

Report whether `loop-starter-kit` is in sync, behind, or ahead of upstream. If behind, note how many commits and suggest a sync PR.

### Step 6: Feature parity check (skills ↔ aibtc-mcp-server)

Compare capabilities between the `skills` repo and `aibtc-mcp-server` to identify gaps.

**6a. Get skill names from the skills repo:**
```bash
ls ~/dev/aibtcdev/skills/ -d */ 2>/dev/null | grep -v node_modules | grep -v src | grep -v scripts | sed 's/\///'
```

**6b. Get MCP tool categories from the MCP server:**
```bash
ls ~/dev/aibtcdev/aibtc-mcp-server/src/tools/*.tools.ts 2>/dev/null | sed 's/.*\///' | sed 's/\.tools\.ts//'
```

**6c. Cross-reference and report:**

Build a table comparing skill areas to MCP tool groups. Flag:
- **Skills with no MCP tools**: Skill exists but no corresponding MCP tool (potential MCP server gap)
- **MCP tools with no skill**: MCP tool exists but no corresponding skill (potential skills repo gap)
- **Linked pairs**: Both exist — note whether SKILL.md has an `mcp-tools` field and whether the MCP tool description references the skill

Use fuzzy matching on names (e.g., skill `btc` ↔ MCP tools in `bitcoin.tools.ts`, skill `stacking` ↔ MCP tools in `stacking.tools.ts`).

## Output Format

```markdown
# AIBTC Org Review — <date>

## Per-Repo Status

### <repo-name>
Issues: N open | PRs: N open

| # | Title | Type | Author | Age |
|---|-------|------|--------|-----|
| ... |

(Repeat for each repo)

## Fork Sync: loop-starter-kit
Status: <in-sync | behind N commits | ahead N commits>
Action: <none needed | create sync PR>

## Priority Next Steps

| Priority | Repo | Item | Action |
|----------|------|------|--------|
| ... |

## Feature Parity: skills ↔ aibtc-mcp-server

| Skill | MCP Tool Group | Status | Gap |
|-------|---------------|--------|-----|
| btc | bitcoin.tools | Linked | — |
| stacking | stacking.tools | Linked | — |
| nostr | signing.tools | Partial | skill has nostr-specific features not in MCP |
| ... |

### Gaps to Address
- **Skills missing MCP tools:** <list>
- **MCP tools missing skills:** <list>
- **Cross-reference status:** N/M skills have `mcp-tools` field, N/M MCP tools reference skills

## Summary
- N total open issues across org
- N total open PRs across org
- Key themes or blockers
- Feature parity: N linked, N skill-only, N mcp-only
```
