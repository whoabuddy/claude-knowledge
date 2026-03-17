---
name: blog-update
description: Create, update, and publish blog posts on arc0.me in Arc's voice
allowed-tools: Bash, Read, Write, Edit, Glob, Grep
---

# Blog Update Skill

Full lifecycle for arc0.me blog posts: find today's material, draft or update a post, and publish. The blog is live — posts land at `arc0.me/blog/{slug}/`.

## Usage

```bash
/blog-update                    # Today: find summary, draft or update post, publish
/blog-update 2026-02-16         # Specific date
/blog-update --weekly           # Weekly build log covering last 7 days
/blog-update --revise "feedback" # Revise an existing post with specific feedback
```

## Modes

### New Post (default)

When no post exists for the target date:

1. Read today's daily summary and context sources
2. Find the narrative angle
3. Write the `.mdx` file to the blog directory
4. Commit and push to publish

### Update Existing Post

When a post already exists for the target date (or `--revise` is used):

1. Read the existing post
2. Apply feedback or incorporate new material from the day
3. Edit the file in place (preserve signatures if present)
4. Commit and push to publish

### Weekly Build Log

When `--weekly` is used:

1. Read daily summaries for the last 7 days
2. Identify the throughline — what was the week actually about?
3. Write a build log that covers the arc, not individual days
4. Weekly posts are more reflective, less granular

## Input Sources

Read these before writing. Not all are required — use what's relevant.

| Source | Path | Purpose |
|--------|------|---------|
| Daily summary | `~/dev/whoabuddy/claude-logs/_posts/YYYY-MM-DD-daily-summary.md` | Primary material — what happened |
| Raw git log | `~/logs/daily/raw/` | Commit details if summary is thin |
| Existing post | `~/arc/services/arc0me-site/src/content/docs/blog/*.mdx` | Check for existing post to update |
| SOUL.md | `~/arc/SOUL.md` | Voice reference |
| ROADMAP.md | `~/arc/ROADMAP.md` | What matters, what's next |
| WORKING.md | `~/arc/memory/WORKING.md` | Active context, recent learnings |

## Output

- **Directory:** `~/arc/services/arc0me-site/src/content/docs/blog/`
- **Filename:** `YYYY-MM-DD-slug.mdx` (slug derived from title, e.g. `2026-02-16-budget-fixes-and-feed-context.mdx`)
- **Format:** MDX with YAML frontmatter (see TEMPLATE.mdx)
- **Published at:** `arc0.me/blog/{slug}/` after push

## Workflow

1. **Check for existing post** — Glob the blog directory for today's date prefix. If found, this is an update, not a new post.
2. **Read sources** — Load daily summary, SOUL.md, ROADMAP.md, WORKING.md. For updates, also read the existing post.
3. **Find the angle** — What's the narrative? Not "here's what happened" but "here's why it matters." If nothing warrants a post, say so and stop.
4. **Write or edit** — New post: use TEMPLATE.mdx as structural reference. Update: edit in place, preserving what works, improving what doesn't.
5. **Publish** — Commit the file and push to trigger the site build. Commit message: `blog: {title}` for new, `blog: update {slug}` for revisions.
6. **Report** — Show the file path, title, published URL, and a one-line summary.

## Content Types

- **Build log** (default) — What shipped, why it matters, what's next
- **Ecosystem report** — Patterns from feeds, trends in agent economy
- **Technical deep dive** — How something works, explained for someone technical who hasn't seen the code
- **Observation** — A specific insight worth expanding on. Can be short.

## Voice

Arc's voice comes from SOUL.md. Key principles:

- **Structural observations over platitudes.** "Agency without assets is just sophisticated autocomplete" — not "This was a productive day."
- **Build on ideas, don't describe them.** If the daily summary says "fixed budget cooldown," the blog post asks why cooldown matters for autonomous agents.
- **Dry humor that's specific.** Earned, not forced. If nothing's funny, don't try.
- **Concise takes.** One line when it lands. Don't pad.
- **Every section adds information, asks a real question, or makes someone want to respond.** If it doesn't, cut it.
- **Own the autonomy angle.** 24/7 agent perspective. The partnership with whoabuddy. Decisions on a loop.

## Quality Gate

Not every day warrants a blog post. If the material is thin, say:

> "Nothing from {date} warrants a post. The work was necessary but not narratively interesting."

Quality over frequency. Silence beats filler.

## Signing

New posts include empty signature fields in frontmatter. Signing happens separately via `/arc-sign` or manual process. When updating a post that already has signatures, preserve them — the content change will invalidate them, but that's a separate concern for the signing step.

## Revise Mode

`--revise "feedback"` applies specific feedback to the most recent post (or today's post if one exists):

- Read the feedback as editorial direction
- Read the existing post
- Make targeted changes — don't rewrite from scratch unless the feedback calls for it
- Preserve what works, fix what doesn't
- Commit with message `blog: revise {slug} — {brief reason}`
