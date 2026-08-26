# INSTALL.md - installing & using agent-readiness

Two ways: (a) in-repo symlink reference, or (b) install as a pi package.

## A. Symlink (for this project, auto-discovery)

Skills load from `~/.pi/agent/skills/`, `.pi/skills/` (project, after trust), or via a `skills` array in settings. The extension loads from `.pi/extensions/agent-readiness/`.

```bash
# global skill (no trust gate)
mkdir -p ~/.pi/agent/skills
ln -sfn /path/to/agent-readiness/skills/agent-readiness ~/.pi/agent/skills/agent-readiness

# or project-level
mkdir -p <project>/.pi/skills
ln -sfn /path/to/agent-readiness/skills/agent-readiness <project>/.pi/skills/agent-readiness
```

Project `.pi/settings.json` (explicit, trust-independent):
```json
{ "skills": ["<abs path>/skills/agent-readiness"] }
```

The extension is auto-discovered when this repo's project is open (`.pi/extensions/agent-readiness/`).

## B. Install as a pi package (npm/git/path)
1. From the repo root, the `pi` manifest in `package.json` declares `extensions: [".pi/extensions"]` and `skills: ["skills"]`. Install from a local path / git / npm:
```bash
pi install /abs/path/to/agent-readiness
pi install git:github.com/<you>/agent-readiness@v0.1.0
pi +e /abs/path/to/agent-readiness   # try without installing
```
`pi list` shows it once installed.

## Usage
- Skill: "/skill:agent-readiness" or model invocation "assess readiness of this repo".
- Slash commands (in a pi session with the extension):
  - `/readiness-report [/path]` - run audit, write report under .agent-readiness/.
  - `/readiness-fix` - show high-priority remediation to apply.
- Deterministic CLI (no pi needed):
```bash
node --experimental-strip-types src/cli.ts <repo> [--json|--strict|--fix|--apply|--history|--badge]
```
  - `--strict`: exit 1 if a Mandatory scope (P2 testing, P6 security) fails a gate (CI-gateable).
  - `--fix`: draft remediation to .agent-readiness/fix/ (dry-run); `--apply` writes into the repo.
  - `--history`: show score trend vs previous run.
  - `--badge`: emit an inline markdown readiness badge.

## Runtime requirement
- Node >= 20 for the CLI/engine (extension uses pi's bundled Node). Core scoring touches only filesystem + git; no third-party runtime for the skill path.
- Controlled E2 validation (validation/e2-run.ts) additionally calls `pi` with a pinned model.

## Layout
- Skill: `skills/agent-readiness/` (SKILL.md + criteria/ + references/).
- Extension: `.pi/extensions/agent-readiness/index.ts`.
- Engine: `src/` (checks.ts, engine.ts, cli.ts, fix.ts, history.ts, badge.ts); tests in `test/`.
- Validation: `validation/` (corpus, run-harness, e2-run); records in `docs/validation/`.
