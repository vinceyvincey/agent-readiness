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

## M4 - History + evaluation - DONE
- [x] .agent-readiness/history.json per repo; append-only log (src/history.ts).
- [x] Trend compare (readHistory + trend) with overall/level/per-pillar deltas.
- [x] --history CLI flag; --badge inline markdown badge (src/badge.ts).
- Verify: two-run demo showed diffable history (tmp: 13.5 -> 18.8, delta +5.3); real repo history seeds L0/26.3; .agent-readiness git-ignored; history + badge unit tests pass. writeReport appends history automatically.

## M4.5 - Validation harness & hypothesis gates - DONE (harness + first evidence)
- [x] validation/build-corpus.ts - calibrated smoke corpus (high=L2/79.3, med=L0/17.2, low=L0/11).
- [x] validation/run-harness.ts - E1 harness: H3 stability, H5 mandatory gates, H1 E1-separation (gap 68), H8 scaffold-effect - ALL PASS.
- [x] validation/e2-run.ts - E2 behavioral harness (bug-fix task), pinned harness+model.
- [x] First E2 evidence: high successRate 1.0, low 0.0 (2 trials, n=1) - direction matches H1, small-n not yet validated.
- [x] Commit smoke runs to docs/validation/M45.md.
- Note: H1/H2 full validation needs >=10 repos / >=5 per cohort (M5); E1 preconditions (H3,H5,H8) already passing.

## M5 - Validation & dogfood - DONE
- [x] docs/INSTALL.md - symlink + pi-package install instructions.
- [x] pi package metadata (package.json pi manifest: extensions + skills; peerDeps).
- [x] package-load resilient extension (engine path fallback); verified boots as pi package.
- [x] Dogfood on real projects: pdf-mcp (python) surfaced language-bias bugs -> FIXED engine (python pytest/lockfile awareness); pdf-mcp 51.7 -> 59.
- [x] Fix-loop demo: applied auto-generated AGENTS.md to pdf-mcp copy -> 59 -> 67 (P1 0->60). Satisfies "score improves after --fix".
- [x] Dogfood on this repo: L0/26.3 (mandatory P2 gate holds - correct).
- Verify: score improves after --fix on a real project (pdf-mcp copy 59->67); engine tests pass; package installs/loads as a pi package.

## Post-critical-review constraints (feed M2/M3)
- Level identity = set of pillar gates + Mandatory flags (P2, P6); no singleton '80% aggregate'.
- Deterministic score separate from judgment narrative.
- rubric_version + config hash + freshness in every report/history.
- Engine single-source scoring; skill only orchestrates.
- Dry-run default; .agent-readiness/ git-ignored writable opt-in.

## M6 - Check-correctness & git-aware foundations - DONE
- [x] Fixed P6.2 (was no-op): real tracked-file secret scan via `git ls-files` + 8 secret patterns + binary-file filtering.
- [x] Fixed P5.3 (was broken `read(r+'')`): proper manifest reading for pyproject/go/cargo type-check detection.
- [x] Fixed P6.3 (was filesystem-only): git-aware `git ls-files` check for tracked .env; .env.example/.env.sample excluded.
- [x] Removed dead code (`anyPatt`, `require_dummy`).
- [x] Git provenance stamped in report.run: commitHash, branch, hasLocalChanges, hasNonRemoteCommits.
- [x] test/checks.test.ts: 9 assertions (P6.2 planted-secret, P5.3 pyproject/go, P6.3 git-ignored/tracked .env).
- Verify: all 4 test suites pass; self-score unchanged (L0/30); P6.2 scans 71 real tracked files.

## M7 - Anti-gaming & check deepening - DONE
- [x] README anti-stub (P0.1): strip frontmatter + HTML comments, require >=2 content lines + >200 bytes.
- [x] AGENTS.md command verification (P1.2): extract backtick/fenced commands, verify >=1 matches a real script/target.
- [x] .gitignore anti-one-liner (P6.1): require >=3 distinct non-comment patterns.
- [x] Coverage threshold guard (P2.4): fail if threshold=0 (decorative); pass only on real threshold > 0.
- [x] CI-runs-tests verification (P4.2): parse workflow YAML for real test/lint invocations (strip echo stubs).
- [x] Real secret scanning (P6.4): optional gitleaks/trufflehog on PATH, fallback to regex scan.
- [x] Test-speed proxy (P2.6): detect fast/smoke scripts, vitest/jest testPathIgnorePatterns.
- [x] Difficulty axis: each check tagged basic/intermediate/advanced; punchlist sorted severity→difficulty.
- [x] Droid harness surfaces: P1.6 (hooks), P1.7 (custom droids), P1.8 (connectors) — .factory/ + .pi/ paths.
- [x] test/deepening.test.ts: 16 assertions; rubric bumped to 0.2.0; corpus recalibrated (high L2/81).
- Verify: all 5 test suites pass; E1 harness all pass (H3, H5, H1 gap=70, H8).

## M8 - Monorepo / application scope - DONE
- [x] src/discover.ts: discoverApps(root) detects package.json workspaces, pnpm-workspace, turbo/nx/lerna, apps/*/packages/ globs, go.work, Cargo workspace members, Python packages/.
- [x] Pillar scope tagging: P0/P1/P4/P6/P8 = repo-scoped; P2/P3/P5/P7/P9 = app-scoped.
- [x] Engine runs app-scoped checks per discovered app; aggregate score = sum(passed)/sum(total) across apps.
- [x] Report includes `apps` map + per-app `perApp` breakdown for app-scoped pillars.
- [x] Findings for app-scoped checks carry `app` field.
- [x] test/monorepo.test.ts: 17 assertions (discovery, perApp, app field, no single-app regression).
- Verify: all 6 test suites pass; E1 harness all pass; single-app repos unchanged (no regression).

## M9 - Agentic remediation - DONE
- [x] src/fix.ts: agentPromptFor(report) builds grounded remediation prompt (severity+difficulty sorted, evidence, app context, safety instructions).
- [x] Extension /readiness-fix rewritten to delegate to agent session with grounded prompt.
- [x] CLI --fix --agent: shells out to `pi -p <prompt>`; prints prompt if pi not on PATH; re-runs readiness post-fix.
- [x] Static --fix (no --agent) unchanged for headless/CI use.
- [x] Safety: dry-run default, only touch files for failing checks, mandatory-gate regression detection, re-run verification.
- [x] test/fix.test.ts: 13 assertions (prompt content, monorepo awareness, static draft no regression).
- Verify: all 6 test suites pass; E1 harness all pass.

## M10 - Droid comparison + synthesized optimal prompts - DONE
- [x] Experiment: ran Factory Droid's `/readiness-report` and `/readiness-fix` on 3 calibrated test repos (low/med/high) in /tmp.
- [x] Captured Droid output: Level 1 for all repos, ~62-68 criteria, behavioral verification (ran `npm test`, found vitest missing), context-aware skipping, one-fix-done-thoroughly remediation with negative testing.
- [x] Captured pi output: L0/L0/L2, 50 checks, presence-based only, 15-item punchlist prompt.
- [x] docs/COMPARISON.md: full side-by-side analysis across 7 dimensions (pillars, criteria, scoring, levels, remediation, monorepo, difficulty).
- [x] Rewrote agentPromptFor() in fix.ts: behavioral verification, negative testing, dependency installation, commit-after-each-fix, top-5 focus, project context, more specific action descriptions.
- [x] New checks (presence → signal): P5.6 strict TypeScript (`"strict": true`), P4.6 issue templates, P4.7 PR templates.
- [x] Updated actionById in engine.ts with Droid-inspired detailed remediation instructions.
- [x] Rubric bumped to 0.4.0; SKILL.md updated.
- [x] test/fix.test.ts: 19 assertions (6 new for M10 prompt features). test/checks.test.ts: 15 assertions (6 new for M10 checks).
- Verify: all 6 test suites pass (87 total assertions); E1 harness all pass; H1 gap=68.

## M11 - Droid trace analysis + full criteria alignment - DONE
- [x] Extracted Droid's actual `/readiness-report` system prompt (52K chars, 84 criteria, 5 phases) from session traces at ~/.factory/sessions/.
- [x] Extracted Droid's actual `/readiness-fix` prompt (40K chars, failing signals with descriptions and evaluation instructions).
- [x] Saved trace artifacts to docs/traces/ (report prompt, fix prompt, 84-criteria CSV, criteria mapping).
- [x] Created docs/traces/criteria-mapping.md: full 84-criteria mapping (15 aligned, 9 partial, 20 feasible gaps, 40 agent-only).
- [x] Added 20 new deterministic checks to checks.ts: P0.7-P0.9, P2.7-P2.9, P4.8-P4.9, P5.7-P5.12, P7.5-P7.9, P8.6.
- [x] Enriched agentPromptFor() with Droid's quality standards: "NO empty placeholder files", "NO minimal implementations", BAD/GOOD fix examples.
- [x] Updated actionById with detailed descriptions for all 20 new checks (now covers 73 check IDs).
- [x] Rubric bumped to 0.5.0; pi now covers 35 of Droid's 84 criteria (42%, up from 25%).
- [x] test/checks.test.ts: 22 assertions (7 new for M11). test/fix.test.ts: 22 assertions (3 new for M11 quality standards).
- Verify: all 6 test suites pass (98 total assertions); E1 harness all pass; H1 gap=55.

## M12 - Criterion registry + hybrid architecture - DONE
- [x] Created src/criteria-registry.ts: 84-criterion registry with descriptions, evaluation instructions, pi mappings (47 mapped, 36 agent-only).
- [x] Rewrote agentPromptFor() to include full criterion descriptions + evaluation instructions per failing check (like Droid's /readiness-fix prompt).
- [x] Added "Additional criteria" section to prompt: all 36 agent-only criteria with descriptions and evaluation instructions.
- [x] Added "Scoring model (deterministic floor, agent ceiling)" section: agent verifies deterministic findings, discovers agent-only criteria, augments score.
- [x] Engine re-exports registry functions (getCriterionByPiId, getAgentOnlyCriteria, etc.).
- [x] Rubric bumped to 0.6.0; SKILL.md updated.
- [x] test/criteria-registry.test.ts: 26 assertions (registry completeness, mappings, lookups).
- [x] test/fix.test.ts: 29 assertions (7 new for M12: descriptions, evaluation, agent-only section, hybrid scoring).
- Verify: all 7 test suites pass (131 total assertions); E1 harness all pass; H1 gap=55.

## M13 - Side-by-side evaluation harness - DONE
- [x] validation/side-by-side.ts: reusable harness that runs pi deterministic engine, pi hybrid (agentPromptFor via droid exec), and Droid /readiness-report on same repos, parses all outputs, compares criteria-by-criteria, and optionally runs both fix approaches.
- [x] Pi hybrid assessment: deterministic floor (pi engine) + agent ceiling (agentPromptFor via droid exec). Agent verifies findings behaviorally, discovers 36 agent-only criteria, fixes verified failures. Engine re-run for ceiling score. Captures fixed check IDs, agent-only criteria mentioned, files changed, commits.
- [x] Droid output parser: handles multiple Droid output formats (level line variations, bold/non-bold signals, combined signal lines with " / " separator, "skipped" and "null" skip markers, fallback pass-rate computation from signals).
- [x] 3-way criteria comparison: pi deterministic vs Droid, pi hybrid vs Droid. Classifies as agree-pass, agree-fail, pi-lenient, pi-strict, agent-only.
- [x] Fix comparison: runs pi hybrid (includes fixes) and Droid /readiness-fix on disposable repo copies, compares score delta, files changed, commits made.
- [x] Output: structured JSON + readable markdown report with 3-way summary table, per-repo criteria comparison, hybrid assessment details, fix results, and insights section.
- [x] test/side-by-side.test.ts: 58 assertions (parser, comparison, hybrid comparison, summary, fix result, markdown rendering).
- Verify: all 8 test suites pass (189 total assertions); E1 harness all pass; H1 gap=55.
- Eval results on corpus repos (3-way):
  low: pi=8.4 → hybrid=41 (+32.6, 22 checks fixed, 37 agent-only mentioned) vs droid=1.6%
  med: pi=15.2 → hybrid=67.7 (+52.5, 40 checks fixed, agent timed out) vs droid=3.3%
  Key finding: pi hybrid combines assessment + remediation (floor→ceiling), while Droid /readiness-report is assessment only (original state). Hybrid "pi-lenient" cases = pi fixed the check, Droid evaluated original which still fails.

## M14 - 30 new deterministic checks + assessment/remediation split - DONE
- [x] Added `skipped?: boolean` to CheckResult — checks that can't run (e.g., gh-CLI when not authenticated) are excluded from scoring, not counted as failures.
- [x] 9 gh-CLI deterministic checks: P3.7 (vcs_cli_tools), P4.10 (fast_ci_feedback), P4.11 (build_performance_tracking), P4.12 (deployment_frequency), P4.13 (backlog_health), P6.6 (branch_protection), P6.7 (automated_security_review), P2.10 (flaky_test_detection), P5.13 (code_quality_metrics). These use `gh` CLI API calls and skip when gh is not available or repo has no real remote.
- [x] 21 config-file deterministic checks: P1.9 (agents_md_validation), P2.11 (test_performance_tracking), P3.8 (monorepo_tooling), P3.9 (version_drift_detection), P3.10 (min_release_age), P4.14 (feature_flag_infrastructure), P4.15 (release_notes_automation), P4.16 (progressive_rollout), P4.17 (rollback_automation), P5.14 (tech_debt_tracking), P5.15 (dead_feature_flag_detection), P5.16 (heavy_dependency_detection), P6.8 (privacy_compliance), P6.9 (dast_scanning), P7.10 (alerting_configured), P7.11 (deployment_observability), P7.12 (health_checks), P7.13 (profiling_instrumentation), P7.14 (error_to_insight_pipeline), P8.7 (interactive_qa_exists), P8.8 (database_schema).
- [x] Updated criteria registry: 30 formerly agent-only criteria now mapped to pi check IDs. 77/84 (92%) now deterministic, only 7 truly agent-only (devcontainer_runnable, n_plus_one_detection, unit_tests_runnable, interactive_qa_runnable, circuit_breakers, pii_handling, log_scrubbing).
- [x] Created assessmentPromptFor() in fix.ts — instructs agent to verify deterministic findings behaviorally, discover 7 agent-only criteria, and report augmented score WITHOUT modifying files. This gives a fair comparison with Droid /readiness-report (both assessment-only on original repo state).
- [x] Updated side-by-side harness: hybrid assessment uses assessmentPromptFor (no file mods), fix comparison uses agentPromptFor (remediation) vs Droid /readiness-fix.
- [x] Updated actionById in engine.ts with remediation actions for all 30 new check IDs.
- [x] Rubric bumped to 0.7.0. ~103 total checks across 10 pillars.
- Verify: all 8 test suites pass (191 total assertions); E1 harness all pass (H1 gap=46).

## M15 - Enrich assessmentPromptFor with Droid-style 5-phase evaluation depth - DONE
- [x] Rewrote `assessmentPromptFor()` in `src/fix.ts` to mirror Droid's 5-phase methodology:
  - Phase 1: Repository Scan (language detection, repo structure exploration, git boundaries)
  - Phase 2: Application Discovery (identify independently deployable apps, record N, set denominators)
  - Phase 3: Criterion Evaluation (3a: verify all deterministic failures with full descriptions + evaluations; 3b: evaluate 7 agent-only criteria with full descriptions + evaluations + specific verification commands)
  - Phase 4: Report Validation (app count consistency, completeness, evidence quality, false positive identification)
  - Phase 5: Scoring & Report (augmented score = deterministic floor ± adjustments, structured output format)
- [x] New helper `agentOnlyVerificationCommands(droidId)`: exact shell commands for each of the 7 agent-only criteria (devcontainer_runnable, n_plus_one_detection, unit_tests_runnable, interactive_qa_runnable, circuit_breakers, pii_handling, log_scrubbing)
- [x] Full (non-truncated) descriptions and evaluation instructions from registry for ALL failing checks, grouped by pillar
- [x] ALL failing checks shown (not just top 10), organized by pillar for readability
- [x] Skip condition notes ([Skippable]) for skippable criteria
- [x] Structured output format: Verification Results, Agent-Only Criteria, Application Discovery, Augmented Score, Action Items
- [x] Monorepo awareness: app list included in prompt when multiple apps detected
- [x] Rubric bumped to 0.8.0. Added 32 new assertions in test/fix.test.ts for assessment prompt (5 phases, verification commands, all 7 agent-only droidIds, scope info, app discovery, structured output, skip notes, monorepo awareness).
- Verify: all 8 test suites pass (223 total assertions); run 3-way side-by-side harness to measure agreement improvement.

## M16 - Close remaining parity gaps (3 parts) - DONE

## M17 - Visual HTML report - DONE
- [x] src/html-report.ts: renderHtml(report, {history}) — self-contained report.html (inline CSS + embedded __DATA__ + vanilla JS), light-first with dark autoswitch (prefers-color-scheme) AND html[data-theme] overrides for deterministic forcing.
- [x] Droid-inspired layout: sticky nav, hero with SVG score donut, "What changed" delta section + history sparkline (first run shows baseline), level ladder with 80%-gate lock states, Fix-next punchlist cards with copy buttons, pillar grid, filterable/searchable criteria table with expandable evidence, provenance + apps footer.
- [x] engine.writeReport always emits report.html (reads history before append so deltas compare vs previous run); html:false opt-out; best-effort (never blocks json/md).
- [x] CLI: --no-html, --open (xdg-open/open/start), artifacts path summary.
- [x] Extension /readiness-report notify points at report.html.
- [x] test/html-report.test.ts: content, XSS escaping, zero external refs, first-run vs update variants, level-lock parity with resolveLevel, structure, integration, size guard.
- [x] Browser-validated via agent-browser MCP: zero network requests, filter/search/expand/pillar-drill-down/copy interactions verified, light + dark screenshots captured under .agent-readiness/validate/.
- [x] Part A: 3 new deterministic grep-based checks — P7.15 (circuit_breakers), P7.16 (log_scrubbing), P6.10 (pii_handling). Agent-only 7→4. Pi-mapped 77→80.
- [x] Part B: Runtime verification layer — new `src/runtime-checks.ts`. `--verify` flag runs actual commands (`npm test -- --listTests`, `tsc --noEmit`, `npm run lint`, `npm run build`) to verify configs work, not just exist. Downgrades passing checks to failing when runtime verification fails. Language-aware (TS/JS, Python, Go, Rust). Handles missing commands/timeouts gracefully. New P2.12 (unit_tests_runnable) deterministic check. Agent-only 4→3. Pi-mapped 80→81 (96%).
- [x] Part C: Droid-compatible flat pass rate — `droidPassRate` field in ReadinessReport and report.md. Calculated as (non-skipped passing mapped criteria) / (total non-skipped mapped criteria). Enables direct score comparison with Droid's model.
- [x] Rubric bumped to 0.9.0. New test/runtime-checks.test.ts (31 assertions). Updated all affected tests. 9 test suites, 254 total assertions.
- [x] Runtime verification expanded: P4.1 (CI workflow YAML validation), P4.3 (pre-commit hooks run), P6.4 (vuln scan: npm audit/gitleaks/pip-audit/govulncheck/cargo audit), P5.8 (dead code: knip/vulture). Language-aware for TS/JS, Python, Go, Rust.
- [x] --droid-scoring flag: uses Droid's flat pass rate for level calculation (L1-L5 = 0-20% → 80-100%). resolveLevelDroid() function. droidScoring boolean in report. Shows scoring model in report.md.
- Verify: all 9 test suites pass (283 total assertions).

## Cross-cutting acceptance criteria
- No third-party runtime for the skill-only path (pi can run shell builtins).
- Every deterministic check documented: file glob + evidence rule + pass/fail.
- Reports diffable (stable ordering, sorted).
- Licensing/attribution of OSS ideas tracked (docs/CREDITS).

## Definition of done
/readiness-report on any repo returns: level, per-pillar scores, high-priority actionable punchlist, and (with --strict) a CI-gateable exit code - deterministic and reproducible by humans and automation.