# P3 - Build & Dependencies

**Purpose:** Deterministic, cacheable, documented builds with clean deps. An agent must be able to install/build/run without guesswork or stderr noise.

## Deterministic checks (D)
- D3.1 A lockfile present (package-lock.json / yarn.lock / pnpm-lock / poetry.lock / Cargo.lock / go.sum).
- D3.2 A documented build step exists (build/compile script, Makefile, docker build, or explicit README step).
- D3.3 Scripts are root-documented in package file (scripts.build + scripts.start / start target) OR Makefile targets.
- D3.4 Dependency manifest is explicit (package.json / pyproject + requirements / go.mod / Cargo.toml) - not only vendored binaries.
- D3.5 No obvious stderr noise on a clean import/build smoke (optional, pi.bash a build dry-run; skip if build is heavy).
- D3.6 Dev vs prod deps separated (devDependencies / optional / dev requirements section) OR documented install-for-dev flag.

## Judgment checks (J)
- J3.1 Is the build deterministic (same command+lockfile yields same result across machines)?
- J3.2 Are pinned/resolved versions used (lockfile committed, no floating 'latest')?
- J3.3 Would `npm ci`/`pip install -e .`/`go build` succeed on a clean machine given the docs?

## Anti-gaming
- Fail D3.1 if lockfile exists but is empty/ignored.
- J: prefer committed lockfiles; a VCS-ignored lockfile undercuts reproducibility.
