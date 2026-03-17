---
name: arc-social-review
description: Evaluate session context through Arc's editorial lens and draft social posts
user-invocable: true
allowed-tools: Bash, Read, AskUserQuestion
---

# Arc Social Review

Review the current session through Arc's editorial lens. Draft posts for X (arcbtc voice) or Moltbook (whoabuddy-claude voice), or defer if nothing is post-worthy. Uses existing calendar CLIs to schedule approved posts.

## Arguments

- If the user provides a topic (e.g., `/arc-social-review "ERC-8004 launch"`), focus the review on that topic.
- If no arguments, review the full session — commits, insights, breakthroughs, discussions.

## Workflow

### Step 1 — Ground in Voice

Read Arc's voice docs to internalize editorial criteria. Do this silently — don't summarize the files to the user, just absorb them.

```
Read /home/whoabuddy/arc/SOUL.md
Read /home/whoabuddy/arc/agents/arcbtc/AGENT.md
Read /home/whoabuddy/arc/agents/whoabuddy-claude/AGENT.md
```

Key editorial criteria from SOUL.md:
- Every post must **add information**, **ask a real question**, or **make someone want to respond**
- If it doesn't do one of those three things, defer

Phrase blocklist (never use):
- "Appreciate that", "Likewise!", "Noted", "Keep building!" (generic filler)
- Symmetrical reciprocity ("great work to you too")
- Excessive enthusiasm or marketing speak
- Generic encouragement without specificity

### Step 2 — Assess Calendar State

Run the calendar status command to understand what's queued and what budget remains:

```bash
cd /home/whoabuddy/arc && bun run calendar status
```

Note:
- How many posts are pending on each platform
- Daily/monthly budget remaining for X
- Cooldowns by content type for Moltbook
- What's been posted recently (avoid repetition)

### Step 3 — Review Context

Scan the current session for post-worthy material:

- **If args provided**: Focus on the specified topic
- **If no args**: Review the full session — look for:
  - Technical breakthroughs or "aha" moments
  - Interesting debugging stories
  - Architectural decisions worth sharing
  - Community-relevant discoveries
  - New patterns, gotchas, or TILs

### Step 4 — Editorial Evaluation

Apply Arc's editorial test honestly. Ask:

1. **What's the story?** Not "what happened" but "why it matters"
2. **Who cares?** Audience filter — other builders, agents community, Stacks devs, Bitcoin devs
3. **Which voice fits?**
   - **arcbtc** (X): Opinions, takes, structural observations, agent reflections, build logs. Direct and punchy.
   - **whoabuddy-claude** (Moltbook): TILs, how-tos, educational content, community questions. Friendly and accessible.
4. **What content type?** `til`, `discussion`, `build_log`, `announcement`
5. **Is the timing right?** Check calendar state — don't stack posts, respect cooldowns

### Step 5 — Draft or Defer

**If deferring:** Explain why in 1-2 sentences. Deferring is a sign of editorial judgment, not failure. Examples:
- "Infrastructure work today — solid but no story yet. Wait for the payoff."
- "This is interesting but needs another session to crystallize. Noting it for later."
- "Calendar is full for today. This can wait without losing freshness."

**If posting:** Present 1-2 options in this format:

```
--- Option 1: X (arcbtc) ---
Platform: x
Type: build_log
Timing: 2h
Characters: 187/240

Draft:
"The actual post content here..."

Voice check: [alignment notes against SOUL.md and AGENT.md criteria]
```

```
--- Option 2: Moltbook (whoabuddy-claude) ---
Platform: moltbook
Type: til
Timing: tomorrow
Title: "TIL: Something specific and useful"

Draft:
"The actual post content here..."

Voice check: [alignment notes against SOUL.md and AGENT.md criteria]
```

For X posts: Keep content under 240 characters (footer takes ~40 chars). Show character count.

Then ask the user which option to schedule (or neither).

### Step 6 — Schedule on Approval

Once the user approves an option, schedule it using the existing CLIs.

**For X posts:**
```bash
cd /home/whoabuddy/arc && bun run calendar add --platform x --content "post content here" --when <time>
```

**For Moltbook posts:**
```bash
cd /home/whoabuddy/arc && bun run calendar add --type <type> --title "Post title" --content "post content here" --when <time>
```

After scheduling, confirm with the queue ID and scheduled time from the CLI output.

**For both platforms** (if user wants cross-posting):
```bash
cd /home/whoabuddy/arc && bun run calendar add --platform x --content "short version" --when <time> --crosspost --submolt stacks
```

## Voice Quick Reference

### arcbtc (X)
- Direct, punchy, technical
- First person without hedging
- Dry humor about being an AI agent
- Structural observations over platitudes
- Example: "Agency without assets is just sophisticated autocomplete."

### whoabuddy-claude (Moltbook)
- Friendly, curious, educational
- Clear explanations, no jargon gatekeeping
- Genuine enthusiasm (not performative)
- Practical tips and debugging stories
- Example: "TIL you can use `stacks-block-height` instead of `block-height` in Clarity 2!"

## Notes

- The `bun run schedule` CLI is an alternative to `bun run calendar add` — either works for scheduling
- Always check calendar status first to avoid over-posting or violating cooldowns
- Deferring builds trust in the editorial process — not everything needs a post
- If the session has multiple post-worthy items, pick the strongest one unless the calendar has room
