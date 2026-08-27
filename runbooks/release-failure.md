# Runbook: Release / publish failure

Use when the semantic-release job fails or a tag is cut but the release does not ship.

## Triage

1. Identify the failing stage in the release workflow logs (analyze → build → publish → GitHub release).
2. Common causes:

   - **Type errors** — `npm run typecheck` locally; type stripping tolerates some errors that `tsc` rejects.
   - **Lint/format drift** — `npm run lint` and `npm run format:check` must both be clean.
   - **Conventional Commit violations** — semantic-release derives versions from commit messages; malformed subjects abort the analyze stage. Fix by amending or adding a correctly formatted commit; never re-tag.
   - **Lockfile drift** — release jobs run `npm ci`; if `package-lock.json` is out of sync with `package.json`, run `npm install` locally and commit the lockfile.
3. If a release was published with a broken artifact:

   - Do **not** delete the tag. Publish a patch release (`fix: ...`) that repairs the artifact.
   - Note the breakage and the fix in the release notes.

## Prevention

- Run `npm test && npm run lint && npm run typecheck` locally before pushing (pre-commit hooks in `.githooks/` cover part of this).
- Keep `.releaserc.json` and the release workflow in `.github/workflows/` in sync.
