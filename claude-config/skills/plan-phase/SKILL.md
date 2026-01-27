---
name: plan-phase
description: Research and plan a specific phase of the active quest
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Task, WebSearch, WebFetch
---

# Plan Phase Skill

Research and create an executable plan for a quest phase.

## Usage

```
/plan-phase              Plan the current (next pending) phase
/plan-phase 2            Plan a specific phase by number
```

## Behavior

1. Read `.planning/QUEST.md` and `PHASES.md` for context
2. Identify the target phase (next pending, or specified by number)
3. Optionally spawn a research subagent to explore the codebase or search the web for the phase domain
4. Spawn `quest-planner` agent in phase planning mode with:
   - Phase goal from PHASES.md
   - Quest context from QUEST.md
   - Relevant codebase patterns
5. Write the plan to `phases/NN-name/PLAN.md` using structured XML task format
6. Update PHASES.md phase status to `planned`
7. Update STATE.md with planning decisions
8. Emit `phase_planned` event:
   ```bash
   curl -s -X POST http://localhost:4011/event \
     -H "Content-Type: application/json" \
     -d '{"type":"phase_planned","questId":"<id>","phaseId":"<id>","phaseName":"<name>","taskCount":<n>}'
   ```

## Plan Format

Plans use structured XML tasks targeting 2-3 tasks (50% context budget):

```xml
<plan>
  <goal>Phase goal statement</goal>
  <context>Relevant codebase context</context>
  <task id="1">
    <name>Task name</name>
    <files>file1.ts, file2.ts</files>
    <action>Detailed implementation instructions</action>
    <verify>Concrete verification commands</verify>
    <done>Completion criteria</done>
  </task>
</plan>
```

## Prerequisites

- Active quest (`.planning/` directory exists)
- Phase must be in `pending` status

## Quick Reference

- Runbook: `runbook/quest-workflow.md`
- Planner agent: `claude-config/agents/quest-planner.md`
