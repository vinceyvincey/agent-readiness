# HYPOTHESES.md - SMART goals, pre-registered before we build

> Every design claim we are making, expressed as a testable hypothesis with SMART goals (Specific, Measurable, Assessable, Relevant, Time-bound), written BEFORE implementation so we cannot rationalize after the fact.

## How to read a hypothesis
Each has: Claim / Why it matters / Sources (evidence channels from VALIDATION.md) / SMART goal / Falsify (what makes us abandon it).

---

## H1 - Structural readiness correlates with faster agent task success
- Claim: Repos scoring higher on our 10-pillar model let a standard agent task succeed at a higher rate with less time/tokens.
- Why: This is the framework's core thesis; if false, the structural proxy is vacuous.
- Sources: E1 (score) x E2 (behavior); E4 cross-repo.
- SMART: By M5, on a smoke corpus of >=10 distinct repos split into high vs low readiness cohorts (>=5 each), the median task success rate of the high cohort is >=0.25 higher (relative) than the low cohort, each task resolved via pinmodels/pi+fixed-model (controlled harness).
- Falsify: delta < 0.1, or the effect disappears when controlling for repo size/age.

## H2 - Feedback-loop turn-around is the dominant lead indicator
- Claim: The 'cost of feedback' (test-run distance, fast CI, run one-liner) predicts agent success better than any other single pillar.
- Why: Grounded in the model thesis and harrydaihaolin's 'feedback loops' rubric.
- Sources: E2 partitioned by pillar; E5 for logic.
- SMART: On the calibrated corpus, stratifying repos by 'run tests from shell in one step' latency (fast vs slow), the success gap between fast and slow cohorts exceeds the gap explained by any single other pillar, by >=20% of explained score variance.
- Falsify: another pillar (e.g. docs) explains the gap as well or better; feedback is not influential.

## H3 - The numeric score is a valid metric (not vanity)
- Claim: A single 0-100 score / L0-L5 level is stable across repeat runs of an unchanged repo (same rubric), and humans find it a practical artifact.
- Why: The whole point is a metric people can trend and gate CI on.
- Sources: E1 (repeat + history) x E5 (peer review); E4.
- SMART: Across 4 repeat runs of the same repo with the same rubric_version + config hash, the score is identical (no drift). A peer reviewer independently rates the report >=3/5 for actionability absent gaming.
- Falsify: scores drift with no rubric change; reviewer judges report unactionable.

## H4 - The narrative judgment section adds signal people act on
- Claim: Separating deterministic score from a labeled judgment narrative makes the punchlist more actionable than score alone.
- Why: Critical reviews flagged the single float as lossy; the narrative should restore lost signal.
- SMART: In a blind eval, >=60% of peers (n>=6) prefer punchlists that include the judgment section; and issues flagged in the narrative match the real high-priority bottleneck >=70% of the time.
- Falsify: no preference for narrative; labeled issues do not track observed bottlenecks.

## H5 - P6/P2 mandatory gates close the 'cheap-pillar inflation' loophole without blocking real promotion
- Claim: Per-pillar Mandatory flags (P2 testing, P6 security) prevent a repo clearing L3 on cheap pillars (docs/env) while failing security/tests.
- Why: Direct fix for critical-review finding that 80% aggregate is not a safety gate.
- SMART: On the smoke corpus, no repo passes L3+ with P2 coverage below threshold OR P6 with uncovered secrets; and a repo that genuinely improves P2/P6 actually promotes rather than getting stuck.
- Falsify: a repo passes L3 with P2/P6 failing, or a real improvement is blocked by a gate.

## H6 - The punchlist, not the level, is what users act on
- Claim: People act on the high-priority punchlist items, not on 'reach level N'.
- Why: Product review concluded the punchlist is the real product artifact.
- SMART: In a pilot, >=70% of users/agents who act on a report choose a punchlist item (not 'raise the level') as their first action, over a pilot of it >=4 participants.
- Falsify: users chase the level/number and not the punchlist.

## H7 - The dogfooding ceiling is real and E4 catches it
- Domain of study: our insider bias (internal power-users know too much). We need external viewers to surface blind spots.
- SMART: An independent reviewer (E4/E5), shown only the repo + our report, independently selects the same top-3 bottlenecks as the tool in >=2 of 3 external repos tested.
- Falsify: external reviewers routinely disagree with the tool's ordering.

## H8 - The scaffold effect does NOT contaminate our comparisons
- Claim: Score differences come from the repo, not from changing which model/harness called it.
- Why: If violated, we would misattribute model variance to repo readiness.
- SMART: Varying only the model (same harness, same repo) changes the deterministic score within the rubric epsilon (stability) while varying only the repo (same model) changes it more; delta between models < delta between repos.
- Falsify: changing the model shifts the score more than changing the repo.

## How we gate the build on this
- Keep this repo's own readiness smoke as a continuous baseline from the start.
- Nothing merges as DONE (M2..M5) without its associated hypothesis setup and a smoke run output committed to docs/validation/.
- A falsified hypothesis STOPS that workstream: update FRAMEWORK.md, re-sequence, do not ship.

---
Sequencing note: H1, H2 (core validity) and H3 (metric soundness) gate the whole build; H5, H6, H8 gate engine correctness; H7 gates the tool's external usefulness. See VALIDATION.md for evidence-source definitions.
