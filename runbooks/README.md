# Runbooks

Operational procedures for maintaining and operating **agent-readiness**. Use these when
something is actively wrong — a regression in scoring, an incorrect check result, or a
failed release — rather than for routine development (see AGENTS.md and docs/).

| Runbook | When to use |
| --- | --- |
| [scoring-regression.md](scoring-regression.md) | Overall level, a pillar score, or the droid pass rate drops after a change. |
| [check-false-positive.md](check-false-positive.md) | A check misreports a repo: false pass, false fail, or wrong skip behavior. |
| [release-failure.md](release-failure.md) | semantic-release or the publish workflow fails, or a bad version ships. |

## Incident response overview

1. **Detect** — CI failures, `--verify` runs in the validation harnesses, or reports from consumers of the CLI.
2. **Triage** — reproduce with `node --experimental-strip-types src/cli.ts <repo> --json` and capture the exact check IDs involved.
3. **Fix** — follow the relevant runbook. Check-ID semantics (`P0.x` … `P9.x`) are a public contract: never rename or repurpose an ID.
4. **Verify** — `npm test`, `npm run lint`, `npm run typecheck`, plus a targeted `--verify` run for scoring changes.
5. **Review** — commit each fix separately with a clear conventional-commit message.
