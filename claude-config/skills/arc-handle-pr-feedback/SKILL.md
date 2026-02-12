---
name: arc-handle-pr-feedback
description: Read PR review comments, fix code issues, commit, reply, and resolve threads
allowed-tools: Bash, Read, Write, Edit, Glob, Grep
---

# Handle PR Feedback

Automates the full PR review feedback loop: read comments, fix code, commit, reply with commit ref, and resolve threads.

## Usage

```bash
/arc-handle-pr-feedback           # Auto-detect PR from current branch
/arc-handle-pr-feedback 35        # Explicit PR number
/arc-handle-pr-feedback 35 --dry-run  # Preview without committing or replying
```

## Workflow

1. **Detect PR** — use argument or `gh pr view --json number` from current branch
2. **Fetch review comments** — `gh api repos/{owner}/{repo}/pulls/{pr}/comments`
3. **Triage each comment** into one of three categories:
   - **Code fix** — requires a file change (has `path` + `line` in the review comment)
   - **Acknowledge** — valid point but no code change needed (design choice, future work)
   - **Skip** — bot noise (Cloudflare deploy status, etc.) or already resolved
4. **For each code fix:**
   - Read the file at the referenced path
   - Apply the fix
   - Track which comments map to which files
5. **Commit** — single atomic commit with message:
   ```
   fix: address PR review feedback

   - [brief description of each fix]

   Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
   ```
6. **Push** to the PR branch
7. **Reply to each comment** via `gh api repos/{owner}/{repo}/pulls/{pr}/comments`:
   - Code fixes: `"Fixed in {short_sha} — {brief description}"`
   - Acknowledge: `"Acknowledged. {reason it's deferred or by-design}."`
8. **Resolve threads** — use GraphQL to mark each addressed thread as resolved

## Triage Rules

| Signal | Category | Action |
|--------|----------|--------|
| Comment has concrete code suggestion | Code fix | Apply fix |
| Comment identifies a real bug | Code fix | Fix bug |
| Comment asks for a missing feature/test | Acknowledge | Reply with plan |
| Comment is from a deploy bot | Skip | Ignore |
| Comment is already resolved | Skip | Ignore |
| Comment is purely informational | Skip | Ignore |

## Replying to Review Comments

The GitHub API for replying to review comments:

```bash
# Reply in-thread to a review comment
gh api repos/{owner}/{repo}/pulls/{pr}/comments \
  -f body="Fixed in abc1234 — description" \
  -F in_reply_to={comment_id}
```

**Important:** Use `in_reply_to` with the comment `id` (numeric), not `node_id`.

## Resolving Threads

After replying, resolve the thread via GraphQL:

```bash
gh api graphql -f query='
  mutation {
    resolveReviewThread(input: { threadId: "THREAD_NODE_ID" }) {
      thread { isResolved }
    }
  }
'
```

To get the thread node ID, use the review comment's thread context from:
```bash
gh api repos/{owner}/{repo}/pulls/{pr}/comments \
  --jq '.[] | {id, node_id, path, body}'
```

Or from the pull request review threads query:
```bash
gh api graphql -f query='
  query {
    repository(owner: "{owner}", name: "{repo}") {
      pullRequest(number: {pr}) {
        reviewThreads(first: 100) {
          nodes {
            id
            isResolved
            comments(first: 1) {
              nodes { databaseId body }
            }
          }
        }
      }
    }
  }
'
```

## Edge Cases

- **Multiple comments on same file:** Batch all fixes for that file before writing
- **Conflicting suggestions:** Flag for human review instead of guessing
- **Comment on deleted code:** Acknowledge, can't fix what's removed
- **Rate limits:** GitHub API allows 5000 req/hour, unlikely to hit for PR feedback

## Verification

After completing:
1. Run `npm run check` (or project-specific type check) to verify fixes compile
2. If check fails, fix the issue before pushing
3. Confirm all threads show replies on the PR

## Prerequisites

- `gh` CLI authenticated
- On a branch that has an open PR (or PR number provided)
- Repository is a GitHub repo with push access
