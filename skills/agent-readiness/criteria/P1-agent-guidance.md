# P1 - Agent Guidance

**Purpose:** Does an agent know *how to behave* in this repo? Stable contracts (AGENTS.md, contributing, MCP, hooks) keep churn from degrading agent operability. This is the core of L2.

## Deterministic checks (D)
- D1.1 AGENTS.md exists and non-empty (>100 chars). [pi.find AGENTS.md]
- D1.2 AGENTS.md contains at least one enforceable rule/actionable instruction (contains 'must', 'always', 'never', 'run ', 'use ', bullet lists).
- D1.3 CONTRIBUTING.md exists OR AGENTS.md covers contribution/setup.
- D1.4 An agent-readable config / MCP manifest exists (mcp.json, .mcp.json, or CLAUDE.md) OR hooks dir present.
- D1.5 `justfile`/`Makefile`/`taskfile` present (task discovery shorthand) OR setup script.
- D1.6 CI tells agents what's checked (workflow names/steps readable in .github/workflows).

## Judgment checks (J)
- J1.1 Is AGENTS.md project-specific (not a generic posture copied verbatim)?
- J1.2 Would these instructions reduce an agent's likely errors, or are they filler?
- J1.3 Is the task-discovery surface (make/task/scripts) discoverable from the README?

## Anti-gaming
- Fail D1.1 if AGENTS.md is only frontmatter or a one-liner with no usable rule.
- J: a generic 'be nice / be careful' AGENTS.md should not count as a rule (flag it).
