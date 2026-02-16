---
name: quest-create
description: Create a new quest with phased execution plan
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Task
---

# Quest Create Skill

Create a new quest — a high-level goal broken into ordered phases for automated execution.

## Usage

```
/quest-create <goal description or context>
```

The user provides a goal/prompt. The quest-planner agent derives a quest name and phase breakdown.

## Behavior

1. **Check for active quests:**
   - Look for `.planning/*/QUEST.md` files with `Status: active`
   - If one exists: warn the user (don't block — multiple quests can coexist, only one runs at a time)
   - `.planning/archive/` is always preserved

2. **Spawn `quest-planner` agent** to analyze the goal:
   ```
   Task tool with subagent_type: quest-planner
   ```
   The planner returns:
   - Quest name (short slug, e.g., "cost-tracking")
   - QUEST.md content (goal, repos, context)
   - PHASES.md content (ordered phases with goals)

3. **Create quest directory:** `.planning/YYYY-MM-DD-<quest-name>/`
   - Date prefix uses today's date for chronological sorting
   - Quest name slug from planner output (lowercase, hyphenated)

4. **Write quest files:**
   - `QUEST.md` — Goal, linked repos, status (`active`), created date
   - `PHASES.md` — Ordered phases, all status `pending`
   - `STATE.md` — Current phase, activity log
   - `config.json` — `{"maxRetries": 3, "commitFormat": "conventional"}`
   - `phases/` — Empty directory for phase plans

5. **Add `.planning/` to `.gitignore`** if not already present

6. **Display** quest summary and next steps

## Output Files

### QUEST.md
```markdown
# Quest: Quest Name

**Goal:** Goal description here.

**Status:** active

**Repos:**
- /path/to/repo (primary)

**Created:** YYYY-MM-DD

---

## Context

Detailed context from planner analysis.

## Key Dependencies

Phase dependency notes if any.
```

### PHASES.md
```markdown
# Phases

## Phase 1: Name
Goal: What this phase achieves
Status: `pending`

## Phase 2: Name
Goal: What this phase achieves
Status: `pending`
```

Phase states: `pending` → `completed` (or `checkpoint` if stuck after maxRetries).

### STATE.md
```markdown
# Quest State

Current Phase: 1
Quest Status: active

## Activity Log

- YYYY-MM-DD: Quest created with N phases
```

### config.json
```json
{
  "maxRetries": 3,
  "commitFormat": "conventional"
}
```

## Directory Structure

```
.planning/
├── 2026-02-16-cost-tracking/
│   ├── QUEST.md
│   ├── PHASES.md
│   ├── STATE.md
│   ├── config.json
│   └── phases/
└── archive/
    ├── 2026-02-14-auth-system/
    └── 2026-02-10-loop-hardening/
```

## Prerequisites

- Goal description provided by user

## Next Steps

After creating a quest, use:
- `/quest-run` to run the automated phase loop
- `/quest-status` to check progress
