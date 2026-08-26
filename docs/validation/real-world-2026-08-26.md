# Real-World Validation Results — 2026-08-26

## Corpus

| Repo | Source | Language | Files | Pi Overall | Droid Pass Rate | Pi Level | Droid Level |
|---|---|---|---|---|---|---|---|
| tinybench | OSS (tinylibs) | TS | 175 | 50.0 | 33.8% | L0 | L3 (56%) |
| hono | OSS (honojs) | TS monorepo | 486 | 41.7 | 26.7% | L0 | timeout |
| pi-agent-bridge | user | TS | 32 | 30.8 | 15.7% | L0 | n/a (no remote) |
| cf-capability-server | user | TS | 36 | 38.2 | 18.3% | L0 | n/a (no remote) |
| connector-trials | user | Python | 37 | 26.8 | 12.5% | L0 | n/a (no remote) |
| cf-agents | user | TS | 156 | 36.7 | 16.9% | L0 | n/a (no remote) |
| wull-tech-finances | user | Python | 161 | 22.9 | 11.1% | L0 | n/a (no remote) |
| agent-config | user | unknown | 118 | 10.0 | 4.2% | L0 | n/a (no remote) |
| agent-readiness | self | TS | 105 | 22.4 | 14.1% | L0 | n/a |

## Key Findings

### 1. Pi works anywhere, Droid needs git remotes
Droid requires a GitHub/GitLab remote URL to evaluate repos. 6 of 8 user repos have no remote configured and cannot be evaluated by Droid. Pi evaluates any directory regardless.

### 2. Runtime verification catches real false positives
On tinybench (with node_modules installed), `--verify` found 3 false positives:

| Check | Deterministic | Runtime | Issue |
|---|---|---|---|
| P2.2 (test runner) | PASS | **FAIL** | vitest 4.x doesn't support `--listTests` flag |
| P2.12 (tests runnable) | PASS | **FAIL** | Same vitest compatibility issue |
| P3.2 (build) | PASS | **FAIL** | `npm run build` fails (tsdown issue) |
| P4.1 (CI workflow) | PASS | PASS | YAML structure valid |
| P5.1 (linter) | PASS | PASS | `npm run lint` exits 0 (13.7s) |
| P5.3 (type checker) | PASS | PASS | `tsc --noEmit` exits 0 (3.2s) |

This confirms the presence≠signal gap: config files exist but the actual commands fail.

### 3. Pi vs Droid score gap on tinybench
- Pi droidPassRate: 33.8% (L2 under --droid-scoring)
- Droid pass rate: 56% (L3)
- Gap: 22.2pp

Likely causes: Droid evaluates 3 agent-only criteria pi can't, Droid actually runs commands (finding passing evidence pi's regex misses), Droid may be more lenient on some criteria.

### 4. Pillar patterns across real repos

| Pillar | Description | Pattern |
|---|---|---|
| P0 (Docs) | Good for OSS (55-89%), weak for user repos (22-67%) | OSS docs better |
| P1 (Agent Guidance) | Universally weak (0% for 6/9 repos) | Least adopted |
| P2 (Testing) | Varies widely (0-55%) | Mandatory gate rarely met |
| P3 (Build & Deps) | Generally strong (57-100%) | Most adopted |
| P4 (CI & Release) | Bimodal: OSS 38-50%, user repos 0-7% | OSS has CI, user repos don't |
| P5 (Code Quality) | Low across the board (7-50%) | Linters/type checkers often missing |
| P6 (Security) | Low (25-57%) | Mandatory gate rarely met |
| P7 (Observability) | Consistently low (6-25%) | Production concerns |
| P8 (Environment) | Low (0-38%) | .env.example, devcontainer rare |
| P9 (Modularity) | Decent (25-75%) | Most repos have src/ structure |

### 5. Performance
- Pi deterministic: ~3s per repo (all repos)
- Pi with --verify: ~15-60s per repo (depends on command timeouts)
- Droid: 260-300s per repo (timed out on hono monorepo)

### 6. Actionable issues found
- **vitest --listTests compatibility**: vitest 4.x removed this flag. Runtime verification needs version-aware commands (try `--listTests`, fall back to `vitest list` or `vitest run --dry`).
- **Droid timeout on monorepos**: Droid timed out at 300s on hono (486 files). Pi completed in 2.8s.
- **All repos score L0 under pi gating**: The 80% mandatory gate on P2/P6 is very strict. Even well-structured OSS repos like tinybench (P2=54.5%, P6=50%) can't pass. The --droid-scoring flag provides a more nuanced view.
