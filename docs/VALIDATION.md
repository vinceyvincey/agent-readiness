# VALIDATION.md - evidence-based validation & dogfooding across the build

> How we continuously validate what we're building with multiple, independent evidence sources, so we stay considerate and evidence-driven as we build. Companion to HYPOTHESES.md (the SMART-goal spec).

## 0. Why this file

The framework's own thesis is that structure predicts agent performance. If we don't validate that claim, we're building a vanity metric on faith. Everything in HYPOTHESES.md is written to be tested, not assumed.

Principles:
1. No single evidence source is trusted. Scores are meaningful only when corroborated by independent behavior.
2. Control the harness - treat harness/model as variables to pin (see Scaffold Effect), never conflate them with repo readiness.
3. Pre-register before building. Hypotheses + thresholds are written now, before we observe results, to prevent post-hoc rationalization.
4. Dogfood, but know its ceiling. Dogfooding is a bootstrapping tool, never the whole story.

## 1. Evidence sources (5 independent channels)

A claim is 'validated' when at least 2 independent channels agree; a pain point that says otherwise is treated as a blocker.

| # | Source | What it is | Strengths & limits |
|---|--------|-----------|--------------------|
| E1 | Deterministic structural engine | The report: score, level, per-pillar %, checklist via 80% N-1 gate (report.json/report.md). | Reproducible, diffable, gateable. Limit: a proxy; presence, not behavior. |
| E2 | Behavioral task validation | Run a real agent on a standardizable unit of work (SWE-bench-style task success rate): does it succeed faster/better on higher-readiness repos? | Direct, hard to argue with. Limit: expensive, env-dependent; must pin harness+model. |
| E3 | Narrative judgment assessment | Separate labeled qualitative pass (is the run one-liner real? are the tests meaningful?), excluded from the numeric score. | Explains why; catches fake/empty files. Limit: not reproducible across models. |
| E4 | Independent / external repos | Apply the tool to repos we did not write and don't know well. | Fixes dogfooding's insider ceiling; broadens generality. |
| E5 | Critical-friend + peer review | Standing adversarial agents + humans interrogate the model, outputs, and recovered writing. | Catches design flaws (already proved valuable in CRITICAL_REVIEWS.md). |

## 2. The Scaffold Effect (pin the harness)

Research (KDD 2026 'Scaffold Effect') shows harness choice is a hidden variable: across harnesses, tokens per solved task can differ up to ~40x independent of the model. For us: when validating, fix the harness (pi) AND the model. Any difference in outcomes/tokens/cycles must be attributable to the repo, not the tool calling the repo.

Rule: every E2 run pins { runner: pi, model: <locked>, thinking: <locked>, cwd } and varies ONLY the repo readiness level.

## 3. Dogfooding discipline + its ceiling

We dogfood heavily (this repo + existing projects) per GitLab/JetBrains/PostHog practice: it surfaces real friction and builds empathy fast. BUT NN/g and others warn internal power-users know too much to represent real users, and our existence-checks are gameable by insiders. Mitigations:
- Pair each dogfooding result with an E4 external run and an E2 behavioral run.
- Never tune weights to 'score well on our own repo' - that is fitting your own bias.
- Treat 'dogfooding works' as necessary-not-sufficient (judge by HYPOTHESES acceptance criteria, not vibes).

## 4. Continuous validation loop (as we build)

Each milestone ends with a mini-validation pass running the smoke benchmark (below). If a milestone's acceptance criteria are not met (E1), we do not advance gates; if E2 shows a negative correlation direction, we stop and reconsider the model, never adjust the evidence to suit.

Baselines are captured now (E1 score of this repo, recorded in HYPOTHESES.md). Future runs stamp rubric_version + config hash so trends compare like-for-like.

## 5. Smoke benchmark suite (canonical)

A small deterministic corpus used for every E2 validation:
- Seed: pin harness/model; define 3 calibrated repos (low / med / high readiness per our scoring).
- Task: a SWE-bench-style micro-task per repo (a small documented change resolving a local issue), scored on resolve-success + tokens + time-to-first-success.
- Gates: run before/after a --fix on a target repo to confirm the predicted improvement direction.

Artifacts live under ./validation/ (git-ignored actualizations).

## 6. What 'validated' means (and what it stops)

A hypothesis is 'validated' = at least 2 independent channels agree within the goal's tolerances. Otherwise it is 'unvalidated'; we iterate the framework, never the evidence. A single-source score is NEVER treated as validation of behavior.

---
Every SMART goal lives in HYPOTHESES.md; milestone gates that consume them are in IMPLEMENTATION_PLAN.md. Committed evidence records: docs/CRITICAL_REVIEWS.md (already) and docs/validation/ (to come).