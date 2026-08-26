---
name: agent-readiness
description: Assess a codebase's readiness for autonomous AI coding agents across 10 pillars (documentation, agent guidance, testing, build, CI, code quality, security, observability, environment, modularity) and emit a level, per-pillar scores, and an actionable remediation punchlist. Use for readiness-report, readiness-fix, readiness-full, or whenever scoring a repository for agent operability, feedback-loop speed, or onboarding friction.
license: MIT
compatibility: pi shell with git + standard language toolchains (node, python, go, rust, etc.)
metadata:
  rubric_version: 0.9.0
  pillars: 10
  levels: L0-L5
---

# Agent Readiness

Assess how ready a repository is for autonomous AI coding agents. Output a report (markdown + JSON + visual HTML) with a level (L0-L5), per-pillar scores, and a high/med/low remediation punchlist. This is a **proxy** for agent operability: it measures structure and feedback-loop hygiene, not real behavior (see references/FRAMEWORK.md).

## Pi Commands

This skill ships with a pi extension (`.pi/extensions/agent-readiness/`) that registers three slash commands:

### `/readiness-report` — Deterministic audit (fast, ~3s)
Runs the deterministic engine (81 mapped checks across 10 pillars) and writes a report.
```
/readiness-report
/readiness-report --verify                # also run runtime verification (~10s)
/readiness-report --droid-scoring         # use Droid-compatible flat pass rate
/readiness-report --strict                # CI gate: exit 1 if P2/P6 fail
/readiness-report /path/to/repo           # target a specific repo
```

### `/readiness-fix` — Agent remediation
Runs the deterministic engine, then returns a grounded remediation prompt for pi to implement fixes.
```
/readiness-fix
/readiness-fix --verify                   # runtime-verify findings first (avoids fixing false positives)
/readiness-fix /path/to/repo
```

### `/readiness-full` — Full hybrid (assess + fix + validate)
**The full-power command.** Runs the deterministic floor with runtime verification, then returns a combined prompt that instructs pi to:
1. **Assess** — Verify each failing check by running the actual command. Discover the 3 agent-only criteria.
2. **Fix** — Implement fixes for confirmed failures, prioritized by severity.
3. **Validate** — Re-run commands to confirm fixes work.
4. **Re-run** — Run the engine again to measure the delta.
```
/readiness-full
/readiness-full --droid-scoring           # use Droid-compatible flat pass rate
/readiness-full --no-verify               # skip runtime verification (faster, less accurate)
/readiness-full /path/to/repo
```

### `readiness_check` tool
The agent can also call `readiness_check` directly as a tool at any time:
- `path` (optional): repo path, defaults to cwd
- `verify` (optional): run runtime verification
- `strict` (optional): CI gate mode

## Placement
- Extension: `.pi/extensions/agent-readiness/index.ts` (registers pi commands + tool)
- Engine: `src/engine.ts`, `src/checks.ts`, `src/fix.ts`, `src/runtime-checks.ts`
- Criteria: `criteria/P0..P9*.md`, one per pillar, loaded on demand
- Canonical model: `../../docs/FRAMEWORK.md` (single source of truth)
- Evidence & hypotheses: `../../docs/VALIDATION.md`, `../../docs/HYPOTHESES.md`

## Have to know before starting
1. **Pin the harness and model.** Validate only repo differences (Scaffold Effect). Record the model id in every report.
2. **Deterministic vs judgment.** Checks are either D (deterministic, via pi.find/grep/read/bash) or J (labeled judgment, narrative only, excluded from the numeric score). Never mix J into the numerator.
3. **Anti-gaming.** Presence checks must also check minimum content (e.g. README non-empty, coverage threshold, .gitignore not one-line).
4. **Write safety.** Default is dry-run to stdout; only write under an opt-in, git-ignored `.agent-readiness/` or when the user asks for files.
5. **Gating.** A level is entered only when each of that level's required pillars passes its threshold (`--strict` = non-zero exit on gate-miss).
6. **Runtime verification.** `--verify` actually runs commands (npm test, tsc, lint, build) to confirm configs work — not just exist. This catches false positives where a check passes deterministically but fails in reality.
7. **Droid-compatible scoring.** `--droid-scoring` uses a flat pass rate (0-100%) mapped to L1-L5 for direct comparison with Droid's scoring model.

## PHASE 1 - Inventory (deterministic)
Run from the target repo root. Collect:
1. Top-level file/dir listing: `pi.find({ pattern })` / `pi.ls('.')`.
2. Identify language/toolchain from config files (package.json, pyproject.toml, go.mod, Cargo.toml, *.csproj, mix.exs, pom.xml, requirements, tsconfig).
3. Git presence + remote (pi.bash `git rev-parse --is-inside-work-tree`, `git remote -v`).
4. Note monorepo / single-package / library.

## PHASE 2 - Per-pillar checks
For each pillar P0..P9:
1. Load `criteria/<pillar>.md`.
2. Run its DETERMINISTIC checks with pi (find/grep/read/bash) and record pass/fail + evidence path/line.
3. Run its JUDGMENT checks, writing a short labeled narrative (excluded from score).
4. Compute pillar score = satisfied checks / total deterministic checks.

## PHASE 3 - Score & resolve level
- Overall = weighted mean of pillar scores (weights from agent-readiness.config.json, default equal).
- Resolve level: enter L1..L5 via the 80% previous-level (N-1) gate on required pillars; Mandatory pillars P2 and P6 are hard gates (must pass to exceed L1).
- `--droid-scoring`: uses flat pass rate instead (L1: 0-20%, L2: 20-40%, L3: 40-60%, L4: 60-80%, L5: 80-100%).
- Record `rubric_version` (0.9.0) and a config hash.

## PHASE 4 - Recommendations
- Bucket failed deterministic checks: HIGH (blocks next level / feedback loop), MEDIUM, LOW.
- Suggest concrete remediation for HIGH (file path + content sketch).
- Report the top feedback-loop cost, not just 'raise level'.

## PHASE 5 - Emit report
- `agent-readiness-report.md` + `agent-readiness-report.json` + a visual, self-contained `report.html` (markdown + JSON + HTML).
- stdout summary: level, overall, per-pillar table, top punchlist.
- If `--strict`: exit code 1 on any Mandatory/hard gate miss.
- If `--history`: append to `.agent-readiness/history.json` (git-ignored), stamping timestamp + rubric_version.

## Output contracts
JSON shape (stable, sorted keys):
```json
{
  "rubric_version": "0.9.0",
  "config_hash": "",
  "repo": {"path": "", "git": "", "language": "", "project_type": ""},
  "apps": {},
  "pillars": {"P0": {"passed": 0, "total": 0, "pct": 0}, "...": {}},
  "weights": {},
  "overall": 0.0,
  "droidPassRate": 0.0,
  "droidScoring": false,
  "level": "L0",
  "judgment": [],
  "punchlist": [{"pillar": "", "id": "", "severity": "high", "action": "", "evidence": ""}],
  "run": {"date": "", "model": "", "strict": false, "commitHash": "", "branch": "", "hasLocalChanges": false, "hasNonRemoteCommits": false}
}
```

## Notes
- Missing a required scope under `--strict` fails the gate; otherwise report warns.
- For multi-repo/monorepo: score each independently-deployable component separately if asked.
- Never write into the target repo's tracked files without explicit user OK (default dry-run).
- 81 of 84 Droid criteria are mapped to deterministic checks. 3 remain agent-only (devcontainer_runnable, n_plus_one_detection, interactive_qa_runvable) — evaluated by the agent in `/readiness-full` or `/readiness-fix --agent`.
