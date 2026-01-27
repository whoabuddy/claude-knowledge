# ADR-0003: Plan-Execute-Verify Lifecycle

## Status
Accepted

## Context
Complex multi-phase tasks (shipping features across repos, large refactors, migration projects) suffer from context rot when handled in a single Claude Code session. As context fills up, the model loses track of earlier decisions, file contents get stale, and execution quality degrades.

GSD (Get Stuff Done) demonstrated a pattern for managing this: an orchestrator stays lean while spawning fresh subagents for execution, structured plans keep work focused, and a verify-then-retry loop catches gaps before moving on.

We needed to adapt this pattern to our existing claude-knowledge skills/agents system and integrate it with the claude-rpg companion tracking for visibility.

## Decision

### Adopted Patterns

| Pattern | Source | Adaptation |
|---------|--------|------------|
| **Orchestrator/Subagent** | GSD | Skills orchestrate, agents execute with fresh 200k contexts |
| **Structured Plans** | GSD | XML task format with `<task>`, `<files>`, `<action>`, `<verify>`, `<done>` |
| **Loop-Until-Complete** | GSD | Verify phase → on fail, re-execute with diagnosis → verify again (max 3 retries) |
| **Context Budget** | GSD | Plans target 2-3 tasks (50% context), orchestrator stays under 30% |
| **Goal-Backward Verification** | GSD | Verifier works from desired outcome back to artifacts |

### Not Adopted

| Pattern | Reason |
|---------|--------|
| Full GSD installation | We have our own skills/agents system |
| GSD agent set | Our agents are domain-specific (Clarity, Stacks, etc.) |
| GSD UI branding | We use claude-rpg for visualization |

### Quest Abstraction

We introduced a "quest" layer on top of the plan-execute-verify cycle:

- **Quest** = High-level goal spanning one or more repos (e.g., "Ship x402 v2")
- **Phase** = Ordered step within a quest (e.g., "Add API endpoints", "Build UI")
- **Task** = Atomic unit of work within a phase plan

This maps naturally to RPG concepts (quests, phases, XP rewards) and provides cross-repo coordination through a shared `.planning/` directory.

### Deviation Rules

Executors follow strict rules when encountering unexpected situations:

- **Auto-fix**: Bugs, missing deps, blocking issues — fix and continue
- **Checkpoint**: Architectural changes, scope creep — pause and ask user

### State Management

Quest state lives in `.planning/` at the project root, added to `.gitignore`. This keeps planning artifacts local (not committed) while providing persistence across sessions.

```
.planning/
├── QUEST.md          # Goal, repos, status
├── PHASES.md         # Ordered phase list
├── STATE.md          # Current position, decisions, retries
├── config.json       # Settings (maxRetries, autoRetry)
└── phases/
    ├── 01-name/
    │   ├── PLAN.md   # Executable task plan
    │   └── VERIFY.md # Verification results
    └── 02-name/
        ├── PLAN.md
        └── VERIFY.md
```

## Consequences

### Benefits
- Fresh contexts prevent quality degradation on long tasks
- Structured plans keep execution focused and auditable
- Retry loop catches gaps before they compound
- Quest tracking provides visibility across repos
- RPG integration adds XP rewards for completing phases

### Trade-offs
- More files to manage (`.planning/` directory)
- Overhead of plan-execute-verify cycle for simple tasks (use directly for complex work only)
- Subagent spawning has latency cost per phase
- Quest events require claude-rpg server running for UI visibility

## References
- Quest workflow: `runbook/quest-workflow.md`
- Agent definitions: `claude-config/agents/quest-planner.md`, `phase-executor.md`, `phase-verifier.md`
- Skills: `claude-config/skills/quest/`, `plan-phase/`, `execute-phase/`, `verify-phase/`
