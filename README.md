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
Research + design committed. **M1-M14 done + verified.** M1-M5: skill, engine, extension+--fix+CI gate, history+trend, validation harness + E1/E2 evidence, dogfooding + distribution. M6: check-correctness bug fixes + git provenance. M7: anti-gaming guards, difficulty axis, droid harness surface checks. M8: monorepo app discovery + per-app scoring. M9: agentic remediation. M10: Droid comparison experiment, synthesized optimal prompts. M11: extracted Droid's actual system prompts from session traces, created 84-criteria mapping, added 20 new checks. M12: criterion description registry (84 entries), full descriptions in agent prompt, agent-only criteria section, hybrid scoring model (deterministic floor, agent ceiling). M13: side-by-side evaluation harness (pi vs Droid on same repos, criteria-by-criteria comparison, fix comparison). M14: 30 new deterministic checks (9 gh-CLI + 21 config-file), assessment/remediation prompt split, 77/84 criteria now deterministic (92%), only 7 truly agent-only. Rubric v0.7.0.

### Engine (M2-M14)
- src/checks.ts - 10-pillar D-check batteries (~103 checks), git-aware helpers, anti-gaming guards, difficulty axis, Droid-aligned criteria, gh-CLI checks with skip support
- src/engine.ts - runReadiness, 80% N-1 gating + Mandatory P2/P6, app-scoped per-app scoring, report.md/json, config_hash, git provenance, auto history append, skipped-check exclusion
- src/discover.ts - monorepo sub-application discovery (workspaces, turbo/nx, go.work, Cargo, Python)
- src/criteria-registry.ts - 84-criterion registry with full descriptions, evaluation instructions, pi mappings (77 mapped, 7 agent-only)
- src/cli.ts - node --experimental-strip-types src/cli.ts <repo> [--json|--strict|--fix|--apply|--agent|--history|--badge]
- src/fix.ts - --fix remediation drafts (dry-run) + agentPromptFor (remediation) + assessmentPromptFor (assessment-only, no file mods)
- src/history.ts - append-only per-repo score history + trend deltas
- src/badge.ts - inline markdown readiness badge
- test/ - 8 test suites (engine, history, checks, deepening, monorepo, fix, criteria-registry, side-by-side) — 191 assertions, all ALL PASS
- validation/side-by-side.ts - reusable harness: runs pi deterministic + pi hybrid (agentPromptFor via droid exec) + Droid /readiness-report on same repos, 3-way criteria comparison, fix comparison
- docs/traces/ - Droid session trace extracts (readiness-report prompt, readiness-fix prompt, 84-criteria CSV, criteria mapping)

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
