# AGENTS.md — agent-readiness

This is a **pi-native** framework: a skill + extension + deterministic engine that measures
how ready a codebase is for autonomous AI coding agents. Please follow these conventions.

## Development workflow

- **Language:** TypeScript (ESM, `"type": "module"`), run directly with Node's type stripping — there is no compile step or bundler.
- **Runtime:** Node `>=20.19.0` (see `.nvmrc`; the CI job pins Node 22).
- **Package manager:** npm. Install exactly from the committed lockfile with `npm ci`.

### Commands (all from the repo root)

| Goal | Command |
| --- | --- |
| Install dependencies | `npm ci` |
| Run the full test suite | `npm test` |
| Lint | `npm run lint` |
| Type-check (strict) | `npm run typecheck` (tsc --noEmit) |
| Format code | `npm run format` / `npm run format:check` |
| Run the CLI on a repo | `node --experimental-strip-types src/cli.ts <repo> [--json|--strict|--verify]` |

Always run `npm test`, `npm run lint`, and `npm run typecheck` before pushing and before
declaring any change complete. Keep them green.

## Project structure

- `src/` — the deterministic engine: `checks.ts` (check batteries), `criteria-registry.ts`
  (84 criteria), `engine.ts` (scoring/gating), `fix.ts` (remediation), `cli.ts`, plus
  `discover.ts`, `history.ts`, `html-report.ts`, `runtime-checks.ts`.
- `test/` — one `*.test.ts` suite per module; aggregated by `scripts/run-tests.ts`.
- `skills/agent-readiness/` — the packaged skill (`SKILL.md` + `criteria/` + `references/`).
- `.pi/extensions/agent-readiness/` — the pi extension (commands + readiness_check tool).
- `docs/` — design and research docs. `validation/` — harnesses and synthetic corpora.

## Conventions

- **Never** break the deterministic engine's check-IDs (`P0.x` … `P9.x`). When adding a check,
  register it in `criteria-registry.ts`, wire it into the matching pillar in `checks.ts`, and add a
  test in `test/`.
- Keep the CLI invokable via `node --experimental-strip-types src/cli.ts` (no build step).
- Commit the `package-lock.json`; do not add dependencies without updating it.
- Environment: no secrets are required to run locally (see `.env.example`). Do not commit real
  secrets or `.env`.

## Agent guidance

- When a task changes scoring/checks, prove it with a targeted test and a `--verify` run.
- Prefer the smallest change that keeps all checks green.
- If you add a dependency, put it in `devDependencies` unless it is a genuine runtime peer.
