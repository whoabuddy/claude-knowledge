# Quest Workflow

Complete procedure for managing quests: creating, running phases, and completing.

## Overview

A quest is a high-level goal broken into ordered phases. Each phase runs end-to-end (plan → execute → verify) in a fresh subagent context. The orchestrator stays lean and delegates everything.

```
/quest-create → /quest-run → /quest-complete
                    │
                    ├─► Phase 1: subagent (plan → exec → verify) → completed
                    ├─► Phase 2: subagent (plan → exec → verify → retry) → completed
                    └─► Phase 3: subagent (plan → exec → verify) → completed
```

## Skills

| Skill | Purpose |
|-------|---------|
| `/quest-create` | Create quest with planner-derived phases |
| `/quest-run` | Run phases with subagent automation |
| `/quest-complete` | Archive completed quest |
| `/quest-status` | Show progress and history |

## Creating a Quest

```bash
/quest-create <goal description>
```

1. Quest-planner agent analyzes the goal and produces:
   - Quest name (short slug)
   - Phase breakdown with goals and dependencies
2. Creates `.planning/YYYY-MM-DD-quest-name/` with:
   - `QUEST.md` — Goal, repos, status
   - `PHASES.md` — Ordered phases (all `pending`)
   - `STATE.md` — Current position, activity log
   - `config.json` — `{"maxRetries": 3, "commitFormat": "conventional"}`
   - `phases/` — Empty directory for phase plans
3. Adds `.planning/` to `.gitignore` if needed

### Multiple Quests

Multiple quest directories can coexist in `.planning/`. Only one runs at a time. Each has its own `YYYY-MM-DD-quest-name` directory.

## Running Phases

```bash
/quest-run              # Run all pending phases
/quest-run 3            # Start from phase 3
/quest-run 3-5          # Run phases 3 through 5
```

### Orchestration Loop

For each pending phase:

1. **Spawn** fresh phase-executor subagent (Sonnet, 200k context)
   - Include: quest context, phase goal, previous phase summaries
   - If retrying: include DIAGNOSIS.md from previous attempt

2. **Subagent** handles full lifecycle:
   - Plan: research codebase, create PLAN.md (2-3 XML tasks)
   - Execute: implement tasks with atomic commits
   - Verify: goal-backward check (exist, substantive, wired)
   - Internal retries: up to 2 fix-and-reverify attempts

3. **Subagent returns** JSON summary:
   - `completed` → update PHASES.md, log to STATE.md, next phase
   - `needs_retry` → write DIAGNOSIS.md, spawn new subagent (up to maxRetries)
   - `error` → stop loop, report

4. **On checkpoint** (maxRetries exceeded):
   - Loop stops
   - Diagnosis displayed
   - User can fix manually then `/quest-run` to continue, or `/quest-run {N+1}` to skip

### Phase States

- `pending` — Not started
- `completed` — Done
- `checkpoint` — Stuck after maxRetries, needs human intervention

## Completing a Quest

```bash
/quest-complete
```

1. Checks all phases are `completed`
2. Warns if any phases are incomplete (asks confirmation)
3. Updates QUEST.md status to `completed`
4. Moves quest directory to `.planning/archive/`

## Checking Status

```bash
/quest-status
```

Shows active quest progress (name, phase N/M, current phase) and lists archived quests.

## Directory Structure

```
.planning/
├── 2026-02-16-cost-tracking/      # Active quest
│   ├── QUEST.md
│   ├── PHASES.md
│   ├── STATE.md
│   ├── config.json
│   └── phases/
│       ├── 01-add-schema/
│       │   ├── PLAN.md
│       │   └── DIAGNOSIS.md       # Only if retry needed
│       └── 02-capture-costs/
│           └── PLAN.md
└── archive/
    ├── 2026-02-14-auth-system/
    └── 2026-02-10-loop-hardening/
```

## Configuration

`config.json`:

```json
{
  "maxRetries": 3,
  "commitFormat": "conventional"
}
```

| Setting | Default | Description |
|---------|---------|-------------|
| `maxRetries` | 3 | Max retry attempts per phase before checkpoint |
| `commitFormat` | `"conventional"` | Git commit message format |

## Agents

| Agent | Model | Role |
|-------|-------|------|
| `quest-planner` | Opus | Breaks goals into phases, creates plans |
| `phase-executor` | Sonnet | Plans, executes, verifies phases end-to-end |

## Troubleshooting

| Issue | Resolution |
|-------|------------|
| No active quest | Run `/quest-create` first |
| Phase keeps failing | Check DIAGNOSIS.md, consider reducing phase scope |
| Stale state | Run `/quest-status` to check actual file state |
| Context too large | Break phase into smaller sub-phases |
