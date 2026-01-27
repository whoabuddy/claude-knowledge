---
name: quest
description: Create and manage a cross-repo quest with phased execution
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Task
---

# Quest Skill

Create and manage quests — high-level goals broken into ordered phases with plan-execute-verify lifecycle.

## Usage

```
/quest "Goal description"     Create a new quest
/quest status                 Show current quest progress
/quest complete               Mark quest as complete
/quest pause                  Pause the active quest
/quest resume                 Resume a paused quest
/quest archive                Archive completed quest
```

## Creating a Quest

1. Read the goal from the user's input
2. Spawn `quest-planner` agent (subagent_type: general-purpose with quest-planner prompt) to break the goal into phases
3. Create `.planning/` directory in the project root with:
   - `QUEST.md` — Goal, linked repos, status, created date
   - `PHASES.md` — Ordered phase list with status and goals
   - `STATE.md` — Current position (phase 1, pending), decisions log
   - `config.json` — Default settings: `{"maxRetries": 3, "autoRetry": true, "commitFormat": "conventional", "rpgNotify": true}`
   - `phases/` — Empty directory for phase plans
4. Add `.planning/` to `.gitignore` if not already present
5. Emit `quest_created` event to RPG server:
   ```bash
   curl -s -X POST http://localhost:4011/event \
     -H "Content-Type: application/json" \
     -d '{"type":"quest_created","questId":"<id>","name":"<name>","description":"<desc>","phases":[{"id":"<id>","name":"<name>","order":1}],"repos":["<repo>"]}'
   ```

## Status Subcommand

Read `.planning/QUEST.md`, `PHASES.md`, and `STATE.md`. Display:
- Quest name and status
- Phase progress (N/total completed)
- Current phase name and status
- Retry count if in verification loop

## Complete Subcommand

1. Update QUEST.md status to `completed`
2. Update STATE.md with completion timestamp
3. Emit `quest_completed` event

## Pause/Resume

Update QUEST.md and STATE.md status. Emit appropriate events.

## Cross-Repo

QUEST.md lists all repos involved. Use the `repos` field to track which companions should receive XP for quest events.

## Quick Reference

- Runbook: `runbook/quest-workflow.md`
- ADR: `decisions/0003-plan-execute-verify.md`
- Planner agent: `claude-config/agents/quest-planner.md`
