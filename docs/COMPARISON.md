# Pi vs Droid Agent-Readiness: Comparative Analysis

> M10-M11: ran Factory Droid's `/readiness-report` and `/readiness-fix` on disposable test repos, extracted actual Droid system prompts from session traces, compared against pi's deterministic engine, and synthesized optimal prompts. This is a **trace-based** analysis (M11), not outcome-based inference (M10).

## Experiment setup

Three standalone git repos created at `/tmp/readiness-comparison/{low,med,high}` matching the existing `validation/corpus` calibration:

| Repo | Profile | Pi score | Droid score |
|---|---|---|---|
| `low` | Bare: 1 source file, no docs/tests/CI | L0 (11/100) | Level 1 (1/62 signals, 1.6%) |
| `med` | Minimal: thin README, bare package.json, 1-line .gitignore | L0 (17.2/100) | Level 1 (2/62 signals, 3.2%) |
| `high` | Rich: full docs, AGENTS.md, tests+config, CI, .env.example, .factory/ | L2 (79.3/100) | Level 1 (11/68 signals, 16.2%) |

Both systems ran on identical repos. Droid via `droid exec "/readiness-report"` and `droid exec "/readiness-fix"` (headless, `--auto high`). Pi via `node --experimental-strip-types src/cli.ts <repo> --json` and `--fix --agent`.

---

## Dimension 1: Pillar structure

| Droid (9 pillars) | Pi (10 pillars) | Mapping |
|---|---|---|
| Style & Validation | P5 Code Quality & Style | Direct overlap |
| Build System | P3 Build & Dependencies | Direct overlap |
| Testing | P2 Testing & Verification | Direct overlap |
| Documentation | P0 Documentation + P1 Agent Guidance | Droid merges; pi splits agent guidance (P1) as its own pillar |
| Dev Environment | P8 Environment & Onboarding | Direct overlap |
| Debugging & Observability | P7 Observability & Debuggability | Direct overlap |
| Security | P6 Security & Secrets | Direct overlap |
| Task Discovery | P9 Task Discovery & Modularity | Partial: pi P9 is modularity-focused; Droid includes issue/PR templates, labeling, backlog |
| Product & Experimentation | (no equivalent) | **Gap in pi**: no product analytics, feature flags, progressive rollout |
| (merged into Security/Build) | P4 CI / Automation & Gates | **Gap in Droid**: CI is distributed across Build System + Security rather than a dedicated pillar |

**Key difference**: Pi separates agent guidance (P1) as a first-class pillar with checks for AGENTS.md, hooks, droids, connectors. Droid folds this into Documentation and Dev Environment. Pi's approach is more agent-centric; Droid's is more ops-centric.

---

## Dimension 2: Criteria coverage

| Metric | Droid | Pi |
|---|---|---|
| Total criteria | ~68-80 (varies by repo) | ~50 (fixed) |
| Skipped criteria | Yes (context-aware) | No (all evaluated) |
| Behavioral verification | Yes (runs commands) | No (file/config presence only) |

### Criteria Droid has that pi lacks

| Criterion | Droid pillar | Feasible to add to pi? |
|---|---|---|
| Cyclomatic complexity analysis | Style & Validation | Yes (check for config) |
| Dead code detection (knip/vulture) | Style & Validation | Yes (check for config) |
| Duplicate code detection (jscpd/CPD) | Style & Validation | Yes (check for config) |
| Strict typing (`strict: true` in tsconfig) | Style & Validation | **Yes — added in M10** |
| Feature flag infrastructure | Build System | Hard (no standard file) |
| Release automation | Build System | Hard (no standard file) |
| Tech debt tracking (TODO scanning) | Build System | Medium (check for leasot config) |
| API schema docs (OpenAPI/Swagger) | Documentation | Yes (check for openapi.json) |
| Database schema docs | Documentation | Medium |
| Runbooks | Documentation | Yes (check for runbook dir) |
| Issue templates | Security/Task Discovery | **Yes — added in M10** |
| PR templates | Security/Task Discovery | **Yes — added in M10** |
| Issue labeling system | Security/Task Discovery | Hard (requires API) |
| Min release age | Security | Hard (requires policy) |
| Health checks | Debugging | Medium (check for /health endpoint) |
| Circuit breakers | Debugging | Hard (requires code analysis) |
| Profiling instrumentation | Debugging | Hard |
| Log scrubbing | Debugging | Medium |
| Error-to-insight pipeline | Debugging | Hard (requires integration) |
| DAST scanning | Security | Hard (requires deployed service) |
| PII handling | Security | Hard (requires code analysis) |
| Privacy compliance | Security | Hard (requires policy) |
| Product analytics | Security/Task Discovery | Hard (requires SDK detection) |
| Test naming conventions | Testing | Medium (check jest/pytest config) |
| Flaky test detection | Testing | Hard (requires retry config) |
| Test performance tracking | Testing | Hard (requires timing config) |
| Interactive QA (runnable) | Testing | Hard (requires running the app) |
| Documentation freshness | Documentation | Yes (check git log for doc files) |
| AGENTS.md validation | Documentation | Medium (check for CI/hook) |
| Automated doc generation | Documentation | Yes (check for typedoc/jsdoc config) |

### Criteria pi has that Droid handles differently

| Pi check | Droid equivalent | Difference |
|---|---|---|
| P1.6 Hooks (.factory/hooks.json) | Checked under Agentic Development | Same intent, different grouping |
| P1.7 Custom droids | Checked under Agentic Development | Same intent |
| P1.8 Connectors | Checked under Agentic Development | Same intent |
| P0.6 H1 in README | Not explicitly checked | Pi is more specific |
| P3.6 Dev/prod split | Not explicitly checked | Pi unique |
| P9.4 Per-module docs | Not explicitly checked | Pi unique |

---

## Dimension 3: Scoring methodology

| Aspect | Droid | Pi |
|---|---|---|
| Scoring type | Agent-driven (reads + judges) | Deterministic (code checks) |
| Reproducibility | Non-deterministic (agent may vary) | Fully reproducible |
| Nuance | High (understands context, skips irrelevant) | Low (presence-only, no context) |
| Behavioral verification | Yes (runs `npm test`, checks if vitest installed) | No (checks if vitest.config.ts exists) |
| False positives | Low (agent can reason about config quality) | Possible (stub files pass) |
| False negatives | Possible (agent may miss things) | Low (exhaustive file checks) |
| Speed | ~60-300s per repo (agent reasoning) | <1s per repo (deterministic) |

**Critical finding**: On the high repo, Droid discovered that `npm test` fails because vitest isn't installed, even though `vitest.config.ts` exists. Pi passes P2.2 (test config) because the config file exists. This is pi's biggest weakness: **presence ≠ signal**.

---

## Dimension 4: Level assignment

| Repo | Pi level | Droid level | Why the difference |
|---|---|---|---|
| low | L0 (11/100) | Level 1 (1.6%) | Droid starts at L1 by default; pi has L0 for "barely parses" |
| med | L0 (17.2/100) | Level 1 (3.2%) | Same — Droid's floor is L1 |
| high | L2 (79.3/100) | Level 1 (16.2%) | **Major disagreement**: Droid found the tooling doesn't actually work (vitest not installed, ESLint not installed, tsconfig is empty, package-lock.json is empty). Pi passed these checks because files exist. |

**Key insight**: Droid's behavioral verification makes it much stricter on repos that have "decorative" config files. Pi's presence-based checks are fooled by stub files. The high repo is a perfect example: it looks ready structurally (pi says L2) but nothing actually runs (Droid says L1).

---

## Dimension 5: Remediation prompt quality

### Pi's `agentPromptFor()` output (low repo)

```
You are remediating agent-readiness failures in a codebase.

Current readiness: L0 (11/100), rubric 0.3.0.

The following checks are failing, sorted by severity then difficulty:

- [high/basic] P2 P2.1: test files/dir
- [high/basic] P3 P3.1: lockfile
- [high/basic] P3 P3.4: dependency manifest
[... 12 more items]

Instructions:
1. Work through the failing checks from top to bottom.
2. For each check, create or modify the specific file(s) needed.
3. Only touch files that are directly relevant.
4. After applying fixes, re-run the readiness engine.
5. If a mandatory gate would regress, stop and report it.
6. Prefer project-specific, real content over generic templates.
7. For AGENTS.md, include backtick-quoted commands that match real scripts.

Safety:
- Default to dry-run: show proposed changes before applying.
- Never commit secrets or remove existing tests.
- If a fix requires domain knowledge you don't have, note it and skip.
```

**Issues identified**:
- Lists 15 items with generic evidence strings ("test files/dir", "lockfile")
- No instruction to install real dependencies
- No instruction to verify fixes actually work (behavioral)
- No instruction to negative-test
- No instruction to commit
- No project context (language, existing structure)
- Action descriptions are generic ("Configure a linter (eslint/biome/ruff/golangci)")
- No mention of what to do after fixes

### Droid's `/readiness-fix` behavior (low repo)

Droid picked ONE criterion (type_check), and:
1. Read the repo to understand it's a TypeScript project
2. Created `tsconfig.json` with `"strict": true` and 6 additional strict flags
3. Created `package.json` with `typecheck` and `build` scripts
4. Installed TypeScript 7.0.2 as an exact-pinned devDependency
5. Created `.gitignore` with proper patterns
6. Committed `package-lock.json` pinning the dependency tree
7. **Verified**: ran `npm run typecheck` (exit 0)
8. **Negative-tested**: introduced `const s: string = 42`, confirmed `tsc` caught it (TS2322), removed the error
9. **Verified build**: ran `npm run build`, confirmed `dist/index.js` + `dist/index.d.ts` emitted
10. Explained why this criterion was chosen and what to tackle next

**Droid's action items (from /readiness-report)**:
- "Add a README.md and AGENTS.md documenting the project (purpose, setup, and dev workflow)"
- "Create `package.json` with a TypeScript setup (build/test scripts, pinned deps via lockfile) plus `.gitignore`"
- "Note: the configured remote returns 404, so remote-backed checks were evaluated on local evidence only"

**Strengths of Droid's approach**:
- Action items are specific and actionable (mentions exact files, exact configs)
- Groups multiple criteria into single high-leverage actions
- Behavioral verification ensures fixes actually work
- Negative testing proves the tool catches violations
- One fix done thoroughly > many fixes done superficially
- Commits with descriptive messages

**Weaknesses of Droid's approach**:
- Non-deterministic (different runs may pick different criteria)
- Slower (60-300s per fix vs pi's <1s for report generation)
- Only fixes one criterion per `/readiness-fix` invocation
- Requires `gh` CLI and git remote for full assessment

---

## Dimension 6: Monorepo handling

| Aspect | Droid | Pi |
|---|---|---|
| App discovery | Built-in (detects monorepo structure) | `discover.ts` (M8): workspaces, pnpm, turbo, nx, go.work, Cargo |
| Per-app scoring | Shows `numerator/denominator` per app | `perApp` breakdown in pillar scores |
| Scope tagging | Implicit (agent reasons about scope) | Explicit: `scope: 'repo' | 'app'` on each pillar |

Both handle monorepos, but pi's approach is deterministic and explicit while Droid's is agent-driven.

---

## Dimension 7: Difficulty axis

| Aspect | Droid | Pi |
|---|---|---|
| Levels | Basic / Intermediate / Advanced | basic / intermediate / advanced |
| Usage in sorting | Used for action item prioritization | Punchlist sorted by severity then difficulty |
| Impact on remediation | Droid picks the most foundational (often Basic) | Pi lists all, sorted cheapest-first |

Same concept, implemented independently. Pi's sorting is correct (cheapest high-impact first), but Droid's focus-on-one approach is more effective for actual remediation.

---

## Synthesis: Optimal prompt design

### What to take from Droid

1. **Behavioral verification**: "run the actual command, confirm it exits 0"
2. **Negative testing**: "introduce a deliberate violation, confirm the tool catches it"
3. **Install real dependencies**: not just config stubs
4. **Commit after each fix**: with descriptive messages
5. **More specific action items**: "Create `eslint.config.js` with recommended rules, install `eslint` as devDependency, add `lint` script" vs "Configure a linter"
6. **Group related criteria**: "Add README + AGENTS.md + package.json unlocks multiple criteria at once"
7. **Project context in prompt**: language, existing structure
8. **Mention remaining items**: after current batch, note what's left

### What to keep from pi

1. **Sorted punchlist**: severity then difficulty ordering is correct
2. **Deterministic evidence**: specific evidence strings ("README.md 0b, 0 content lines")
3. **Safety rules**: mandatory gate protection, dry-run default
4. **Rubric versioning**: stamping rubric_version + config_hash
5. **Re-run verification**: "re-run the engine to confirm score improved"
6. **Check-specific verification**: "check that the specific check IDs you fixed now pass"

### New checks to add

1. **P5.6 Strict TypeScript**: `tsconfig.json` with `"strict": true` (not just existence)
2. **P4.6 Issue templates**: `.github/ISSUE_TEMPLATE/` directory
3. **P4.7 PR templates**: `.github/PULL_REQUEST_TEMPLATE.md` or `.github/pull_request_template.md`

These are the highest-impact missing checks that are feasible to implement deterministically and directly address the "presence ≠ signal" gap for the most common case.

---

## Implementation (M10 + M11)

### M10 (outcome-based inference)
1. **`fix.ts`**: Rewrote `agentPromptFor()` with behavioral verification, negative testing, dependency installation, commit instructions, project context, and grouped action items
2. **`checks.ts`**: Added P5.6 (strict TypeScript), P4.6 (issue templates), P4.7 (PR templates)
3. **`engine.ts`**: Updated `actionById` map with detailed, Droid-inspired action descriptions

### M11 (trace-based analysis)
After extracting Droid's actual system prompts from session traces at `~/.factory/sessions/`:

4. **Trace artifacts**: Saved Droid's actual `/readiness-report` prompt (52K chars, 84 criteria, 5 phases) and `/readiness-fix` prompt (40K chars, failing signals with descriptions and evaluation instructions) to `docs/traces/`
5. **Criteria mapping**: Created `docs/traces/criteria-mapping.md` mapping all 84 Droid criteria to pi checks (15 aligned, 9 partial, 20 feasible gaps, 40 agent-only)
6. **20 new checks added** to `checks.ts`:
   - P0.7 (documentation freshness), P0.8 (automated doc generation), P0.9 (API schema docs)
   - P2.7 (integration tests), P2.8 (test naming conventions), P2.9 (test isolation)
   - P4.8 (issue labeling system), P4.9 (release automation)
   - P5.7 (naming consistency), P5.8 (dead code detection), P5.9 (duplicate code detection), P5.10 (cyclomatic complexity), P5.11 (unused dependencies detection), P5.12 (large file detection tooling)
   - P7.5 (distributed tracing), P7.6 (metrics collection), P7.7 (error tracking), P7.8 (product analytics), P7.9 (runbooks documented)
   - P8.6 (local services setup)
7. **Quality standards section** added to `agentPromptFor()` — direct adoption from Droid's `/readiness-fix` prompt: "NO empty placeholder files", "NO minimal implementations that technically pass", "NO disabling checks", BAD/GOOD fix examples
8. **actionById** expanded with detailed descriptions for all 20 new checks
9. **Rubric bumped to 0.5.0** — pi now has ~73 checks covering 35 of Droid's 84 criteria (42%, up from 25%)
10. 98 assertions across 6 test suites, all pass; E1 harness all pass (H1 gap=55)

### Key insight from trace analysis

M10 inferred Droid's prompt quality from output behavior. M11 revealed the actual prompts are **much richer**:
- Droid's `/readiness-fix` prompt is 40K chars, includes full criterion descriptions and evaluation instructions for every failing signal
- Droid has explicit quality standards with BAD/GOOD examples
- Droid uses a 5-phase evaluation process (scan, discover, evaluate, validate, report)
- Doid's scoring is flat pass-rate (L1: 0-20%, L2: 20-40%, etc.) vs pi's pillar-based 80% N-1 gating
- Both approaches are valid: pi's is deterministic and reproducible; Droid's is nuanced and context-aware

## Raw data

### Droid /readiness-report on low repo (excerpt)

```
Level 1
Score: 1/62 non-skipped signals passed (1.6%)

Style & Validation: 0/9 (linter, type check, formatter, pre-commit, strict, naming, complexity, dead code, dup code)
Build System: 1/14 (only VCS CLI tools passed)
Testing: 0/10
Documentation: 0/8
Dev Environment: 0/4
Debugging & Observability: 0/13
Security: 0/8

Action Items:
- Add README.md and AGENTS.md documenting the project
- Create package.json with TypeScript setup + .gitignore
- Remote returns 404, so remote-backed checks evaluated on local evidence only
```

### Droid /readiness-fix on low repo (excerpt)

```
Selected: type_check (Type Checker, was 0/1)

Changes:
- tsconfig.json: strict mode + 6 additional strict flags
- package.json: typecheck + build scripts, TypeScript 7.0.2 devDependency
- .gitignore: node_modules/, dist/, .env, .DS_Store
- package-lock.json: committed lockfile

Verification:
1. npm run typecheck → exit 0
2. Negative test: const s: string = 42 → TS2322, exit 1 (removed)
3. npm run build → dist/index.js, dist/index.d.ts emitted
```

### Droid /readiness-fix on med repo (excerpt)

```
Selected: lint_config (Code Quality Tooling)

Changes:
- package.json: replaced bare { "name": "acme" } with real manifest + lint script + devDeps
- eslint.config.js: flat-config with @eslint/js + typescript-eslint + hardening rules

Verification:
- npm run lint → exit 0
- Negative test: any param + unused var + console.log → 2 errors + 1 warning, exit 1 (removed)
```
