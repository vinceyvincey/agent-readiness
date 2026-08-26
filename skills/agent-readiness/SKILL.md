---
name: agent-readiness
description: Assess a codebase's readiness for autonomous AI coding agents across 10 pillars (documentation, agent guidance, testing, build, CI, code quality, security, observability, environment, modularity) and emit a level, per-pillar scores, and an actionable remediation punchlist. Use for readiness-report, readiness-fix, or whenever scoring a repository for agent operability, feedback-loop speed, or onboarding friction.
license: MIT
compatibility: pi shell with git + standard language toolchains (node, python, go, rust, etc.)
metadata:
  rubric_version: 0.5.0
  pillars: 10
  levels: L0-L5
---

# Agent Readiness

Assess how ready a repository is for autonomous AI coding agents. Output a report (markdown + JSON) with a level (L0-L5), per-pillar scores, and a high/med/low remediation punchlist. This is a **proxy** for agent operability: it measures structure and feedback-loop hygiene, not real behavior (see references/FRAMEWORK.md).

## Placement
- Skill: `skills/agent-readiness/` (this dir).
- Criteria: `criteria/P0..P9*.md`, one per pillar, loaded on demand.
- Canonical model: `../../docs/FRAMEWORK.md` (single source of truth).
- Evidence & hypotheses: `../../docs/VALIDATION.md`, `../../docs/HYPOTHESES.md`.

## Have to know before starting
1. **Pin the harness and model.** Validate only repo differences (Scaffold Effect). Record the model id in every report.
2. **Deterministic vs judgment.** Checks are either D (deterministic, via pi.find/grep/read/bash) or J (labeled judgment, narrative only, excluded from the numeric score). Never mix J into the numerator.
3. **Anti-gaming.** Presence checks must also check minimum content (e.g. README non-empty, coverage threshold, .gitignore not one-line).
4. **Write safety.** Default is dry-run to stdout; only write under an opt-in, git-ignored `.agent-readiness/` or when the user asks for files.
5. **Gating.** A level is entered only when each of that level's required pillars passes its threshold (`--strict` = non-zero exit on gate-miss).

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
- Record `rubric_version` (0.5.0) and a config hash.

## PHASE 4 - Recommendations
- Bucket failed deterministic checks: HIGH (blocks next level / feedback loop), MEDIUM, LOW.
- Suggest concrete remediation for HIGH (file path + content sketch).
- Report the top feedback-loop cost, not just 'raise level'.

## PHASE 5 - Emit report
- `agent-readiness-report.md` + `agent-readiness-report.json` (same fields).
- stdout summary: level, overall, per-pillar table, top punchlist.
- If `--strict`: exit code 1 on any Mandatory/hard gate miss.
- If `--history`: append to `.agent-readiness/history.json` (git-ignored), stamping timestamp + rubric_version.

## Output contracts
JSON shape (stable, sorted keys):
```json
{
  "rubric_version": "0.5.0",
  "config_hash": "",
  "repo": {"path": "", "git": "", "language": "", "project_type": ""},
  "pillars": {"P0": {"passed": 0, "total": 0, "pct": 0}, "...": {}},
  "weights": {},
  "overall": 0.0,
  "level": "L0",
  "judgment": [],
  "punchlist": [{"pillar": "", "id": "", "severity": "high", "action": "", "evidence": ""}],
  "run": {"date": "", "model": "", "strict": false}
}
```

## Notes
- Missing a required scope under `--strict` fails the gate; otherwise report warns.
- For multi-repo/monorepo: score each independently-deployable component separately if asked.
- Never write into the target repo's tracked files without explicit user OK (default dry-run).