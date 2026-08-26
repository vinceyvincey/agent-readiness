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

## Cross-cutting acceptance criteria
- No third-party runtime for the skill-only path (pi can run shell builtins).
- Every deterministic check documented: file glob + evidence rule + pass/fail.
- Reports diffable (stable ordering, sorted).
- Licensing/attribution of OSS ideas tracked (docs/CREDITS).

## Definition of done
/readiness-report on any repo returns: level, per-pillar scores, high-priority actionable punchlist, and (with --strict) a CI-gateable exit code - deterministic and reproducible by humans and automation.