# CRITICAL_REVIEWS.md

> Critical-friend agent reviews of the initial FRAMEWORK / PI_ARCHITECTURE / IMPLEMENTATION_PLAN. Three independent agents reviewed with role-specific lenses (architecture, security+quality, product/UX). Raw transcripts from the runs; condensed here so they stay actionable.

## Consensus verdict

**The punchlist is the real product; the single 0-100 score / L0-L5 label is the vanity metric.** All three converged on four structural problems:

1. **The level gate is mathematically undefined.** '80% on previous level's criteria' is uncomputable because criteria are defined per-pillar (P0-P9), never per-level. No mapping says which pillars/checks constitute a level, so the core score/level engine is vacuous until that map exists.

2. **Judgment checks and deterministic checks are incompatible as one input.** A 'deterministic and reproducible' claim cannot be true if any check is 'the agent explains evidence.' Those give different results across models/temperatures/runs.

3. **Presence != signal.** Existence checks are trivially gameable: an empty README, a default tsconfig, a one-line .gitignore, an AGENTS.md with only frontmatter all pass. That directly incentivizes the empty output (Goodhart), and it reads as 'cargo capability', not real readiness.

4. **The rubric is not versioned.** Without a pinned rubric_version in report.json, history/trend comparison (M4/M5) compares apples across a moving rubric. Also: two parallel engines (skill-path and extension-path) are a guaranteed drift risk with no single source of truth.

## Architecture lens (agent 1)
- Gate is mathematically undefined (see consensus #1).
- Two epistemologies conflated (#2).
- Thesis measures latency/cognition but checks read structure; cannot detect a 15-min test suite or flaky tests - the exact behavior the thesis cares about.
- No rubric versioning; no single source of truth between skill and engine.
- 'Level 4' badge on a structurally neat but behaviorally unfriendly repo reads as a (false) safe claim.
- Writing report.json/history into target repos you don't maintain is a side-effect risk when dogfooding.

## Security & quality lens (agent 2)
- Secrets: detection-only/shallow; no CI-enforced secret scanning (gitleaks/trufflehog) or rotation remediation in --fix. No supply-chain pillar (npm/pip audit easy; pinned base; forged registry).
- P3 conflates hygiene (typo-free deps, stderr noise) with deterministic/cacheable builds; real reproduck redisability check not present.
- Coverage has no threshold spec; useless if decorative.
- **Gating sounds yet broken as a safety gate:** 80% applies to a weighted aggregate, so a repo can clear L3 with 100% on cheap pillars (docs/env) while failing expensive pillars (P2 coverage, P6 security = 40%). **Security/testing are effectively not gating.** Need per-pillar 'Mandatory' flags (must-pass overrides) for safety-critical scopes.
- L0->L1 gate wording is meaningless if L0 'barely parses' (trivially cleared).

## Product / UX lens (agent 3)
- Averaging destroys information: two repos with opposite strengths can score the same single float.
- False precision: '72 vs 77' invites comparison a file-extension check can't support.
- L5 'Autonomous' is an aspirational brand, not something existence criteria measure.
- The punchlist (high/med/low actionable fixes) is the asset - keep it primary, not subordinate to the level.
- Configurable weights invite gaming until the scored repo lands the desired label.
- 'Readiness' reads as certification/badge; L5-badge social cost; defensible only if checks are honest.
- Staleness: point-in-time history without comfreshness marker silently goes stale.

## Recommended responses (feed into FRAMEWORK v0.2)

1. **Define levels as sets of pillar gates** (a level = a required subset of pillars + a pass threshold per pillar), replacing the undefined N-1 aggregate rule. Add **Mandatory** flags on P2 and P6 so security/testing cannot be diluted by the aggregate.
2. **Split scoring:** deterministic numeric score (engine, structure) + separate judgment/qualitative assessment (clearly labeled, not in the numeric numerator). Keeps DoD reproducible.
3. **Add anti-gaming guards:** minimum-content judgment (README not empty, coverage threshold >= X if coverage is present), freshness timestamp in reports, rubric_version + config hash stamped in every report.
4. **Single source of truth:** engine is the scoring authority; the skill/prompt only orchestrates and reads the deterministic report. No dual implementations.
5. **Add security/quality hardening:** optional hard gates for secrets (scan in CI), supply-chain (audit), reproducibility (build.path / locked install). Keep optional so the tool stays usable on read-only repos.
6. **Re-frame output:** punchlist is primary; score is secondary. Present 'costliest feedback bottleneck first' rather than 'hit level N'.
7. Add a `--dry-run` (no write) default and keep report writes opt-in or under a dedicated .agent-readiness/ (git-ignored) dir.

These are incorporated as constraints into IMPLEMENTATION_PLAN milestones (mostly M2/M3) rather than re-planning from scratch.