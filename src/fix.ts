// --fix remediation: draft concrete file contents for the highest-priority failed checks.
// Writes into <target>/.agent-readiness/fix/ (git-ignored) by default; does NOT touch
// tracked files unless `apply` is true. This keeps write-safety (dry-run default).
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ReadinessReport } from './engine.ts';

export interface FixDraft { file: string; content: string; note: string; }

// Map a failed check id to a concrete draft file.
export function draftsFor(report: ReadinessReport, target: string): FixDraft[] {
  const out: FixDraft[] = [];
  const failed = new Set(report.findings.filter((c) => !c.pass).map((c) => c.id));
  const add = (file: string, content: string, note: string) =>
    out.push({ file, content: content.trim() + '\n', note });

  // P1.1 / P1.2 -> AGENTS.md
  if (failed.has('P1.1') || failed.has('P1.2')) {
    add('AGENTS.md', `# Agent instructions

Working here, you must:
- Always run the project's tests and linter before finishing.
- Never commit secrets; keep .env out of git.
- Follow the existing module structure and naming conventions.
- Prefer small, reviewable changes over large rewrites.
`, 'Create/replace AGENTS.md with enforceable behavior rules.');
  }
  // P2.1 / P2.2 / P2.3 -> test scaffold
  if (failed.has('P2.1') || failed.has('P2.2') || failed.has('P2.3')) {
    add('test/fixture.test.ts', `import { describe, it, expect } from 'vitest';
// Replace with a real test of the project's core behavior.
describe('core', () => { it('works', () => { expect(true).toBe(true); }); });`, 'Scaffold a test dir + a runner so a run-test one-liner exists.');
  }
  // P3.1 -> lockfile note
  if (failed.has('P3.1')) {
    add('README.md', `\n## Reproducibility\nCommit a lockfile (package-lock.json / poetry.lock / go.sum) for deterministic installs.`, 'Commit a lockfile for reproducible builds.');
  }
  // P4.1 -> CI workflow
  if (failed.has('P4.1')) {
    add('.github/workflows/ci.yml', `name: CI\non:\n  push:\n  pull_request:\n  workflow_dispatch:\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: echo 'Add your build + test + lint steps here'`, 'Add a CI workflow that builds, tests, and lints.');
  }
  // P6.1 -> gitignore hardening
  if (failed.has('P6.1')) {
    add('.gitignore', `# Secrets\n.env\n.env.*\n*.pem\n*.key\n# Caches / build\nnode_modules/\ndist/\n.cache/\n.agent-readiness/\n*.log`, 'Harden .gitignore to cover secrets and caches.');
  }
  // P8.1 -> .env.example
  if (failed.has('P8.1')) {
    add('.env.example', `# Required environment variables (fill real values locally, never commit)\n# DATABASE_URL=postgres://user:pass@localhost:5432/db\n# API_KEY=`, 'Add .env.example listing required env vars.');
  }
  // P0.2 -> README usage note
  if (failed.has('P0.2')) {
    add('README-usage-note.md', `Add a Usage / Quickstart section to the README describing how to run and verify this project.`, 'Add a run/usage section to README.');
  }

  return out;
}

export function writeFixes(target: string, drafts: FixDraft[], apply = false): string {
  const dir = apply ? target : path.join(target, '.agent-readiness', 'fix');
  fs.mkdirSync(dir, { recursive: true });
  for (const d of drafts) {
    const p = path.join(dir, d.file);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, d.content);
  }
  return dir;
}

// M9→M11: Build a grounded agentic remediation prompt from the report's punchlist.
// Synthesized from actual Droid session trace analysis (/readiness-fix system prompt):
// - Behavioral verification (run the actual command, confirm exit 0)
// - Negative testing (introduce a violation, confirm the tool catches it)
// - Install real dependencies, not just config stubs
// - Commit after each fix
// - Quality standards (no empty placeholders, no gaming the metric)
// - More specific, actionable remediation instructions
// - Project context (language, existing structure)
// This is the single source the extension and CLI both use to drive agent-driven fixes.
export function agentPromptFor(report: ReadinessReport): string {
  const failed = report.findings.filter((c) => !c.pass);
  const sevRank: Record<string, number> = { high: 0, med: 1, low: 2 };
  const diffRank: Record<string, number> = { basic: 0, intermediate: 1, advanced: 2 };
  const sorted = failed.sort((a, b) =>
    (sevRank[a.severity] ?? 3) - (sevRank[b.severity] ?? 3) ||
    (diffRank[a.difficulty || 'intermediate'] ?? 1) - (diffRank[b.difficulty || 'intermediate'] ?? 1)
  );

  // Focus on top 5 highest-leverage fixes (Droid's insight: one fix done thoroughly > many done superficially).
  const topItems = sorted.slice(0, 5);
  const remainingCount = sorted.length - topItems.length;

  // Build detailed, actionable items using Droid-inspired criterion descriptions.
  const actionMap: Record<string, string> = {
    'P0.1': 'Write a real README with project overview, setup, usage, and verification sections (>200 chars, >=2 content lines).',
    'P0.2': 'Add a run/usage/quickstart section to README with exact commands.',
    'P0.3': 'Add a docs/ directory or ARCHITECTURE.md describing module structure.',
    'P0.6': 'Add an H1 title to README.',
    'P0.7': 'Update documentation (README, AGENTS.md, CONTRIBUTING.md) — key docs should be modified within the last 180 days.',
    'P0.8': 'Add automated doc generation: configure typedoc (TS), sphinx (Py), or mkdocs.',
    'P0.9': 'Add API schema docs: create openapi.json/swagger.yaml or GraphQL schema file.',
    'P1.1': 'Create AGENTS.md with install, test, lint, and build commands plus behavior rules.',
    'P1.2': 'Add enforceable rules (must/always/never) AND backtick-quoted commands matching real scripts to AGENTS.md.',
    'P1.4': 'Add MCP config (mcp.json) or CLAUDE.md for agent context.',
    'P1.6': 'Add lifecycle hooks (.factory/hooks.json).',
    'P1.7': 'Add custom droids/subagents (.factory/droids/).',
    'P1.8': 'Add connector integrations (.factory/connectors.json).',
    'P2.1': 'Add a test directory and at least one real test with assertions.',
    'P2.2': 'Configure a test runner (jest/vitest/pytest): install as devDependency, create config, add `test` script.',
    'P2.3': 'Add a run-test one-liner (`npm test` / `make test`).',
    'P2.4': 'Configure a coverage threshold > 0 in vitest/jest/pytest config.',
    'P2.6': 'Add a fast/smoke test path (test:fast script or vitest testPathIgnorePatterns).',
    'P2.7': 'Add integration/e2e tests: install cypress or playwright and create config.',
    'P2.8': 'Configure test naming conventions: set testMatch/testRegex in vitest/jest config.',
    'P2.9': 'Configure test isolation: enable parallelization (vitest threads, pytest-xdist) or sharding.',
    'P3.1': 'Commit a lockfile for reproducible builds. Run `npm install` to generate it.',
    'P3.2': 'Add a build step (`build` script in package.json or Makefile target).',
    'P3.4': 'Add a dependency manifest (package.json / pyproject.toml / go.mod / Cargo.toml) with declared dependencies.',
    'P3.6': 'Separate dev/prod dependencies (devDependencies in package.json, requirements-dev.txt, or poetry dev group).',
    'P4.1': 'Add a CI workflow (.github/workflows/ci.yml) with checkout, install, test, and lint steps.',
    'P4.2': 'Add a real test invocation in CI (not echo stubs). The workflow must run tests and fail on failure.',
    'P4.3': 'Add pre-commit hooks (husky + lint-staged or .pre-commit-config.yaml) to enforce lint/format on commit.',
    'P4.4': 'Add a CODEOWNERS file (.github/CODEOWNERS) defining code ownership and review rules.',
    'P4.5': 'Add dependency update automation (.github/dependabot.yml or Renovate config).',
    'P4.6': 'Add issue templates (.github/ISSUE_TEMPLATE/) for bug reports and feature requests.',
    'P4.7': 'Add a PR template (.github/PULL_REQUEST_TEMPLATE.md) with a reviewer checklist.',
    'P4.8': 'Add an issue labeling system (.github/labels.yml) with priority, type, and area labels.',
    'P4.9': 'Add release automation: CD workflow (.github/workflows/release.yml) or semantic-release/changesets config.',
    'P5.1': 'Configure a linter: install eslint/biome/ruff as devDependency, create config, add `lint` script.',
    'P5.2': 'Configure a formatter (Prettier / Black / gofmt). Install as devDependency and add a `format` script.',
    'P5.3': 'Configure a type checker: create tsconfig.json with strict mode, or mypy/pyright config.',
    'P5.6': 'Enable strict typing: set `"strict": true` in tsconfig.json or `strict = true` in mypy config.',
    'P5.7': 'Add naming consistency rules: configure ESLint @typescript-eslint/naming-convention or document conventions in AGENTS.md.',
    'P5.8': 'Add dead code detection: install knip (TS) or vulture (Py) as devDependency and create config.',
    'P5.9': 'Add duplicate code detection: install jscpd as devDependency and create .jscpd.json config.',
    'P5.10': 'Add cyclomatic complexity analysis: configure ESLint complexity rule or radon/lizard in CI.',
    'P5.11': 'Add unused dependencies detection: install depcheck (TS) or deptry (Py) and add a CI check.',
    'P5.12': 'Add large file detection: configure .gitattributes with LFS or linter max-lines rules.',
    'P6.1': 'Harden .gitignore to cover .env, *.pem, *.key, node_modules/, dist/ (>=3 patterns).',
    'P6.2': 'Remove committed secrets from tracked files. Use `git rm --cached` and rotate exposed credentials.',
    'P6.4': 'Wire a vulnerability scan (npm audit / pip-audit / gitleaks) into CI or pre-commit.',
    'P7.5': 'Add distributed tracing: install OpenTelemetry SDK or configure X-Request-ID headers.',
    'P7.6': 'Add metrics collection: install Datadog/Prometheus/StatsD client and instrument key paths.',
    'P7.7': 'Add error tracking: install Sentry/Bugsnag/Rollbar and configure source maps.',
    'P7.8': 'Add product analytics: install Mixpanel/Amplitude/PostHog SDK and instrument key events.',
    'P7.9': 'Add runbooks: create a runbooks/ directory or document incident response procedures.',
    'P8.1': 'Add .env.example listing required env vars with placeholder values.',
    'P8.2': 'Add a one-command setup script (`npm run setup` or `make setup`).',
    'P8.6': 'Add local services setup: create docker-compose.yml for local dependencies (Postgres, Redis, etc.).',
  };

  const items = topItems.map((c) => {
    const action = actionMap[c.id] || `Fix ${c.id}: ${c.evidence}`;
    return `### ${c.pillar} ${c.id} [${c.severity}/${c.difficulty || 'intermediate'}]
**Evidence**: ${c.evidence}${c.app ? ` (app: ${c.app})` : ''}
**Fix**: ${action}`;
  }).join('\n\n');

  const appInfo = Object.keys(report.apps).length > 1
    ? `\nThis is a monorepo with ${Object.keys(report.apps).length} applications: ${Object.entries(report.apps).map(([p, a]) => `${p} (${a.name})`).join(', ')}. Apply app-scoped fixes to the correct app directory.\n`
    : '\n';

  const lang = report.repo.language;
  const langContext = lang !== 'unknown' ? `Language: ${lang}. ` : '';

  return `You are remediating agent-readiness failures in a codebase.

Current readiness: ${report.level} (${report.overall}/100), rubric ${report.rubric_version}.
${langContext}Repo: ${report.repo.path}${appInfo}

## Strategy
Focus on the ${topItems.length} highest-leverage fixes below (sorted by severity, then difficulty — cheapest high-impact first). For each one:
1. Read the existing code and config to understand current conventions before writing anything.
2. Create or modify the specific file(s) needed — **install real dependencies** (e.g., \`npm install -D vitest eslint\`), not just config stubs.
3. **Verify the fix works**: run the actual command (e.g., \`npm test\`, \`npm run lint\`, \`tsc --noEmit\`) and confirm it exits 0.
4. **Negative-test where possible**: introduce a deliberate violation (e.g., a type error, an unused variable), confirm the tool catches it, then remove the violation. This proves the fix is real, not decorative.
5. **Commit after each successful fix** with a descriptive message (e.g., "Add strict TypeScript type checking setup").
6. Only touch files directly relevant to the failing check — do not refactor unrelated code.
${remainingCount > 0 ? `\nAfter these ${topItems.length} fixes, ${remainingCount} more failing checks remain. Re-run the readiness engine to see the updated punchlist.` : ''}

## Failing checks (top ${topItems.length})

${items}

## Quality standards (from Droid trace analysis)
Your fix must **genuinely improve the codebase**. Do NOT use workarounds or shortcuts:
- **NO** empty placeholder files (e.g., empty test files, stub configs)
- **NO** minimal implementations that technically pass but provide no real value
- **NO** disabling checks or adding skip markers to pass validation
- **NO** trivial changes that game the metric without improving quality

**BAD**: Adding an empty \`test.js\` file to satisfy "has tests". Creating a \`.eslintrc\` that disables all rules.
**GOOD**: Writing actual unit tests with meaningful assertions. Configuring ESLint with appropriate rules for the project.

## Safety
- Never commit secrets or remove existing tests.
- If a mandatory gate (P2 testing or P6 security) would regress from your change, stop and report it.
- If a fix requires domain knowledge you don't have, note it and skip to the next item.
- Default to showing proposed changes before applying when not in an automated context.

## Verification
After applying fixes, re-run the readiness engine to confirm the score improved:
\`\`\`
node --experimental-strip-types src/cli.ts . --json
\`\`\`
Check that the specific check IDs you fixed now pass — not just that the overall score increased.`;
}
