# BASELINE.md - pre-implementation baseline (captured now, before we build)

> Recorded at commit <before>: the current state we are validating against. Hypotheses in HYPOTHESES.md will be measured relative to this baseline so we can see directional change and avoid post-hoc bias.

## Baseline date
2026-02 (M0 end). Repo: this agent-readiness repo itself.

## Structural snapshot (what the tool will later score)
- Languages/config: no tsconfig yet (plan only). Docs-only repo. No test suite yet. No CI yet. No AGENTS.md yet. No devcontainer.
- By framework terms: currently roughly L0-L1 'Functional' - doc intent present (FRAMEWORK, PLAN, RESEARCH, ARCHITECTURE, REVIEWS, VALIDATION, HYPOTHESES), but no engine, no skill criteria, no gates, no CI.

## Behavioral baseline (E2, to be done at M4.5)
- Until the engine exists, E1 is theoretical. Placeholder: 'once the engine ships, run it on this repo and record score + level'.

## What we will compare against
- Same repo + same rubric_version, run again after each milestone. First meaningful comparison: post-M2 engine run vs this written baseline.
- Simple starter KPIs: README present (yes), AGENTS.md present (no), CI present (no), devcontainer (no), security scan (no), tests (no).

## Guardrails for this file
- This is evidence, not marketing: stale/over-optimistic records are worse than none. Refresh timestamps at each milestone run; keep old rows.
- Keep a running table: date, rubric_version, repo, score, level, key changes, closing evidence.

> Goal: an honest, refereeable continuous record so trends are honest and comparable.
## M1 measured run (skill, prompt-executed)
Date: 2026-02 (M1 close). Runner: pi 0.84.3 in print mode via the agent-readiness skill. Model: <session default>. Rubric v0.1.0.
Note: prompt-executed via skill; full deterministic engine is M2.

| Pillar | passed/total | pct | evidence |
|---|---|---|---|
| P0 Documentation | 3/6 | 50 | README non-empty+H1; docs/ present; no run/CHANGELOG/examples |
| P2 Testing | 0/6 | 0 | no tests/config/runner/coverage/fixtures (mandatory gate FAIL) |
| P6 Security | 2/5 | 40 | no committed secrets, no tracked .env; .gitignore weak, no vuln tooling (mandatory gate FAIL) |

Overall: ~L0-L1. Two mandatory gates (P2, P6) fail -> cannot exceed L1. This is by design at M1 (docs-only repo; no engine yet).
Full P0-P9 prompt audit exceeded the 120s shell ceiling -> so a complete picture is deferred to the M2 deterministic engine as the canonical E1 source (per VALIDATION.md).
