# P8 - Environment & Onboarding

**Purpose:** Reproducible env, low ramp-up. An agent needs a fast, non-GUI path to stand up the environment; `.env.example` and pinned managers remove guesswork.

## Deterministic checks (D)
- D8.1 .env.example / .env.sample present listing required env vars (with names, not secrets).
- D8.2 A setup/install script or documented one-command bootstrap (Makefile `make setup`, script/setup, `npm ci`+doc).
- D8.3 Devcontainer (devcontainer.json) OR documented container/docker-compose for reproducible env.
- D8.4 Version/package managers pinned (engines in package.json, .tool-versions, .nvmrc, python version file, go.mod).
- D8.5 A non-GUI / headless run path exists (CLI entry, tests run without a display).

## Judgment checks (J)
- J8.1 Would a fresh machine (and agent) reach a working env in < a few minutes from the documented path?
- J8.2 Are all external services documented (deps: DB URL, queues, third-party APIs) rather than assumed?
- J8.3 Are default values provided for non-secret env vars so a smoke run works out of the box?

## Anti-gaming
- Fail D8.4 if a pin file exists but points at a version with no engine constraint (decorative).
- J: a devcontainer that doesn't build, or a `.env.example` with only placeholder names, is a false positive.
