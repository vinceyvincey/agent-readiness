# BASELINE.md - pre-implementation baseline (captured now, before we build)

> Recorded at commit <before>: the current state we are validating against. Hypotheses in HYPOTHESES.md will be measured relative to this baseline so we can see directional change and avoid post-hoc biasi.

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
- Keep a running table: date, rubric_version, repo, score, level, key strikethroughs, closing evidence.

> Goal: a referee-can-eight continuous record so trends are honest and comparable.
