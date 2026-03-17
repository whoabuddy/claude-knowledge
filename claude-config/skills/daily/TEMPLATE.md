---
title: "Daily Summary - {DATE}"
date: {DATE}
categories: [daily-summary]
tags: [commits, github, {relevant-tags}]
---

# Daily Summary - {DATE}

> Last updated: {TIMESTAMP}

## TL;DR

{1-2 sentences summarizing the day for non-technical readers. Focus on outcomes, not activities.}

## Highlights

{2-4 sentences on main themes and accomplishments. What actually moved forward today? What decisions were made?}

## Commits

| Repo | Commits | Focus |
|------|:-------:|-------|
| [{org/repo}](https://github.com/{org/repo}) | {n} | {What changed and why} |

{If repos were added to ~/dev, include a table:}

### Added Repos

| Repo | Type | Purpose |
|------|------|---------|
| [{org/repo}](https://github.com/{org/repo}) | {Created/Cloned/Forked} | {Why - what you're building, exploring, or referencing} |

## Open Threads

{Track actionable items - things awaiting response, next steps, blockers. Only include if there's something to track.}

| Status | Item | Context |
|--------|------|---------|
| Awaiting review | [{org/repo}#N](url) | {what the PR does} |
| Filed | [{org/repo}#N](url) | {what needs to happen next} |
| Merged | [{org/repo}#N](url) | {why it matters} |
| Blocked | {thing} | {what's blocking and next step} |

Status options: `Awaiting review`, `Filed`, `Merged`, `Closed`, `Blocked`, `In progress`

## Arc Activity

{Work done by arc0btc (Arc's GitHub account). Include when the raw data shows arc0btc pushes, PRs, issues, or repo creation. Present alongside whoabuddy's work — this is the partnership in action.}

| Repo | Activity | Details |
|------|----------|---------|
| [{arc0btc/repo}](https://github.com/{arc0btc/repo}) | {Push/PR/Issue} | {What changed and why} |

## Also Today

{Capture work that doesn't show in git: codebase exploration, research, architecture discussions, debugging sessions, learning. Omit if empty.}

- {What you explored/researched and what you learned or decided}

## Stats

| Commits | Repos | PRs | Issues | Reviews |
|:-------:|:-----:|:---:|:------:|:-------:|
| {n} | {n} | {n} | {n} | {n} |

---

Template notes (remove in actual posts):
- Jekyll front matter is REQUIRED: title, date, categories, tags
- Tags should include repo names and key topics (e.g., x402, claude-rpg, citycoins)
- TL;DR is for sharing with non-technical teammates - outcomes not activities
- Highlights answer "what moved forward" not "what did I touch"
- Commits table: repo links, focus on "what and why"
- Open Threads: VERIFY PR status with `gh pr view` before listing - don't trust raw data
- Also Today: research, exploration, conversations - the non-git work
- Stats at bottom - reference data, not the headline
- Omit any section that would be empty
