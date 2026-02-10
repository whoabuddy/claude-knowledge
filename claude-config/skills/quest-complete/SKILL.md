---
name: quest-complete
description: Mark the current quest as complete
allowed-tools: Bash, Read, Write, Edit
---

# Quest Complete Skill

Mark the current quest as complete and emit completion event.

## Usage

```
/quest-complete
```

## Behavior

1. Verify all phases are completed:
   - Read `PHASES.md` and check all phases have status `completed`
   - If any phases are incomplete, show warning and ask for confirmation
2. Update `QUEST.md`:
   - Set Status to `completed`
   - Add completion timestamp
3. Update `STATE.md`:
   - Add completion entry to decisions log
   - Record final stats (phases, retries, etc.)
4. Emit `quest_completed` event:
   ```bash
   ~/.claude/scripts/quest/emit-event.sh quest_completed '"questId":"<id>","name":"<name>","phasesCompleted":<n>,"totalRetries":<n>'
   ```
5. Archive the quest:
   - Create `.planning/archive/` if it doesn't exist
   - Move `.planning/` contents to `.planning/archive/<quest-name>/`
   - Keep `.planning/archive/` for future quests
6. Display completion summary

## Archiving

Completed quests are stored in `.planning/archive/<quest-name>/`:

```
.planning/
└── archive/
    ├── arc-productive-loop/
    ├── arc-self-audit/
    └── user-authentication/
```

This keeps the root directory clean while preserving quest history for reference.

## Completion Summary

```
Quest Complete: Implement User Authentication

Phases: 5/5 completed
Total Retries: 2
Duration: 3 days

XP Awarded: 500
- Base quest completion: 300
- Phase bonuses: 150
- Efficiency bonus: 50

Use /quest-create to start a new quest.
```

## Prerequisites

- Active quest (`.planning/` directory exists)
- Quest status is `active` (not already completed or paused)

## Incomplete Quest Warning

If phases remain incomplete:
```
Warning: 2 phases are not completed:
- Phase 4: Add password reset (executed)
- Phase 5: Write documentation (pending)

Complete anyway? This will mark all phases as skipped.
```
