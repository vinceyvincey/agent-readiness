# P6 - Security & Secrets

**Purpose:** No landmines, guardrails. Committed secrets and unlogged deps are the fastest way an agent trip a real incident. This pillar is a **Mandatory hard gate** (must pass beyond L1).

## Deterministic checks (D)
- D6.1 .gitignore covers secrets & caches (patterns for .env, *.pem, node_modules, .cache, dist, .agent-readiness).
- D6.2 No committed secrets detected (scan tracked files for looks-like-secrets: private keys, AWS/API tokens, .env content in git ln). [pi.grep literal, sample]
- D6.3 No tracked .env / .env.prod (only .env.example/ .env.sample allowed).
- D6.4 A dependency vulnerability scan is wired or runnable (npm audit, pip-audit, govulncheck, cargo audit, or a CI scan step).
- D6.5 Credential access is scoped (least-priv): e.g. tokens are env-injected, not hardcoded; ops docs mention scoped creds.

## Judgment checks (J)
- J6.1 Would a compromised dependency be caught before/at release, or only on incident?
- J6.2 Are secrets manager / env-injection patterns used instead of committing keys?
- J6.3 Is supply-chain posture reasonable (pinned versions, provenance, audited cadence)?

## Anti-gaming
- Fail D6.1 if .gitignore is a one-liner that ignores nothing meaningful.
- A sample/.env committed knowingly (even 'empty') still fails D6.3.
