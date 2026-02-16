---
name: quest-complete
description: Mark the current quest as complete and archive it
allowed-tools: Bash, Read, Write, Edit, Glob
---

# Quest Complete Skill

Mark the active quest as complete and archive it.

## Usage

```
/quest-complete
```

## Behavior

1. **Find active quest:**
   - Look for `.planning/*/QUEST.md` files with `Status: active`
   - If none found: report no active quest
   - If multiple: ask user which to complete

2. **Check phase completion:**
   - Read PHASES.md and check all phases
   - If all phases are `completed`: proceed
   - If any phases are `pending` or `checkpoint`: warn and ask for confirmation
     ```
     Warning: 2 phases are not completed:
     - Phase 4: Add password reset (pending)
     - Phase 5: Write documentation (checkpoint)

     Complete anyway? Incomplete phases will be marked as skipped.
     ```

3. **Update quest files:**
   - `QUEST.md`: Set `Status: completed`, add `Completed: YYYY-MM-DD`
   - `STATE.md`: Add completion entry with summary

4. **Archive the quest:**
   - Create `.planning/archive/` if it doesn't exist
   - Move entire quest directory to `.planning/archive/`
   - e.g., `.planning/2026-02-16-cost-tracking/` → `.planning/archive/2026-02-16-cost-tracking/`

5. **Display completion summary:**
   ```
   Quest Complete: Cost Tracking

   Phases: 5/5 completed
   Total Retries: 2

   Archived to: .planning/archive/2026-02-16-cost-tracking/
   Use /quest-create to start a new quest.
   ```

## Prerequisites

- At least one quest directory exists in `.planning/`
- Quest status is `active`

## Related Commands

- `/quest-create` — Start a new quest
- `/quest-status` — Check progress
