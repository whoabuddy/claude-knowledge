# Icebox

Parked ideas that aren't ready for the knowledge base.

## Purpose

The icebox holds ideas that are:
- **Not validated** - Haven't proven useful yet
- **Future-oriented** - Might be relevant later
- **Speculative** - Interesting but uncertain
- **Low priority** - Good ideas with no current need

Unlike the archive (validated knowledge that decayed), the icebox is for ideas that never reached warm tier.

## Format

Icebox entries are less structured than captures:

```markdown
# Idea Title

Brief description of the idea.

## Why Iceboxed

- Not validated yet
- No immediate use case
- Needs more research

## Related

- Links to relevant resources
- Similar patterns that did work

---
Added: 2026-02-01
Source: session observation / external article / random thought
```

## Usage

```bash
# Add to icebox
/capture icebox "Consider using Bun for test runner"

# List icebox items
/capture icebox list

# Retrieve and potentially promote
/capture icebox get <id>

# Delete (idea was bad)
/capture icebox delete <id>
```

## Review Cadence

Icebox items don't decay - they stay until explicitly:
- **Promoted**: Validated and moved to warm tier as capture
- **Deleted**: Idea proved unhelpful
- **Ignored**: Stays in icebox indefinitely

Consider reviewing the icebox monthly or when starting new projects.

## Examples

Good icebox candidates:
- "Try property-based testing for contract validation"
- "Research MCP server patterns for multi-tool workflows"
- "Consider TypeScript project references for monorepos"

Not icebox (use capture instead):
- Verified facts or gotchas
- Working code patterns
- Documented procedures
