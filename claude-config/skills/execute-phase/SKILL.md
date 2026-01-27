---
name: execute-phase
description: Execute a planned phase with fresh subagent contexts and atomic commits
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Task
---

# Execute Phase Skill

Execute a planned phase by spawning fresh executor subagents for each task group.

## Usage

```
/execute-phase           Execute the current planned phase
/execute-phase 2         Execute a specific phase by number
```

## Behavior

1. Read `.planning/PHASES.md` to identify the target phase
2. Verify the phase has status `planned` (has a PLAN.md)
3. Read `phases/NN-name/PLAN.md`
4. Emit `phase_executing` event:
   ```bash
   curl -s -X POST http://localhost:4011/event \
     -H "Content-Type: application/json" \
     -d '{"type":"phase_executing","questId":"<id>","phaseId":"<id>","phaseName":"<name>"}'
   ```
5. For each task group, spawn `phase-executor` agent via Task tool with:
   - The PLAN.md content
   - Fresh 200k context (this is the key context rot prevention)
   - Any diagnosis from previous failed verification (if retrying)
6. Collect structured results from executor
7. Update PHASES.md status to `executed`
8. Update STATE.md with execution results (commits, files changed, issues)

## Orchestrator Rules

The orchestrating skill stays **lean** (under 30% context):
- Only read PLAN.md and executor results
- Never read full source files directly
- Route between executors, don't execute yourself
- Log decisions to STATE.md

## Deviation Handling

Executors follow deviation rules from the runbook:
- **Auto-fix**: bugs, missing deps, blocking issues
- **Checkpoint**: architectural changes, scope creep — executor stops, reports back

If an executor checkpoints, present the issue to the user and wait for direction before continuing.

## Prerequisites

- Active quest with planned phase
- Phase status must be `planned` (or `retrying` for re-execution)

## Quick Reference

- Runbook: `runbook/quest-workflow.md`
- Executor agent: `claude-config/agents/phase-executor.md`
