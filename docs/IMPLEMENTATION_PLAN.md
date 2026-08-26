# IMPLEMENTATION_PLAN.md

> Milestones + acceptance criteria for building a pi-native agent-readiness framework in this repo.

## M0 - Foundation (canonical) - DONE
- Research committed (Exa web + Context7 doc extraction).
- docs/FRAMEWORK.md (10 pillars, L0-L5, 80% N-1 gating, scoring).
- docs/RESEARCH_LANDSCAPE.md, docs/PI_ARCHITECTURE.md.
- Git repo initialized + README.

## M1 - Scaffolding - DONE
- [x] skills/agent-readiness/SKILL.md with valid frontmatter (name, description).
- [x] criteria/: 10 pillar files (P0..P9), each: purpose + D/J checks + anti-gaming.
- [x] references/FRAMEWORK pointer (skill self-containment).
- Verify: DONE - explicit `--skill` load returns rubric v0.1.0 + 10 pillars; auto-discovery lists `agent-readiness` with no validation warnings; a skill-run on this repo produced P0/P2/P6 scored evidence (see BASELINE). Full 10-pillar prompt audit exceeds 120s shell ceiling, so canonical E1 is the M2 engine.

## M2 - Deterministic engine (extension core)
- [x] src/engine.ts + checks.ts: deterministic D-check batteries for P0..P9; per-pillar %, overall, level, findings.
- [x] 80% N-1 gating (pure resolveLevel) with Mandatory P2/P6 hard gates, configurable weights, config_hash.
- [x] report.md + report.json output via writeReport; JSON + markdown + --strict CLI (src/cli.ts).
- Verify: 11/11 unit tests pass (incl. level gating edge cases + writeReport); --json valid with 10 pillars + stable config hash; --strict exits 1 on mandatory gate fail; engine on this repo = L0/20.5 (correct for docs-only repo with P2/P6 failing). Extension command/tool surface (readiness_check, /readiness-report) is wired but surface verification is M3.

[43 more lines in file. Use offset=23 to continue.]