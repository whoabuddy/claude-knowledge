# Archive (Cold Storage)

Knowledge that hasn't been accessed in 90+ days moves here automatically.

## Structure

```
archive/
├── nuggets/     # Archived quick facts
├── patterns/    # Archived code patterns
├── runbook/     # Archived procedures
├── decisions/   # Archived ADRs
└── README.md
```

## How It Works

1. **Decay**: Items not accessed for 90+ days move from warm tier to archive
2. **Promotion**: Items accessed 3+ times while archived move back to warm tier
3. **Manual**: Use `/capture archive <file>` to manually archive

## Archived File Format

Files keep their original content with added frontmatter:

```yaml
---
archived: true
archived_date: 2026-02-01
archived_reason: "decay"  # or "manual", "outdated", etc.
original_path: "nuggets/clarity.md"
access_count: 5
last_accessed: 2025-10-15
---

[original content]
```

## Retrieval

Archived knowledge can still be searched and retrieved:

```bash
# Search archive
grep -r "topic" ~/dev/whoabuddy/claude-knowledge/archive/

# Check decay candidates
bun ~/.claude/skills/capture/decay-check.ts --dry-run
```

## When to Archive Manually

- Knowledge is outdated but might be useful for reference
- Superseded by newer patterns
- Specific to a project that's no longer active
- Valid but rarely applicable

## Promotion Back to Warm

Items are promoted back to warm tier when:
- Accessed 3+ times while in archive
- Manually retrieved: `/capture promote <file>`

Promotion adds metadata showing the round-trip:

```yaml
---
promoted_from_archive: true
promoted_date: 2026-03-15
archive_duration_days: 45
---
```
