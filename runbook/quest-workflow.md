# Quest Workflow

Complete procedure for managing quests: creating, planning phases, executing, verifying, retrying, and completing.

## Overview

A quest is a high-level goal broken into ordered phases. Each phase goes through plan → execute → verify, with automatic retries on verification failure.

```
/quest "Goal" → /plan-phase → /execute-phase → /verify-phase
                                                     │
                                              [PASS] → next phase
                                              [FAIL] → re-execute (max 3x)
                                              [FAIL x3] → checkpoint to human
```

## Creating a Quest

### Step 1: Initialize

```bash
# Start a new quest
/quest "Ship x402 v2"

# Or with description
/quest "Ship x402 v2" --desc "Complete v2 API with signing and mobile UI"
```

### Step 2: Directory Structure

The skill creates `.planning/` in the project root:

```
.planning/
├── QUEST.md          # Goal, linked repos, status
├── PHASES.md         # Ordered phase list with goals
├── STATE.md          # Current position, decisions, retries
├── config.json       # Settings
└── phases/           # Phase-specific plans and results
```

### Step 3: Add to .gitignore

The skill adds `.planning/` to `.gitignore` if not already present. Planning state is local, not committed.

### Step 4: Notify RPG

The skill emits a `quest_created` event to the RPG server:

```bash
curl -s -X POST http://localhost:4011/event \
  -H "Content-Type: application/json" \
  -d '{"type":"quest_created","questId":"...","name":"...","phases":[...]}'
```

## Quest Status

```bash
# Check current quest status
/quest status

# Output shows:
# Quest: Ship x402 v2
# Status: active
# Phase 2/5: Build API endpoints [executing]
# Retries: 0/3
```

## Planning a Phase

### Step 1: Start Planning

```bash
# Auto-detect current phase
/plan-phase

# Or specify phase number
/plan-phase 2
```

### Step 2: Research (Optional)

The skill may spawn a research subagent to gather context for the phase domain before planning.

### Step 3: Create Plan

The quest-planner agent creates `phases/NN-name/PLAN.md` with structured XML tasks:

```xml
<plan>
  <goal>Add API endpoints for x402 signing</goal>
  <context>
    Existing server structure in server/index.ts.
    Signing library available in shared/signing.ts.
  </context>

  <task id="1">
    <name>Add signing endpoint</name>
    <files>server/index.ts, server/signing.ts</files>
    <action>
      Create POST /api/sign endpoint that accepts payload and returns signature.
      Use existing signing library. Add input validation.
    </action>
    <verify>
      curl -X POST http://localhost:4011/api/sign -d '{"payload":"test"}'
      Should return 200 with signature field.
    </verify>
    <done>Endpoint responds correctly to valid and invalid inputs</done>
  </task>

  <task id="2">
    <name>Add verification endpoint</name>
    <files>server/index.ts, server/verify.ts</files>
    <action>
      Create POST /api/verify endpoint. Accepts payload + signature.
      Returns boolean verification result.
    </action>
    <verify>
      Test with signature from task 1.
      Test with invalid signature returns false.
    </verify>
    <done>Verification endpoint works for valid and invalid signatures</done>
  </task>
</plan>
```

### Plan Guidelines

- Target 2-3 tasks per plan (50% context budget for executor)
- Each task should be atomic and independently committable
- Include specific verify steps (commands, expected output)
- List all files that will be touched

## Executing a Phase

### Step 1: Start Execution

```bash
# Execute current phase
/execute-phase

# Or specify phase
/execute-phase 2
```

### Step 2: Subagent Execution

The phase-executor agent gets a fresh 200k context with:
- The PLAN.md for this phase
- Relevant source files listed in the plan

For each task:
1. Read the task definition
2. Execute the action
3. Run the verify step
4. Make an atomic git commit (conventional format)
5. Return structured result

### Step 3: Orchestrator Stays Lean

The orchestrating skill stays under 30% context — it only reads results and routes, never reads full source files.

### Deviation Rules

| Situation | Action |
|-----------|--------|
| Bug found | Auto-fix, continue |
| Missing dependency | Install, continue |
| Blocking issue | Auto-fix, continue |
| Architectural change needed | **Checkpoint** — pause, ask user |
| Scope creep detected | **Checkpoint** — pause, ask user |

### Step 4: Update State

On completion, the skill updates `STATE.md` with:
- Tasks completed
- Commits made
- Files changed
- Issues encountered

## Verifying a Phase

### Step 1: Start Verification

```bash
# Verify current phase
/verify-phase
```

### Step 2: Goal-Backward Verification

The phase-verifier agent checks from desired outcome backward:

1. **What must be TRUE** — the phase goal is met
2. **What must EXIST** — artifacts are present and substantive
3. **What must be CONNECTED** — artifacts are wired together correctly

### Step 3: Detection Checks

The verifier looks for:
- TODO/FIXME comments
- Empty returns or placeholder text
- Stub implementations
- Hardcoded values that should be configurable
- Missing tests (if phase goal includes testing)
- Missing error handling at system boundaries

### Step 4: Result

**VERIFICATION PASSED:**
- Phase marked complete in PHASES.md and STATE.md
- `phase_verified` event emitted (result: pass)
- Advances to next phase

**GAPS FOUND:**
- Structured diagnosis written to `phases/NN-name/VERIFY.md`
- If retryCount < maxRetries (default 3):
  - `phase_retrying` event emitted
  - Re-execute with diagnosis as additional context
  - Re-verify after execution
- If retryCount >= maxRetries:
  - `phase_verified` event emitted (result: fail)
  - Full diagnosis presented to human
  - Quest paused until human intervention

### Verification Result Format

```markdown
## Verification: Phase 2 - Build API endpoints

### Result: GAPS FOUND

### Gaps
1. **Missing input validation** — POST /api/sign accepts empty payload without error
2. **Hardcoded secret** — Signing key is hardcoded in server/signing.ts:15

### Diagnosis
The signing endpoint was implemented but lacks boundary validation.
The signing key should come from environment variable.

### Recommended Fixes
1. Add payload validation in server/index.ts before calling sign()
2. Move signing key to process.env.SIGNING_KEY with fallback error
```

## Completing a Quest

### Automatic Completion

When all phases pass verification, the quest is automatically completed:
- QUEST.md status updated to `completed`
- `quest_completed` event emitted
- XP awarded to companion

### Manual Completion

```bash
# Mark quest complete manually
/quest complete

# Archive quest (moves .planning/ to .planning-archive/)
/quest archive
```

### Pause and Resume

```bash
# Pause quest (saves current state)
/quest pause

# Resume quest
/quest resume
```

## Configuration

`config.json` in `.planning/`:

```json
{
  "maxRetries": 3,
  "autoRetry": true,
  "commitFormat": "conventional",
  "rpgNotify": true
}
```

| Setting | Default | Description |
|---------|---------|-------------|
| `maxRetries` | 3 | Max verification retries per phase |
| `autoRetry` | true | Auto-retry on verification failure |
| `commitFormat` | `"conventional"` | Git commit message format |
| `rpgNotify` | true | Send events to claude-rpg server |

## Cross-Repo Quests

For quests spanning multiple repos:

1. QUEST.md lists all linked repos
2. Each repo gets its own `.planning/` with a reference back to the primary quest
3. Phases specify which repo they execute in
4. RPG events include the repo context for correct companion XP attribution

## Troubleshooting

| Issue | Resolution |
|-------|------------|
| `.planning/` not found | Run `/quest` first to initialize |
| Verification keeps failing | Check diagnosis in VERIFY.md, consider reducing phase scope |
| RPG events not showing | Verify claude-rpg server running on localhost:4011 |
| Stale state | Run `/quest status` to reconcile |
| Context too large | Break phase into smaller sub-phases |
