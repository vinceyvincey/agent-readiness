# P7 - Observability & Debuggability

**Purpose:** Can an agent *see* reasons and traces? Structured logs, error handling, and mock/dev hooks let an agent diagnose failures instead of guessing.

## Deterministic checks (D)
- D7.1 Logging is structured/centralized (a logger util, structured format in config, or logs routed to one sink), not ad-hoc console spam.
- D7.2 Error handling is explicit (errors returned/raised with context, not swallowed silently) - grep for bare `except: pass` / empty catch blocks.
- D7.3 A dev-mode / mock / offline path exists (NODE_ENV/test mode, fixtures, sandbox flag, --dry-run) so behavior is checkable without prod infra.
- D7.4 Idempotent scripts/entrypoints (scripts declare they are re-runnable / no destructive default).
- D7.5 Log/trace levels are configurable via env (LOG_LEVEL / verbose flag).

## Judgment checks (J)
- J7.1 Would an agent reading a log line understand the failure quickly (context, correlation id)?
- J7.2 Is there anywhere an agent could reproduce a bug in isolation (dev env, fixture, seed)?
- J7.3 Are timeouts/retries handled so transient failures are diagnosable vs silent?

## Anti-gaming
- Fail D7.1 if the only 'logging' is console.log scattered with no structure.
- J: 'mock mode' that doesn't actually decouple from infra is a false positive.
