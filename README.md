# agent-readiness

A **pi-native** framework to measure and improve how ready a codebase is for autonomous AI coding agents.

Built after researching Factory.ai's *Agent Readiness* model and the open-source ecosystem that has sprouted around it. The implementation here is deliberately **pi-first**: correctness and feedback loops are assessed with pi's own tools, packaged as a pi **skill** and a pi **extension**.

## Repo layout
- `docs/FRAMEWORK.md` - the model: pillars, levels, scoring, gating
- `docs/RESEARCH_LANDSCAPE.md` - Factory.ai + the OSS tools we surveyed
- `docs/PI_ARCHITECTURE.md` - how it maps to pi (skill + extension)
- `docs/IMPLEMENTATION_PLAN.md` - milestones + acceptance criteria
- `docs/CRITICAL_REVIEWS.md` - critiques from critical-friend agents
- `skills/agent-readiness/` - the skill (SKILL.md + criteria/)
- `.pi/extensions/agent-readiness/` - the extension (commands + tools)

## Status
Research + design committed. **M1-M5 done + verified** (skill, engine, extension+--fix+CI gate, history+trend, validation harness + E1/E2 evidence, dogfooding + distribution). This repo currently scores **L0 / 26.3** (L0 is correct: the Mandatory P2 testing gate still fails).

### Engine (M2/M3/M4)
- src/checks.ts - 10-pillar D-check batteries
- src/engine.ts - runReadiness, 80% N-1 gating + Mandatory P2/P6, report.md/json, config_hash, auto history append
- src/cli.ts - node --experimental-strip-types src/cli.ts <repo> [--json|--strict|--fix|--apply|--history|--badge]
- src/fix.ts - --fix remediation drafts (dry-run into .agent-readiness/fix/)
- src/history.ts - append-only per-repo score history + trend deltas
- src/badge.ts - inline markdown readiness badge
- test/ - engine + history unit tests (both ALL PASS)

### Extension (M3)
- .pi/extensions/agent-readiness/index.ts - readiness_check tool + /readiness-report + /readiness-fix

### Verified results
- Engine on this repo: L0 / 26.3 (P2=16.7 mandatory gate holds - correct)
- History: append-only .agent-readiness/history.json; two-run demo delta +5.3; --history + --badge work
- 11 engine + history tests pass; --json valid; --strict exit 1 on mandatory gate fail

### Engine (M2/M3)
- src/checks.ts - 10-pillar D-check batteries
- src/engine.ts - runReadiness, 80% N-1 gating + Mandatory P2/P6, report.md/json, config_hash
- src/cli.ts - node --experimental-strip-types src/cli.ts <repo> [--json|--strict|--fix|--apply]
- src/fix.ts - --fix remediation drafts (dry-run into .agent-readiness/fix/)
- test/engine.test.ts - 11 unit tests (node --experimental-strip-types test/engine.test.ts)

### Extension (M3)
- .pi/extensions/agent-readiness/index.ts - readiness_check tool + /readiness-report + /readiness-fix

### Verified results
- Engine on this repo: L0 / 22.2 (P2=16.7 mandatory gate holds - correct)
- --fix applied to a copy: overall 20.2 -> 37 (P1 0->60, P4 0->40, P8 0->20), still L0 (P2 gate holds)
- 11/11 unit tests pass; --json valid; --strict exit 1 on mandatory gate fail; /readiness-report + readiness_check run in a live pi session

## Skill layout (M1)
- `skills/agent-readiness/SKILL.md` - 5-phase audit workflow, valid Agent-Skills frontmatter, rubric_version 0.1.0.
- `skills/agent-readiness/criteria/P0..P9*.md` - per-pillar criteria: deterministic (D) + judgment (J) checks + anti-gaming guards.
- `skills/agent-readiness/references/FRAMEWORK.md` - pointer to canonical model.
