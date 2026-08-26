# PI_ARCHITECTURE.md - how the framework maps to pi

Why pi is a strong fit: pi already has every primitive agent-readiness checks for. We build a native skill + extension rather than wrapping a node CLI.

## 1. The skill (progressive-disclosure audit)
Mirrors superduck-ai and the Agent Skills spec. Packaged at skills/agent-readiness/.

```
skills/agent-readiness/
  SKILL.md              # frontmatter + 5-phase audit workflow
  criteria/             # one md per pillar (P0..P9), loaded on-demand by subagents
    P0-documentation.md
    ...
    P9-task-discovery.md
  scripts/              # optional: a self-contained reporter (node or bash)
```

SKILL.md frontmatter (per pi/Agent Skills spec):

```markdown
---
name: agent-readiness
description: Assess a codebase's readiness for autonomous AI coding agents (docs, tests, CI, env, security, modularity) and generate a remediation punchlist. Use for readiness-report, readiness-fix, or when asked to score a repo for agent operability.
---
# Agent Readiness
## How it works (steps)
1. Inventory: list files/dirs at repo root (pi.find, pi.read).
2. For each of the 10 pillars, load its criteria/*.md and run checks: deterministic stat checks via pi (grep/find/bash); qualitative checks by the agent explaining evidence.
3. Score: per-pillar % -> weighted overall -> resolve level via 80% N-1 gate.
4. Recommend: bucket failed checks high/med/low; suggest remediation for high.
5. Write report (md + json), update history, offer fix.
## Output
A report.md and report.json in the target repo; exit 0; --strict exits 1 on gate-required misses.
```

Since skill content is prompt-only (no code execution by the skill), the heavy lifting for --json / history / --strict is delegated to the extension. The skill is the human-readable, portable audit.

## 2. The extension (commands + tool = CLI)

Packaged at .pi/extensions/agent-readiness/. Registered via pi.registerCommand + pi.registerTool.

**Commands (slash):**
- /readiness-report [/path] - run the audit.
- /readiness-fix [/path] - after a report, propose concrete file(s) to create/edit.

**Custom tool (for other agents / automation):**
- readiness_check - callable by the LLM in any pi session; returns report.json summary.

**Engine (src/engine.ts):** deterministic checks. Reads tsconfig, .github/workflows, .env.example, etc. Uses the extension's Node runtime. Produces structured JSON the report/fix/CLI consume.

**--strict CI gate:** a check command that exits non-zero (1) when required scopes are missing, so it can gate CI/PRs.

## 3. pi-specific surfaces we use
| Need | pi surface |
|---|---|
| discover files | pi.find / pi.grep / pi.read |
| run stat checks | pi.bash (git, test, lint) |
| emit JSON report | write to report.json |
| record history | write to .agent-readiness/history.json (git-clean) |
| skill discovery | skills/ dir + SKILL.md frontmatter |
| slash commands + tools | extension: registerCommand / registerTool |
| agent guidance | the repo's AGENTS.md + context files |

## 4. Tenable scope guardrails
- Not building a daemon/watch - point-in-time audit + history.
- Not a build orchestrator - we probe, not execute the test suite (unless --verify).
- Heavy LLM judgments: minimize, flag as 'judgment' checks vs 'deterministic'.

## 5. Distribution
- Symlink skills/ into ~/.pi/agent/skills/ or project .pi/skills; register the extension in .pi/settings.json.
- Core scoring uses only built-in pi tools, no node deps for the skill path.
- npm/git pkg packaging is a later milestone.