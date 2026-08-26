# P2 - Testing & Verification

**Purpose:** Fast, reliable feedback loops. An agent (like a human) needs a cheap way to know whether a change works. This pillar is a **Mandatory hard gate** (must pass beyond L1).

## Deterministic checks (D)
- D2.1 A test directory or test files exist (test/, tests/, __tests__, *_test.*, *_spec.*, *.test.ts).
- D2.2 Test config exists (jest/vitest/pytest/cypress config, or test script in package.json / Makefile target).
- D2.3 A run-test one-liner is discoverable (script.test or make test / `pytest` target documented).
- D2.4 Coverage config or threshold present (coverage field, .nycrc, coverage = in pyproject, --coverage flag). [MIN CONTENT: threshold > 0]
- D2.5 Fixtures/golden data exist (test/fixtures, testdata, __fixtures__, snapshot dir).
- D2.6 Tests are fast-checkable: a smoke/focused subset is runnable without full infra (unit/^ unit target, watch mode).

## Judgment checks (J)
- J2.1 Do the tests actually exercise behavior (assert real outcomes, not mocks that prove nothing)?
- J2.2 Would a failing test clearly point at the broken module (clear test names / isolation)?
- J2.3 Is there an integration/e2e layer when the product warrants it (network/DB/UI)?

## Anti-gaming
- Fail D2.4 if coverage is 'threshold=0' or a bare placeholder.
- J: tests that never fail (all pass regardless of code changes) are a red flag.
