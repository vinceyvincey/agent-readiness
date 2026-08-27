# Runbook: Scoring regression

Use when the overall level, pillar score, or droid pass rate drops after a change to the engine, checks, or criteria registry.

## Triage

1. Establish the baseline: run the CLI against the affected repo(s) on the last known-good commit and save the JSON output.

   ```sh
   git checkout <good-ref> && node --experimental-strip-types src/cli.ts <repo> --json > before.json
   git checkout - && node --experimental-strip-types src/cli.ts <repo> --json > after.json
   ```

2. Diff the two outputs and list every check whose `pass` or `skipped` state changed. Every changed check ID must be explainable by an intentional change.

3. Map the changed check IDs to code:

   - Criterion definition: `src/criteria-registry.ts`
   - Check implementation: `src/checks.ts` (search by ID, e.g. `P7.9`)
   - Scoring / gating: `src/engine.ts`

4. Decide:

   - **Intended change** (e.g., a new check added per the conventions in AGENTS.md) — update the affected fixture repos' expected scores in `test/` and record the change in the commit message.
   - **Unintended regression** — fix the check or revert. Never adjust scores by editing expectations alone; the engine must reflect reality.

5. Verify: `npm test`, `npm run lint`, `npm run typecheck`, then a `--verify` CLI run.

## Escalation

If pillar percentages changed without any check-state change, suspect `src/engine.ts` weighting logic — stop and review with the maintainers before shipping.
