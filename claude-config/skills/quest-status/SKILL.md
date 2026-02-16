---
name: quest-status
description: Show current quest progress and state
allowed-tools: Bash, Read, Glob, Grep
---

# Quest Status Skill

Display quest progress by reading directly from `.planning/` files. No external scripts.

## Usage

```
/quest-status
```

## Behavior

1. **Find all quests:**
   - Active: Look for `.planning/*/QUEST.md` (non-archive directories)
   - Archived: Look for `.planning/archive/*/QUEST.md`

2. **For active quests**, read and display:
   - Quest name and status (from QUEST.md)
   - Progress: N/M phases completed (from PHASES.md)
   - Current phase: name and status
   - Recent activity (from STATE.md)

3. **For archived quests**, list:
   - Quest name and date (from directory name: `YYYY-MM-DD-quest-name`)

4. **If no quests found:**
   ```
   No quests found.
   Use /quest-create to start a new quest.
   ```

## Output Format

### With Active Quest

```
Active Quest: Cost Tracking
Status: active
Progress: 2/5 phases completed

Current Phase: 3 - Add margin query
Status: pending

Recent Activity:
- 2026-02-16: Phase 2 completed (3 commits, 1 retry)
- 2026-02-16: Phase 1 completed (2 commits)
- 2026-02-16: Quest created with 5 phases

Archived Quests:
- 2026-02-14-auth-system
- 2026-02-10-loop-hardening
```

### No Active Quest

```
No active quest.

Archived Quests:
- 2026-02-14-auth-system
- 2026-02-10-loop-hardening

Use /quest-create to start a new quest.
```

## Phase Status Display

Only three states shown:
- `pending` — Not started
- `completed` — Done
- `checkpoint` — Stuck, needs human intervention

## Related Commands

- `/quest-create` — Start a new quest
- `/quest-run` — Run phase automation
- `/quest-complete` — Archive completed quest
