# FRAMEWORK.md - the agent-readiness model

> Our own framework, informed by Factory.ai, agent-next/agent-ready, kodustech, superduck-ai and harrydaihaolin. Native to pi: checks run with pi's own tools.

## Design thesis
Readiness ~= **the cost of feedback loops and the ratio of signal to clutter** a codebase offers an agent. A repo is 'ready' when it costs an agent few tokens to (a) navigate it, (b) discover how to run/verify it, and (c) get fast, reliable feedback - and when the owner has encoded stable contracts (docs, specs, AGENTS.md, CI gates) that keep it that way under churn.

## Pillars (10 scopes)
Every repo is scored across 10 scopes.

| Pillar | What it measures | Example checks |
|---|---|---|
| P0 Documentation | Roads signposted | README w/ run instructions; ARCHITECTURE.md; API docs; changelog; examples |
| P1 Agent Guidance | Does an agent know how to behave here? | AGENTS.md; CLAUDE.md; CONTRIBUTING.md; MCP config; hooks |
| P2 Testing & Verification | Fast, reliable feedback loops | unit/integration/e2e tests + config; coverage; fixtures; run-test one-liner; golden files |
| P3 Build & Dependencies | Deterministic, cacheable, documented | lockfile; build script; typo-free deps; no stderr noise; vendor hygiene |
| P4 CI / Automation & Gates | Machines enforcing contracts | CI workflow; pre-commit hooks; branch rulesets; lint/format in CI; dep-check |
| P5 Code Quality & Style | Signal over clutter | linter + config; formatter; tsconfig/types; no mega-files; no dead/dup code |
| P6 Security & Secrets | No landmines, guardrails | .gitignore covers caches/secrets; no committed secrets; dependency scan; least-priv |
| P7 Observability & Debuggability | Can an agent see reasons & traces? | structured logs; error handling; telemetry; dev-mode/mock hooks; idempotent scripts |
| P8 Environment & Onboarding | Reproducible env, low ramp-up | devcontainer; .env.example; pinned managers; setup script; non-GUI run path |
| P9 Task Discovery & Modularity | Find the right place to change | entry points explicit; repo shape (no monolith+soup); module boundaries; per-module docs |

Weights configurable (default equal 10% each) in agent-readiness.config.json.

## Levels (L0-L5) & gating
| Level | Name | Meaning | Gate to enter |
|---|---|---|---|
| L0 | Unknown | repo barely parses for an agent | (baseline) |
| L1 | Functional | code runs, linter + unit tests | >=80% on L0 level + P0/P2 baseline |
| L2 | Documented | processes written down, automation partial | >=80% L1 + P1 (AGENTS.md) |
| L3 | Standardized | contracts enforced (CI, tests, security scan) | >=80% L2 |
| L4 | Optimized | fast feedback, caching, low cognitive load | >=80% L3 |
| L5 | Autonomous | self-sustaining, self-improving | >=80% L4 |

**Gating rule:** to enter level N, repo must score >=80% on the *previous* (N-1) level's criteria. Prevents skip-ahead.

## Scoring
- Each check passes/fails deterministically (file exists, config present, measurable threshold). Runs with pi.grep/find/read/bash.
- Scope score = % satisfied checks in that pillar.
- Overall score = weighted mean of pillar scores.
- Level = highest whose previous gate is met.
- Recommendations = failed checks bucketed high/med/low.
- Report = agent-readiness-report.md (+ report.json, + history).

## Modes
- report - analyze & write report (default).
- --json - machine-readable.
- --strict - exit non-zero if any required scope missing (CI gate).
- --fix - generate/suggest remediations (draft AGENTS.md, workflows, devcontainer).
- --history - record & compare trend.

## Anti-goals
- NOT a full static-analysis taxonomy.
- NOT a substitute for real tests - validates structure; behavior verified separately.
- NOT a claim Factory's exact weights are right - ours are configurable.

## v0.2 corrections (from critical reviews)
- **Levels = sets of pillar gates**, not one aggregate %. Entry into a level requires the set of that level's required pillars to each pass their per-pillar threshold, plus the Mandatory P2/P6 hard gates. Max level resolved via the N-1 gate across those pillars.
- **Split epistemology:** the engine produces the deterministic numeric score (structure); a separate, clearly-labeled 'judgment assessment' is narrative and excluded from the numeric numerator - preserving a reproducible definition-of-done.
- **Anti-gaming guards:** minimum-content checks (e.g. README non-empty, coverage threshold defined if coverage is present), a freshness timestamp, and rubric_version + config-hash stamped in every report/history file.
- **Single source of truth:** the engine acts as scoring authority; the skill/prompt only orchestrates and reads the deterministic report. No dual scoring implementations.
- **Honest proxy:** structural scoring is explicit that it measures readiness hygiene and feedback-loop proxies, not real behavior. Real-behavior verification is a separate verify mode outside the existence score.
- **Write safety:** default is dry-run (report to stdout); report/history writes are opt-in under a git-ignored .agent-readiness/ directory.

## v0.3 enhancements (M6-M9)
- **Git-aware checks:** secret scanning (P6.2) and .env tracking (P6.3) now use `git ls-files` to inspect tracked files, not just filesystem presence. Reports stamp commit-hash + branch + dirty-state provenance.
- **Anti-gaming deepening:** README anti-stub (content-line count, not just bytes), AGENTS.md command verification (backtick commands must match real scripts), .gitignore minimum-pattern count, coverage threshold=0 guard (decorative coverage fails), CI-runs-tests verification (real test invocations, not echo stubs).
- **Difficulty axis:** each check carries `difficulty: basic | intermediate | advanced` (file-existence / content-regex / git-aware-external-tool). The punchlist is sorted by severity then difficulty so the cheapest high-impact fix surfaces first.
- **Droid harness surface checks:** P1 expanded with hooks (P1.6), custom droids/subagents (P1.7), and connectors (P1.8) — mirroring Droid's `.factory/` surfaces.
- **Monorepo / application scope:** pillars are tagged `repo` or `app` scoped. App-scoped pillars (P2, P3, P5, P7, P9) run per discovered sub-application; the report includes an `apps` map and per-app `perApp` breakdown. Non-monorepo repos are unaffected (single app at root).
- **Agentic remediation:** `agentPromptFor(report)` builds a grounded remediation prompt from the punchlist (severity + difficulty + evidence + app context). The extension's `/readiness-fix` delegates to an agent session; the CLI's `--fix --agent` shells out to `pi`. Static `--fix` drafts remain for headless/CI use.