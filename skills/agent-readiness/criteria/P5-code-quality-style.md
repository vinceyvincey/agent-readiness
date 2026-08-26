# P5 - Code Quality & Style

**Purpose:** Signal over clutter. Linters, formatters, and type checkers make intent legible and keep mega-files / dead code from bloating an agent's context.

## Deterministic checks (D)
- D5.1 A linter is configured (eslint/biome/ruff/flake8/golangci-lint/clippy config or dependency).
- D5.2 A formatter is configured (prettier, black, gofmt, rustfmt, dprint) with a script or preset.
- D5.3 Type checking enabled where applicable (tsconfig, mypy/pyright, gocheck, cargo check).
- D5.4 No mega-files: no single source file over ~500 lines (sampling via wc, optionally expected exceptions).
- D5.5 No obvious dead/duplicate code markers (unused-exports warnings avoided; grep for TODO/FIXME/XXX density is light).
- D5.6 Consistent style is enforced via config committed (not only IDE-local).

## Judgment checks (J)
- J5.1 Is the module/function naming coherent and self-descriptive?
- J5.2 Are there large monolith functions / deep nesting that an agent would struggle to parse?
- J5.3 Are TODOs legitimately tracked elsewhere (issues) rather than accumulating silently?

## Anti-gaming
- Fail D5.4 if there IS a file >500 lines of substantive code (not generated/third-party); allow a documented exceptions whitelist.
- J: linter config with all rules disabled does NOT count as enforced style.
