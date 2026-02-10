---
name: quest-create
description: Create a new quest with phased execution plan
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Task
---

# Quest Create Skill

Create a new quest — a high-level goal broken into ordered phases with plan-execute-verify lifecycle.

## Usage

```
/quest-create "Goal description"
```

## Behavior

1. Read the goal from the user's input
2. Spawn `quest-planner` agent to break the goal into phases:
   ```
   Task tool with subagent_type: quest-planner
   ```
3. Create `.planning/` directory in the project root with:
   - `QUEST.md` — Goal, linked repos, status, created date
   - `PHASES.md` — Ordered phase list with status and goals
   - `STATE.md` — Current position (phase 1, pending), decisions log
   - `config.json` — Default settings: `{"maxRetries": 3, "autoRetry": true, "commitFormat": "conventional", "rpgNotify": true}`
   - `phases/` — Empty directory for phase plans
4. Add `.planning/` to `.gitignore` if not already present
5. Emit `quest_created` event:
   ```bash
   ~/.claude/scripts/quest/emit-event.sh quest_created '"questId":"<id>","name":"<name>","description":"<desc>","phases":[{"id":"<id>","name":"<name>","order":1}],"repos":["<repo>"]'
   ```
6. Display quest summary and next steps

## Output Files

### QUEST.md
```markdown
# Quest Name

Goal description here.

Status: active
Created: YYYY-MM-DD
Repos: repo-name

## Goal

Detailed goal description from planner analysis.
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

### STATE.md
```markdown
# Quest State

Current Phase: 1
Phase Status: pending
Retry Count: 0

## Decisions Log
```

## Prerequisites

- No active quest files (`.planning/QUEST.md` should not exist)
- Goal description provided

Note: `.planning/archive/` may exist from previous quests and should be preserved.

## Next Steps

After creating a quest, use:
- `/quest-plan` to plan the first phase
- `/quest-run` to run the full plan-exec-verify loop
