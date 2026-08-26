# P4 - CI / Automation & Gates

**Purpose:** Machines enforcing contracts. CI, hooks, and branch rules keep tests/lints/security running automatically so an agent's work is verified, not trusted.

## Deterministic checks (D)
- D4.1 CI workflow present (.github/workflows/*.yml / .gitlab-ci.yml / .circleci/config / Jenkinsfile / etc.).
- D4.2 The CI runs a build+test+lint (workflow references test, build, lint jobs/steps).
- D4.3 Pre-commit hooks configured (.pre-commit-config.yaml, husky, lint-staged, .githooks).
- D4.4 Lint/format enforced in CI (a script that fails on lint violation, prettier/eslint --max-warnings 0, ruff --check).
- D4.5 Branch protection / rulesets referenced (CODEOWNERS, branch ruleset doc, PR-required checks) OR covered by # codeowners file.
- D4.6 A dependency checker wired (dependabot config, renovate, or a scan step).

## Judgment checks (J)
- J4.1 Is the CI actually green/healthy in practice (not a red-for-months workflow)?
- J4.2 Do hooks run fast enough to not annoy (or can be skipped deliberately)?
- J4.3 Would CI catch a regression an agent introduced, or is it a no-op passthrough?

## Anti-gaming
- Fail D4.3 if hooks exist but are empty/no-op config.
- J: a workflow that only does 'echo' or always-passing lint is a false positive - flag it.
