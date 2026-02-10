---
name: quest-run
description: Run quest phases with automated plan-exec-verify loop
allowed-tools: Bash, Read, Task
---

# Quest Run Skill

Automates the plan-exec-verify loop for quest phases. Each phase runs in a **fresh subagent context** to prevent token accumulation across phases.

## Usage

```
/quest-run              Run from current phase to completion
/quest-run 3            Start from phase 3
/quest-run 3-5          Run phases 3 through 5 only
```

## Behavior

1. **Validate** active quest exists (exit if not — use `/quest-create` first)
2. **Read** quest state from `.planning/STATE.md` and `.planning/PHASES.md`
3. **Determine** phase range:
   - No argument: current phase from STATE.md to last phase
   - Single number: start from that phase
   - Range (N-M): run only phases N through M
4. **For each phase** in range:

   a. Read phase status from PHASES.md — skip if `completed`

   b. **Spawn fresh subagent** via Task tool:
      ```
      Task tool with subagent_type: phase-executor
      Prompt: "Execute phase N of quest. Run plan-exec-verify cycle.
               Read .planning/ for context. Write results back.
               Return: {status, commits, retries, summary}"
      ```

   c. **On subagent return**:
      - If status=`completed`: continue to next phase
      - If status=`checkpoint`: stop loop, display diagnosis to user
      - If status=`error`: stop loop, report error

5. **When all phases complete**: display summary and suggest `/quest-complete`

## Context Isolation

**Why subagents per phase?** Each phase can consume significant context during planning (codebase exploration), execution (file edits, test runs), and verification (artifact checking). Running all phases in one context leads to token exhaustion.

**How it works:**
- The orchestrator (this skill) stays lean — only reads STATE.md/PHASES.md
- Each phase runs in a fresh 200k context subagent
- Subagent reads quest state from files, does all work, writes results back
- Only a summary returns to the orchestrator
- Files in `.planning/` serve as memory between phases

## Subagent Prompt Template

For each phase, spawn with this prompt:

```
Execute phase {N} of the active quest.

## Your Task
Run the full plan-exec-verify cycle for this phase:
1. If phase status is `pending`: plan the phase (research, create PLAN.md)
2. If phase status is `planned` or `retrying`: execute the tasks (make commits)
3. If phase status is `executed`: verify completion

## Context Files
- `.planning/QUEST.md` — Overall goal
- `.planning/PHASES.md` — Phase list and status
- `.planning/STATE.md` — Current position, retry count
- `.planning/config.json` — Settings (maxRetries: 3)
- `.planning/phases/{NN}-{name}/PLAN.md` — Task definitions (if planned)
- `.planning/phases/{NN}-{name}/VERIFY.md` — Diagnosis (if retrying)

## Rules
- Make atomic commits per task (conventional commit format)
- On verification failure: re-exec with diagnosis, up to maxRetries
- On 3rd failure: return status=checkpoint with full diagnosis
- Update PHASES.md and STATE.md after each step
- **Before implementing crypto, signing, or wallet operations**: Check available MCP tools (mcp__aibtc__*) first. Use existing tools rather than reimplementing.

## Return Format
Return a JSON summary:
{
  "status": "completed" | "checkpoint" | "error",
  "phase": N,
  "commits": ["sha1: message", ...],
  "retries": 0,
  "summary": "Brief description of what was done"
}
```

## Loop Flow

```
Orchestrator (lean, reads state files only)
     │
     ├─► Spawn subagent for Phase 1 ─► [fresh 200k context]
     │        └── plan → exec → verify → write results
     │        └── returns: {status: completed, commits: [...]}
     │
     ├─► Spawn subagent for Phase 2 ─► [fresh 200k context]
     │        └── plan → exec → verify (fail) → re-exec → verify
     │        └── returns: {status: completed, retries: 1}
     │
     └─► Spawn subagent for Phase 3 ─► [fresh 200k context]
              └── plan → exec → verify (fail x3)
              └── returns: {status: checkpoint, diagnosis: "..."}
```

## Checkpoint Behavior

When a subagent returns `status: checkpoint`:
1. Stop the automation loop
2. Display the diagnosis from the subagent
3. Show options:
   - Review and fix manually, then `/quest-run` to continue
   - Skip phase with `/quest-run {N+1}` to move on
   - Adjust plan with `/quest-plan --force`

## Events

The orchestrator emits:
- `quest_run_started` — when loop begins (includes phase range)
- `quest_run_phase_complete` — after each successful phase
- `quest_run_checkpoint` — when stopping for human intervention
- `quest_run_complete` — when all phases done

Subagents emit phase-level events internally (phase_planned, phase_executing, phase_verified).

## Prerequisites

- Active quest (`.planning/` directory exists)
- Quest status is `active`

## Example Session

```
> /quest-run

Running quest: Implement User Authentication
Starting from phase 1 of 5

Phase 1: Set up auth middleware
  [subagent] Planning... 3 tasks created
  [subagent] Executing... 2 commits
  [subagent] Verifying... PASS
  ✓ Phase 1 complete

Phase 2: Add login endpoint
  [subagent] Planning... 4 tasks created
  [subagent] Executing... 3 commits
  [subagent] Verifying... FAIL (missing validation)
  [subagent] Re-executing with diagnosis...
  [subagent] Verifying... PASS
  ✓ Phase 2 complete (1 retry)

Phase 3: Add session management
  [subagent] Planning... 2 tasks created
  [subagent] Executing... 1 commit
  [subagent] Verifying... PASS
  ✓ Phase 3 complete

...

Quest complete! 5/5 phases, 1 retry total.
```

## Token Budget

| Component | Budget |
|-----------|--------|
| Orchestrator | ~10% (reads state files, spawns subagents) |
| Phase subagent | Fresh 200k per phase |
| State persistence | `.planning/` files (no token cost) |
