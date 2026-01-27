---
name: verify-phase
description: Verify phase execution and loop until complete or checkpoint to human
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Task
---

# Verify Phase Skill

Verify that a phase was executed correctly using goal-backward verification. Automatically retries on failure.

## Usage

```
/verify-phase            Verify the current executed phase
/verify-phase 2          Verify a specific phase by number
```

## Behavior

1. Read `.planning/PHASES.md` to identify the target phase
2. Verify the phase has been executed (status `executed` or `retrying`)
3. Spawn `phase-verifier` agent with:
   - Phase goal from PHASES.md
   - PLAN.md task definitions
   - Current codebase state
4. Receive verification result: `VERIFICATION PASSED` or `GAPS FOUND`

### On PASS

1. Write results to `phases/NN-name/VERIFY.md`
2. Update PHASES.md phase status to `completed`
3. Update STATE.md with verification results
4. Emit `phase_verified` event (result: pass):
   ```bash
   curl -s -X POST http://localhost:4011/event \
     -H "Content-Type: application/json" \
     -d '{"type":"phase_verified","questId":"<id>","phaseId":"<id>","result":"pass","retryCount":0}'
   ```
5. If all phases complete, emit `quest_completed` event
6. Otherwise, advance STATE.md to next phase

### On FAIL

1. Write diagnosis to `phases/NN-name/VERIFY.md`
2. Read `config.json` for maxRetries (default 3)
3. If retryCount < maxRetries:
   a. Update PHASES.md status to `retrying`
   b. Increment retryCount in STATE.md
   c. Emit `phase_retrying` event:
      ```bash
      curl -s -X POST http://localhost:4011/event \
        -H "Content-Type: application/json" \
        -d '{"type":"phase_retrying","questId":"<id>","phaseId":"<id>","retryCount":<n>,"diagnosis":"<summary>"}'
      ```
   d. Re-run `/execute-phase` with diagnosis as additional context
   e. Re-run `/verify-phase` after execution completes
4. If retryCount >= maxRetries:
   a. Emit `phase_verified` event (result: fail)
   b. Present full diagnosis to user
   c. Wait for human intervention

## Loop-Until-Complete

```
execute → verify → [PASS] → next phase
                → [FAIL] → re-execute with diagnosis → verify again
                → [FAIL x3] → checkpoint to human
```

## Prerequisites

- Active quest with executed phase
- Phase status must be `executed` or `retrying`

## Quick Reference

- Runbook: `runbook/quest-workflow.md`
- Verifier agent: `claude-config/agents/phase-verifier.md`
