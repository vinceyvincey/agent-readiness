# P0 - Documentation

**Purpose:** Are the roads signposted? A new agent (and human) must be able to learn what this is, how to run it, and how it's structured - with low token cost.
Weights default 10%.

## Deterministic checks (D)
- D0.1 README.md exists and is non-empty (>200 chars). [pi.find README, pi.read size]
- D0.2 README has a run/usage section (contains 'run', 'install', 'start', 'usage', 'quickstart' case-insensitively).
- D0.3 A top-level docs/ dir or ARCHITECTURE.md exists.
- D0.4 CHANGELOG or versioned releases (CHANGELOG.md, or package version).
- D0.5 Examples exist (examples/ dir, `examples` keyed, or sample configs).
- D0.6 Both a title (H1) and a description paragraph in README.

## Judgment checks (J, narrative only)
- J0.1 Is the README actually about this codebase (not a template stub)?
- J0.2 Is the architecture doc current and specific vs a placeholder?
- J0.3 Would a new agent find the 'where do I start' path in <1 min?

## Anti-gaming
- Fail D0.1 if README exists but is effectively empty (frontmatter/generic only).
- If an ARCHITECTURE.md is a copy-paste placeholder, downgrade the judgment.
