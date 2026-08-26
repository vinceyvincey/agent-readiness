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
- [x] references/FRAMEWORK pointer.
- Verify: explicit --skill load returns rubric v0.1.0 + 10 pillars; auto-discovery lists agent-readiness with no validation warnings; skill-run produced scored evidence (BASELINE). Full 10-pillar prompt audit exceeds 120s shell ceiling, so canonical E1 is the M2 engine.

## M2 - Deterministic engine (extension core) - DONE
- [x] src/engine.ts + checks.ts: D-check batteries for P0..P9; per-pillar %, overall, level, findings.
- [x] 80% N-1 gating (pure resolveLevel) + Mandatory P2/P6 hard gates; configurable weights; config_hash.
- [x] report.md + report.json via writeReport; src/cli.ts with --json/--strict.
- Verify: 11/11 unit tests pass (level gating edge cases + writeReport); --json valid (10 pillars, stable hash); --strict exits 1 on mandatory gate fail; engine on this repo = L0/20.5 (correct). Extension command/tool surface wired; surface verification is M3.

## M3 - Extension surface + CI gate - DONE
- [x] /readiness-report, /readiness-fix commands (registered + verified).
- [x] readiness_check tool (registered).
- [x] check --json --strict exits non-zero when required scopes missing (src/cli.ts) - verified exit 1 on mandatory gate fail.
- [x] --fix drafts remediation for high-priority failed checks (src/fix.ts; dry-run into .agent-readiness/fix/, --apply to write).
- Verify: /readiness-report written a fresh L0/22.2 report via RPC (report.md/json at 10:27); readiness_check tool called by model in a live RPC session (SAW_READINESS_TOOL=yes, agent_end cleanly); --fix applied to a repo copy raised overall 20.2->37 (P1 0->60, P4 0->40, P8 0->20) while staying L0 (Mandatory P2 gate holds); --strict exit 1 confirmed; 11/11 unit tests pass. Next: M4 (history) + M4.5 (validation smoke).

## M4 - History + evaluation
- [ ] .agent-readiness/history.json per repo; trend compare.
- [ ] Optional HTML/README badge.
- Verify: two runs produce diffable history; .agent-readiness git-ignored.

## M4.5 - Validation harness & hypothesis gates
- [ ] Stand up ./validation/ smoke corpus (>=3 calibrated repos low/med/high).
- [ ] Pin controlled harness for E2 (pi + fixed model); record scaffold-effect baseline.
- [ ] E1 report + E3 narrative-flagging + rubric_version stamp.
- [ ] Wire H1..H8 acceptance thresholds into the gate command.
- [ ] Commit every smoke run to docs/validation/; no milestone is DONE without its run.

## M5 - Validation & dogfood
- [ ] Symlink/install docs (skills + extension).
- [ ] pi package metadata (packages.md-style) for npm/git distribution.
- [ ] Dogfood: run on this repo and on a real project; apply readiness-fix; re-score.
- Verify: target repo's score improves after --fix is applied.

## Post-critical-review constraints (feed M2/M3)
- Level identity = set of pillar gates + Mandatory flags (P2, P6); no singleton '80% aggregate'.
- Deterministic score separate from judgment narrative.
- rubric_version + config hash + freshness in every report/history.
- Engine single-source scoring; skill only orchestrates.
- Dry-run default; .agent-readiness/ git-ignored writable opt-in.

## Cross-cutting acceptance criteria
- No third-party runtime for the skill-only path (pi can run shell builtins).
- Every deterministic check documented: file glob + evidence rule + pass/fail.
- Reports diffable (stable ordering, sorted).
- Licensing/attribution of OSS ideas tracked (docs/CREDITS).

## Definition of done
/readiness-report on any repo returns: level, per-pillar scores, high-priority actionable punchlist, and (with --strict) a CI-gateable exit code - deterministic and reproducible by humans and automation.