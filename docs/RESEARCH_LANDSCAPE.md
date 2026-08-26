# Research landscape: agent-readiness for AI coding agents

> Compiled from Exa web research and Context7 doc extraction, February 2026.

## 1. What Factory.ai's Agent Readiness is

Factory's framework measures how prepared a repository is for *autonomous* agents (their agent is **Droid**). Thesis: agent failure is usually an **environment** problem - missing pre-commit hooks, weak tests, no docs, undocumented env vars - rather than an agent problem. 'Pave the roads before the cars drive.'

**Key properties of the model:**
- ~100+ signals across documentation, test coverage, CI health, modularity, dependency hygiene.
- 8-9 technical pillars (a news article says *eight*; community reverse-engineering and agent-ready's FACTORY_COMPARISON.md say **nine**).
- 5 maturity levels: L1 *Functional*, L2 *Documented*, L3 *Standardized*, L4 *Optimized*, L5 *Autonomous*.
- Gating rule: 80% threshold, gated on the **previous** level (N-1), not the current one.
- Interaction surfaces: /readiness-report slash command, org dashboard, a Readiness Reports API (app.factory.ai, Bearer), and /readiness-fix for auto-remediation.

**Insight worth stealing:** readiness != 'clean code'. A repo can be tidy yet agent-unready (no run instructions, GUI-only tooling, undocumented env vars, slow tests); a messy repo with clear run steps + readable tests + basic docs can be highly agent-ready.

## 2. Open-source implementations (surveyed + score-keeping)

| Repo | Stack | Checks / pillars | Notes |
|---|---|---|---|
| kodustech/agent-readiness (@kodus/agent-readiness) | TypeScript, npm | 39 checks / 7 pillars | 'OSS alternative to Factory'. Pillars: Style/Linting, Testing, Docs, Dev Env, CI/CD, Code Health, Security. npx @kodus/agent-readiness . ~90 stars |
| harrydaihaolin/agent-readiness | Python CLI | Lighthouse 0-100 | Rubric: **Cognitive load, Feedback loops, Flow & reliability** + safety cap. Prioritized punchlist. Companion agent-readiness-ontology-mcp (pip). |
| superduck-ai/agent-readiness | JS/TS **skill** | 82 criteria / 9 categories | Vendor-free port of the Factory **droid skill**. SKILL.md + 5-phase workflow, criteria/*.md, self-contained bin. Closest to a pi skill. |
| agent-next/agent-ready | TS, npm + **MCP** | ~33 checks / 9-10 pillars | Most explicit Factory spec alignment (80% gating, L1-L5). Ships MCP check_repo_readiness, check, init_files, pillar-analyzer. Best off-the-shelf MCP server. |
| chevy155/agent-readiness | Python CLI | deterministic | Minimal 'runway check' before agent modifies repo. |

**Supporting tooling:**
- fy-06/agents-md-bench, vltansky/agents-md-evals, reaatech/agents-md-kit - lint/validate/scaffold/A-B-test AGENTS.md.
- eth-sri/agentbench - validates readiness by actually running tasks on SWE-Bench Lite.
- arXiv 2602.11988 - empirical: repo context files (AGENTS.md) measurably change coding-agent behavior.

## 3. Verdict for our pi build

No single project reproduces Factory exactly. But:
1. **superduck-ai's skill shape** proves a pi-style SKILL.md + criteria approach is the right packaging.
2. **agent-next pillar-analyzer** gives a concrete pillar decomposition and a score->level->findings->recommendations emit shape.
3. **Factory's level/gating** (L1-L5, 80% N-1) is the de-facto standard to align to.
4. **harrydaihaolin's rubric** is the best first-principles justification (cognitive load / feedback loops / flow).

We build our own framework on top: pi-native checks (pi.grep/find/read/bash), configurable pillars/weights, JSON + markdown report, score history, and a --strict CI gate.