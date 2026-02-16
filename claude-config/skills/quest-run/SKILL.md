---
name: quest-run
description: Run quest phases with automated execution loop
allowed-tools: Bash, Read, Write, Edit, Task
---

# Quest Run Skill

Automates quest phase execution. Each phase runs in a **fresh subagent context** to prevent token accumulation. The orchestrator stays lean — reads state files, reviews JSON returns, delegates everything.

## Usage

```
/quest-run              Run from current phase to completion
/quest-run 3            Start from phase 3
/quest-run 3-5          Run phases 3 through 5 only
```

## Behavior

1. **Find active quest:**
   - Look for `.planning/*/QUEST.md` files with `Status: active`
   - If none found: exit — use `/quest-create` first
   - If multiple: ask user which to run

2. **Read quest state** from the active quest directory:
   - `PHASES.md` — Phase list and statuses
   - `STATE.md` — Current position
   - `config.json` — Settings (maxRetries)

3. **Determine phase range:**
   - No argument: first `pending` phase to last phase
   - Single number: start from that phase
   - Range (N-M): run only phases N through M

4. **For each phase** in range:

   a. Read phase status from PHASES.md — **skip** if `completed`

   b. **Spawn fresh subagent** via Task tool:
      ```
      Task tool with subagent_type: phase-executor
      ```
      Include in the prompt:
      - Quest context (from QUEST.md)
      - Phase goal (from PHASES.md)
      - Previous phase summaries (brief)
      - If retrying: contents of `phases/NN-name/DIAGNOSIS.md`
      - Reminder to check MCP tools for crypto/wallet/signing operations

   c. **On subagent return**, parse the JSON summary:

      - **status=completed:**
        - Update PHASES.md: mark phase as `completed`
        - Log to STATE.md: phase completed, commits, timestamp
        - Display: "Phase N: completed (X commits)"
        - Continue to next phase

      - **status=needs_retry:**
        - Write diagnosis to `phases/NN-name/DIAGNOSIS.md`
        - Check retry count vs maxRetries from config.json
        - If retries < maxRetries:
          - Increment retry count in STATE.md
          - Spawn **new** subagent with diagnosis context
          - Display: "Phase N: retrying (attempt X/maxRetries)"
        - If retries >= maxRetries:
          - Mark phase as `checkpoint` in PHASES.md
          - **STOP** loop
          - Display diagnosis and options to user

      - **status=error:**
        - **STOP** loop
        - Display error details

5. **When all phases complete:**
   - Display summary (phases, commits, retries)
   - Suggest `/quest-complete`

## Subagent Prompt Template

For each phase, spawn with this prompt:

```
Execute phase {N} of the quest "{quest-name}".

## Quest Context
{QUEST.md summary — goal, repos, key dependencies}

## Phase Goal
{Phase N goal from PHASES.md}

## Previous Phases
{Brief summary of completed phases — what was done, key commits}

## Instructions
Run the full phase lifecycle:
1. If no PLAN.md exists in phases/{NN}-{name}/: research codebase, create PLAN.md
2. Execute each task with atomic commits (conventional format)
3. Verify: goal-backward check (artifacts exist, are substantive, are wired)
4. If verify fails: fix and re-verify (up to 2 internal retries)

Write PLAN.md to: {quest-dir}/phases/{NN}-{name}/PLAN.md

Before implementing crypto, signing, or wallet operations: check available MCP tools first.

Return JSON:
{
  "status": "completed" | "needs_retry" | "error",
  "phase": N,
  "commits": ["sha: message", ...],
  "retries": 0,
  "summary": "Brief description",
  "diagnosis": "Only if needs_retry — what went wrong and suggested fix"
}
```

For retries, append:

```
## Previous Attempt Diagnosis
{Contents of DIAGNOSIS.md}

Focus on fixing the identified issues. Do not redo completed work.
```

## Checkpoint Behavior

When a phase hits maxRetries:
1. Stop the automation loop
2. Display the diagnosis
3. Show options:
   - Review and fix manually, then `/quest-run` to continue
   - Skip phase with `/quest-run {N+1}`

## Console Output

Show progress as phases run:

```
Running quest: Cost Tracking
Starting from phase 1 of 5

Phase 1: Add cost schema
  Spawning subagent...
  Completed (2 commits)

Phase 2: Capture costs
  Spawning subagent...
  Completed (3 commits, 1 retry)

Phase 3: Add margin query
  Spawning subagent...
  needs_retry → retrying (attempt 2/3)...
  Completed (2 commits)

Quest complete! 5/5 phases, 2 retries total.
Use /quest-complete to archive.
```

## Context Isolation

**Why subagents per phase?** Each phase can consume significant context during planning (codebase exploration), execution (file edits), and verification (artifact checking). Running all phases in one context leads to token exhaustion.

**How it works:**
- The orchestrator (this skill) stays lean — only reads state files
- Each phase runs in a fresh 200k context subagent
- Subagent reads quest state from files, does all work, writes results back
- Only a JSON summary returns to the orchestrator
- Files in the quest directory serve as memory between phases

## Token Budget

| Component | Budget |
|-----------|--------|
| Orchestrator | ~10% (reads state files, spawns subagents) |
| Phase subagent | Fresh 200k per phase |
| State persistence | Quest directory files (no token cost) |

## Prerequisites

- Active quest with `Status: active`
- At least one phase with status `pending`
