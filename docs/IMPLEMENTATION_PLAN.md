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
- Verify: frontmatter valid (name lowercase-hyphen, description <1024, license/compat); 10 criteria files listed. NOTE: end-to-end pi discovery check is deferred to M2 when the engine exists to smoke it.

## M2 - Deterministic engine (extension core)

## M2 - Deterministic engine (extension core)
- [ ] src/engine.ts: scan target dir -> { per-file, per-pillar %, overall, level, findings }.
- [ ] 80% N-1 gating, configurable weights.
- [ ] report.md + report.json output.
- Verify: engine on this repo yields a scorable report; level logic passes unit tests.

## M3 - Extension surface + CI gate
- [ ] /readiness-report, /readiness-fix commands.
- [ ] readiness_check tool (callable from any pi session).
- [ ] check --json --strict exits non-zero when required scopes missing (CI-gateable).
- [ ] --fix drafts remediation for high-priority failed checks.
- Verify: run on this repo; --strict exit code correct.

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
Note: apply these in M2/M3 so they're built in, not bolted on.

## Cross-cutting acceptance criteria
- No third-party runtime for the skill-only path (pi can run files system shell builtins).
- Every deterministic check documented: file glob + evidence rule + pass/fail.
- Reports diffable (stable ordering, sorted).
- Licensing/attribution of OSS ideas tracked (docs/CREDITS).

## Definition of done
/readiness-report on any repo returns: level, per-pillar scores, high-priority actionable punchlist, and (with --strict) a CI-gateable exit code - deterministic and reproducible by humans and automation.