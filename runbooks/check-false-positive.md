# Runbook: Check false positive / false negative

Use when a repository is scored incorrectly — a check fails when the repo has the practice, or passes when it does not, or a check is (not) skipped when its criterion says it should be.

## Symptoms

- `--verify` run disagrees with a manual review of the repo.
- A repo type that a criterion says to skip (non-API app, single-app repo, no web service) is being scored instead of skipped.
- Score jumps up or down after a change to `checks.ts` that should not have affected it.

## Triage

1. Reproduce with full detail:

   ```sh
   node --experimental-strip-types src/cli.ts <repo> --json > out.json
   ```

   Find the affected check ID in `failing` / `skipped` and read its `evidence`.

2. Confirm the criterion intent in `src/criteria-registry.ts` (the `description` and any `Skip for ...` clause). The implementation in `src/checks.ts` must honor the criterion text, not the other way around.

3. Locate the implementation by the check ID comment, e.g.:

   ```sh
   grep -n "P8.8" src/checks.ts
   ```

4. Classify the failure:

   - **Detection gap** — the heuristic misses a valid signal (e.g., a config file or dependency name not in the pattern list). Add the signal to the matcher.
   - **Missing skip** — the criterion defines a skip condition the implementation does not enforce. Wire the skip (e.g., `skip('P0.9', 'P0', 'no web service detected', ...)` gated on the existing `isWebService()` helper).
   - **Over-broad match** — a regex matches a word in an unrelated context (e.g., `next` matching prose). Tighten the regex or scope it to dependency/config files.

5. Prove the fix:

   - Add or extend a fixture under `fixtures/` and a targeted test in `test/` covering both the matching and non-matching case.
   - Run `npm test` and `npm run lint` and `npm run typecheck`.
   - Run the CLI with `--verify` on the affected fixture and confirm the check ID flips correctly with no other pillar moving.

## Escalation

If the fix would change check IDs, pillar weights, or the gating levels in `src/engine.ts`, discuss it in an issue first — scoring semantics are a public contract for consumers of the report.
