# P9 - Task Discovery & Modularity

**Purpose:** Can an agent find the right place to change? Explicit entry points, sane repo shape, module boundaries, and per-module docs lower the cost of navigation.

## Deterministic checks (D)
- D9.1 Entry points are explicit (bin/main/__main__/index entry, `main` field, scripts map, or Makefile run target).
- D9.2 Repo shape is legible: top-level dirs are few and named by purpose (not a flat soup; not one giant dir). [pi.ls root sample]
- D9.3 Modularity: source split into logical modules/packages (src/ modules, packages/, lib/, internal/) rather than everything in one dir.
- D9.4 Per-module documentation or clear structure (each package/ module has a README or doc header).
- D9.5 Monorepo boundaries explicit if monorepo (workspace file, package layout doc).

## Judgment checks (J)
- J9.1 Would an agent, given a task ('fix the X feature'), find the right file in a few hops?
- J9.2 Are module names and responsibilities coherent (high cohesion, low coupling by intent)?
- J9.3 Is there a clear boundary for third-party vs first-party so agents edit the right layer?

## Anti-gaming
- Fail D9.2 if it's a flat soup (hundreds of top-level files) OR an impenetrable monolith (business logic smeared everywhere) - either is poor task discovery.
- J: a single 'utils.js' grab-bag that everyone imports is a red flag for D9.3.
