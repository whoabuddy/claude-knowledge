# Claude Code Knowledge Base

This is the shared reference for team standards. See `README.md` for first-time setup instructions.

Your personal `~/.claude/CLAUDE.md` is generated from this file. Run `/setup update` to sync changes.

## Knowledge Base Structure

All persistent knowledge lives in the knowledge base repo:

| Directory | Purpose |
|-----------|---------|
| `context/` | Reference docs (APIs, language specs, standards) |
| `decisions/` | Architecture Decision Records (how we decided things) |
| `nuggets/` | Quick facts by topic (learned during sessions) |
| `patterns/` | Code patterns and gotchas |
| `runbook/` | Operational procedures (how to do things) |
| `claude-config/` | Shared agents and skills |

## Quick Facts

### Deployment & Build

- **Cloudflare**: Do NOT run `npm run deploy`. Use dry run to verify build, then commit and push for automatic deployment.
- **KV/D1 patterns**: When to reach for KV vs D1 vs `caches.default` vs Durable Objects vs `ratelimits` binding, with bad/good worked examples — `runbook/cloudflare-kv-d1-patterns.md`. Captures observability discipline (full event set monitoring, partial-hour D1 analytics anti-pattern) and the post-merge follow-up issue pattern.
- **Release Please**: Use for production repos - automates semver + changelog from conventional commits
  - Setup: `runbook/release-please-setup.md`
  - Requires: conventional commits, protected main branch, PR workflow

### Clarity / Stacks

- Clarity does NOT have a `lambda` keyword - use `define-private` for internal functions
- Always run `clarinet check` before committing contract changes
- Use `stacks-block-height` not `block-height` (legacy) for current block
- Token ops: check `tx-sender`; non-token guards: check `contract-caller`
- Use `try!` for error propagation, `unwrap!` only when certain of value
- Full reference: `context/clarity-reference.md`
- Code patterns: `patterns/clarity-patterns.md`

### Clarity Testing

- **Clarinet**: Local binary for `clarinet check` (syntax), `clarinet format` (lint), deployment
- **Clarinet SDK**: TypeScript testing with vitest - use `npm test`
  - NO `beforeAll`/`beforeEach` - simnet resets each session
  - Use arrange-act-assert format, prefer functions over arrow functions
  - Clarity values to JS: `cvToValue()`, `cvToJSON()`; use clarigen or secondlayer for type generation
- **Clarunit**: Test Clarity with Clarity - special cases, pure logic testing
- **RV (Rendezvous)**: Property-based fuzzing - essential for treasuries, DAOs, battle-grade contracts
- **Stxer**: Mainnet fork simulation - use pre-mainnet for governance flows
- Testing guide: `patterns/clarity-testing.md`
- Workflow: `runbook/clarity-development.md`
- Example repo: https://github.com/friedger/clarity-ccip-026

### Stacks Signing Standards

- **SIWS** (Sign In with Stacks): Wallet authentication for web apps (off-chain only)
  - Guide: `context/siws-guide.md`
- **SIP-018**: Signed structured data for on-chain verification (meta-tx, permits, voting)
  - Reference: `context/sip-018.md`

### Git Workflow

- All repos in `~/dev/` named as `org/repo` to match GitHub
- Forks: set `upstream` remote via `gh repo fork` or manually
- Commit messages follow conventional commits: `type(scope): message`
- Always rebase feature branches on main before PR
- Delete branches after merge (local and remote)

### GitHub CLI

- Use `issues` not `openIssues` when querying repos via `gh` - field names differ from web interface
- Always verify field names against actual API responses before using in scripts

## Adding Knowledge

Use `/learn` to capture new knowledge during sessions:
```
/learn cloudflare: always use wrangler dev before deploying
/learn clarity: use (try!) not (unwrap!) for recoverable errors
```

Knowledge is categorized and stored in the appropriate `nuggets/` file.

## External APIs

- **Tenero API** (formerly STXTools): Market data, trading analytics, wallet/token data for Stacks
  - Base URL: `https://api.tenero.io`
  - Docs: https://docs.tenero.io/
  - Full reference: `context/tenero-api.md`

## Local Resources (Personal)

These paths vary per user. Common repos to clone:

| Repo | Purpose |
|------|---------|
| `clarity-lang/book` | Clarity language reference |
| `hirosystems/stacks.js` | Stacks.js library |
| `hirosystems/clarinet` | Clarinet framework |
| `stacks-network/docs` | Stacks documentation |
| `stx-labs/security-handbook` | Security best practices |

### Logs Directory (~/logs)

Central location for session logs, daily summaries, meeting notes, and project log symlinks.

- `daily/` - Curated summaries + `raw/` automated outputs
- `meetings/` - Meeting agendas and notes
- `projects/` - Symlinks to repo log directories
- `archive/` - Historical data

**Skills:** `/daily` generates raw summaries, `/daily-brief` reads logs for orientation

**Full documentation:** `runbook/logs-structure.md`

---

*Generated from claude-knowledge. Run `/setup update` to sync shared sections.*
