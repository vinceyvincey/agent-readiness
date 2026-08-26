# src/

Deterministic agent-readiness engine.

- `checks.ts` — 10-pillar deterministic check batteries (P0…P9) + git-aware helpers.
- `criteria-registry.ts` — the 84-criterion registry with descriptions and pi mappings.
- `engine.ts` — `runReadiness`, level gating, per-app scoring, report generation.
- `discover.ts` — monorepo sub-application discovery.
- `fix.ts` — remediation draft generation (`--fix`) + agent prompts.
- `cli.ts` — CLI entry (`node --experimental-strip-types src/cli.ts <repo>`).
- `history.ts` — append-only score history + trend.
- `html-report.ts` — self-contained visual HTML report.
- `runtime-checks.ts` — `--verify` layer that runs real commands.
- `badge.ts` — inline markdown readiness badge.
