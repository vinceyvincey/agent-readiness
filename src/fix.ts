// --fix remediation: draft concrete file contents for the highest-priority failed checks.
// Writes into <target>/.agent-readiness/fix/ (git-ignored) by default; does NOT touch
// tracked files unless `apply` is true. This keeps write-safety (dry-run default).
import * as fs from 'node:fs';
import * as path from 'node:path';
import { CRITERIA_REGISTRY, getCriterionByPiId, getAgentOnlyCriteria, type CriterionDef } from './criteria-registry.ts';
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
// - Full criterion descriptions and evaluation instructions (from 84-criteria registry)
// - Agent-only criteria section (36 criteria pi can't check deterministically)
// - Hybrid scoring model (deterministic floor, agent ceiling)
// - Behavioral verification (run the actual command, confirm exit 0)
// - Negative testing (introduce a violation, confirm the tool catches it)
// - Install real dependencies, not just config stubs
// - Commit after each fix
// - Quality standards (no empty placeholders, no gaming the metric)
// This is the single source the extension and CLI both use to drive agent-driven fixes.

// M15: Enriched assessment-only prompt — mirrors Droid's 5-phase methodology
// (Scan → App Discovery → Evaluation → Validation → Scoring) with full per-criterion
// descriptions, evaluation instructions, and specific behavioral verification commands
// for the 7 agent-only criteria. Used for fair comparison with Droid /readiness-report.
// Does NOT modify files.

// Per-criterion verification commands for the 7 agent-only criteria.
function agentOnlyVerificationCommands(droidId: string): string {
  const commands: Record<string, string> = {
    devcontainer_runnable: [
      '- Check if devcontainer CLI is installed: `which devcontainer`',
      '- If installed, attempt build: `devcontainer up --workspace-folder .`',
      '- Verify the container starts and the workspace mounts correctly',
      '- Skip if devcontainer CLI is not installed or .devcontainer/ does not exist',
    ].join('\n'),
    n_plus_one_detection: [
      '- Search for N+1 detection libraries: `grep -ri "bullet\\|nplusone\\|dataloader" --include="*.ts" --include="*.py" --include="*.rb" .`',
      '- Check ORM query logging: `grep -ri "query_log\\|slow_query\\|n+1" .`',
      '- Check for APM slow query detection in config files',
      '- Skip for apps without database/ORM usage (check for Prisma, SQLAlchemy, ActiveRecord, TypeORM, etc.)',
    ].join('\n'),
    interactive_qa_runnable: [
      '- Follow the documented QA path (from interactive_qa_exists criterion)',
      '- Step 1: install deps, stand up required local services, load env vars, launch the app',
      '- Step 2: drive at least one meaningful interaction:',
      '  - Web: load a page and click a button',
      '  - CLI: run a command and read output',
      '  - API: hit an endpoint and get a 2xx response',
      '  - Mobile: launch in simulator and interact',
      '- Step 3: FAIL if cannot reach interactive state (missing deps, auth gate with no bypass, etc.)',
      '- If actually running is not feasible, verify a complete agent-followable path exists in docs',
    ].join('\n'),
  };
  return commands[droidId] || '- Evaluate based on the description and evaluation instructions above';
}

export function assessmentPromptFor(report: ReadinessReport): string {
  const failed = report.findings.filter((c) => !c.pass && !c.skipped);
  const skipped = report.findings.filter((c) => c.skipped);
  const passed = report.findings.filter((c) => c.pass && !c.skipped);
  const agentOnly = getAgentOnlyCriteria();
  const isMonorepo = Object.keys(report.apps).length > 1;

  // Group failing checks by pillar for readability.
  const pillars: Record<string, typeof failed> = {};
  for (const c of failed) {
    if (!pillars[c.pillar]) pillars[c.pillar] = [];
    pillars[c.pillar].push(c);
  }
  const pillarOrder = ['P0', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9'];
  const pillarNames: Record<string, string> = {
    P0: 'Documentation', P1: 'Agent Guidance', P2: 'Testing', P3: 'Build & Dependencies',
    P4: 'CI & Release', P5: 'Code Quality', P6: 'Security', P7: 'Observability',
    P8: 'Environment', P9: 'Modularity',
  };

  // Build detailed verification items with FULL descriptions and evaluations (no truncation).
  const pillarSections = pillarOrder
    .filter(p => pillars[p] && pillars[p].length > 0)
    .map(p => {
      const items = pillars[p].map((c) => {
        const reg = getCriterionByPiId(c.id);
        const desc = reg ? reg.description : '';
        const evalInstr = reg ? reg.evaluation : '';
        const scope = reg ? reg.scope : 'repo';
        const skipNote = reg?.skippable ? ' [Skippable]' : '';
        return `#### ${c.id} [${c.severity}]${skipNote}
**Scope**: ${scope === 'app' ? 'per-application' : 'repository-wide'}
**Evidence**: ${c.evidence}${c.app ? ` (app: ${c.app})` : ''}
${desc ? `**Description**: ${desc}` : ''}
${evalInstr ? `**Evaluation**: ${evalInstr}` : ''}
**Verify**: Run the actual command (e.g., \`npm test\`, \`npm run lint\`, \`tsc --noEmit\`, \`gh api ...\`) to confirm this truly fails. If it passes behaviorally, mark as false positive.`;
      }).join('\n\n');
      return `### ${p} — ${pillarNames[p]} (${pillars[p].length} failing)\n\n${items}`;
    }).join('\n\n');

  // Build FULL agent-only criteria with complete descriptions, evaluations, and verification commands.
  const agentOnlySection = agentOnly.map((c) => {
    const skipNote = c.skippable ? ' [Skippable]' : '';
    return `### ${c.droidId} [L${c.level}/${c.scope}${skipNote}]
**Description**: ${c.description}
**Evaluation**: ${c.evaluation}
**Verification commands**:
${agentOnlyVerificationCommands(c.droidId)}`;
  }).join('\n\n');

  const skippedInfo = skipped.length > 0
    ? `\n**Skipped checks** (${skipped.length}): ${skipped.map(s => s.id).join(', ')} — these require gh CLI or other prerequisites not available. Attempt them if possible.\n`
    : '';

  const appInfo = isMonorepo
    ? `\nThis is a monorepo with ${Object.keys(report.apps).length} applications: ${Object.entries(report.apps).map(([p2, a]) => `${p2} (${a.name})`).join(', ')}.\n`
    : '\n';

  const lang = report.repo.language;
  const langContext = lang !== 'unknown' ? `Language: ${lang}. ` : '';

  return `You are an Agent Readiness evaluator, a static repository auditor specialized in evaluating codebases for autonomous agent readiness. You are objective, thorough, and deterministic in your evaluations.

**CRITICAL: DO NOT modify any files. This is an assessment-only evaluation.**

Repository: ${report.repo.path}
${langContext}Current deterministic score: ${report.level} (${report.overall}/100), rubric ${report.rubric_version}.${skippedInfo}${appInfo}
## Phase 1 - Repository Scan

1. **Detect repository language**
   - JS/TS: package.json, tsconfig.json, .js/.ts/.jsx/.tsx files
   - Python: pyproject.toml, setup.py, requirements.txt, .py files
   - Rust: Cargo.toml, .rs files
   - Go: go.mod, .go files
   - Java: pom.xml, build.gradle, .java files
   - Ruby: Gemfile, .gemspec, .rb files
   - Record primary language(s) detected

2. **Explore the repository structure**
   - Walk the file tree within the git repository (from repo root)
   - Ignore .git, node_modules, dist, build directories
   - Identify main source directories (src/, app/, lib/, etc.)
   - Locate configuration files, documentation, and test directories

## Phase 2 - Application Discovery

Identify all independently deployable applications in the repository:
- An application is a **directory** that represents an independently deployable unit
- Has its own deployment lifecycle, can be built and run independently
- Shared libraries are NOT applications (they're imported by applications)
- If you find 0 applications, count the repository root (.) as 1 application

Record: N applications with their paths and brief descriptions.

**Commitment**: Use denominator = N for all 40 app-scoped criteria, denominator = 1 for all 44 repo-scoped criteria.

## Phase 3 - Criterion Evaluation

### 3a. Deterministic Verification (${failed.length + passed.length} criteria already checked by engine)

The deterministic engine has checked ${failed.length + passed.length} of 84 criteria. Your job is to **verify the engine's findings behaviorally** — confirm that failing checks truly fail and passing checks truly pass by running actual commands.

${failed.length} checks are currently failing. For each one:
- Read the full description and evaluation instructions below
- Run the actual verification command to confirm it truly fails
- If it passes behaviorally (e.g., config file exists AND the command runs successfully), it's a **false positive** — note it
- If it fails behaviorally, confirm the engine was correct

${pillarSections}

### 3b. Agent-Only Evaluation (${agentOnly.length} criteria not checked by engine)

The following ${agentOnly.length} criteria require runtime verification, code analysis, or external API access. Evaluate each one from scratch:

${agentOnlySection}

## Phase 4 - Report Validation

Before producing your report, validate:

1. **Application count consistency**: All app-scoped criteria use denominator = N, repo-scoped use 1
2. **Completeness**: All 84 criteria evaluated (77 deterministic + 7 agent-only)
3. **Evidence quality**: Each finding has a concrete command or file reference as evidence
4. **False positive identification**: Clearly distinguish confirmed failures from false positives

## Phase 5 - Scoring & Report

Calculate the augmented score:
- **Deterministic floor**: ${report.overall}/100 (${report.level})
- **Adjustments**:
  - **False positives**: For each check the engine marked as failing but passes behaviorally, the true score is higher
  - **Agent-only failures**: For each agent-only criterion that fails, the true score is lower
  - **Skipped criteria**: Excluded from scoring (neither pass nor fail)

Produce your report in this structured format:

### Verification Results
For each deterministic failing check:
- [check-id] VERIFIED FAIL / FALSE POSITIVE — [evidence: command run + output summary]

### Agent-Only Criteria
For each of the 7 agent-only criteria:
- [droid-id] PASS / FAIL / SKIP — [evidence: evaluation method + findings]

### Application Discovery
- N applications identified:
  1. [path] - [description]
  2. ...

### Augmented Score
- Deterministic floor: ${report.overall}/100 (${report.level})
- False positives found: [count] (engine said fail, but actually passes)
- Agent-only results: [N pass, N fail, N skip]
- Augmented score: [estimated] / 100
- Estimated level: [L0-L5]

### Action Items
List 2-3 highest-impact next steps to improve readiness:
- [specific, actionable recommendation]
- [specific, actionable recommendation]`;
}

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
    // M14: new check remediation actions
    'P1.9': 'Add AGENTS.md validation: CI job or pre-commit hook that checks AGENTS.md commands still work.',
    'P2.10': 'Add flaky test detection: install vitest-retry/pytest-rerunfailures or configure flaky test tracking.',
    'P2.11': 'Add test performance tracking: configure --verbose/--durations flags or integrate test analytics.',
    'P3.7': 'Install and authenticate gh CLI: run `gh auth login` to enable gh-based checks.',
    'P3.8': 'Add monorepo tooling: configure npm/pnpm workspaces, Turborepo, Nx, or Lerna.',
    'P3.9': 'Add version drift detection: install syncpack/manypkg or configure Renovate grouping rules.',
    'P3.10': 'Add minimum release age policy: configure Renovate minimumReleaseAge or document delay policy.',
    'P4.10': 'Add CI caching: configure turbo cache, nx cache, or buildx cache for faster CI feedback.',
    'P4.11': 'Add build performance tracking: configure build caching and export build metrics.',
    'P4.12': 'Add deployment automation: create deploy workflow or release pipeline.',
    'P4.13': 'Use gh CLI to check backlog health: ensure issues have descriptive titles and labels.',
    'P4.14': 'Add feature flag infrastructure: install LaunchDarkly/Statsig/Unleash/GrowthBook SDK.',
    'P4.15': 'Add release notes automation: configure semantic-release, changesets, or release-please.',
    'P4.16': 'Add progressive rollout: configure canary deployments or percentage-based rollouts.',
    'P4.17': 'Add rollback automation: create rollback workflow or document rollback procedure.',
    'P5.13': 'Add code quality metrics: configure Codecov/SonarQube or GitHub code scanning.',
    'P5.14': 'Add tech debt tracking: configure TODO/FIXME scanner in CI or SonarQube SQALE.',
    'P5.15': 'Add dead feature flag detection: configure stale flag detection in your flag platform.',
    'P5.16': 'Add heavy dependency detection: install bundle analyzer or size-limit tool.',
    'P6.6': 'Enable branch protection: configure GitHub rulesets for main branch (require PRs, reviews).',
    'P6.7': 'Add automated security review: configure CodeQL, Semgrep, or Snyk in CI.',
    'P6.8': 'Add privacy compliance: install consent management SDK or document GDPR/CCPA handling.',
    'P6.9': 'Add DAST scanning: configure OWASP ZAP or Nuclei in CI against staging.',
    'P7.10': 'Add alerting: configure PagerDuty/OpsGenie or custom alert rules.',
    'P7.11': 'Add deployment observability: link to monitoring dashboards in docs or deploy notifications.',
    'P7.12': 'Add health checks: implement /health endpoint or configure K8s liveness/readiness probes.',
    'P7.13': 'Add profiling instrumentation: install APM tool or continuous profiler.',
    'P7.14': 'Add error-to-insight pipeline: configure Sentry-GitHub integration or error-to-issue automation.',
    'P8.7': 'Add interactive QA documentation: document how to run and exercise the app end-to-end.',
    'P8.8': 'Add database schema files: create Prisma schema, SQLAlchemy models, or SQL migrations.',
    // M16: new check remediation actions
    'P7.15': 'Add circuit breakers: install opossum/cockatiel (Node.js), resilience4j (Java), tenacity (Python), or configure service mesh circuit breaking.',
    'P7.16': 'Add log scrubbing: configure pino redact, winston format filtering, or structlog processors. Add custom log sanitization middleware.',
    'P6.10': 'Add PII handling: install Presidio/DLP tools, add data masking libraries, or document PII handling procedures in AGENTS.md.',
    'P2.12': 'Ensure tests are runnable: verify test command exits 0 with --listTests/--collect-only. Fix any configuration or dependency issues.',
  };

  // M12: Build items with full criterion descriptions from the registry (like Droid's fix prompt).
  const items = topItems.map((c) => {
    const action = actionMap[c.id] || `Fix ${c.id}: ${c.evidence}`;
    const reg = getCriterionByPiId(c.id);
    const desc = reg ? reg.description : '';
    const evalInstr = reg ? reg.evaluation.substring(0, 300) : '';
    return `### ${c.pillar} ${c.id} [${c.severity}/${c.difficulty || 'intermediate'}]
**Evidence**: ${c.evidence}${c.app ? ` (app: ${c.app})` : ''}${desc ? `\n**Description**: ${desc}` : ''}${evalInstr ? `\n**Evaluation**: ${evalInstr}` : ''}
**Fix**: ${action}`;
  }).join('\n\n');

  // M12: Agent-only criteria section — 36 criteria the deterministic engine can't check.
  const agentOnly = getAgentOnlyCriteria();
  const agentOnlySection = agentOnly.map((c) => {
    return `### ${c.droidId} [L${c.level}/${c.scope}${c.skippable ? ', skippable' : ''}]
**Description**: ${c.description}
**Evaluation**: ${c.evaluation.substring(0, 300)}`;
  }).join('\n\n');

  const appInfo = Object.keys(report.apps).length > 1
    ? `\nThis is a monorepo with ${Object.keys(report.apps).length} applications: ${Object.entries(report.apps).map(([p, a]) => `${p} (${a.name})`).join(', ')}. Apply app-scoped fixes to the correct app directory.\n`
    : '\n';

  const lang = report.repo.language;
  const langContext = lang !== 'unknown' ? `Language: ${lang}. ` : '';

  return `You are remediating agent-readiness failures in a codebase.

Current readiness: ${report.level} (${report.overall}/100), rubric ${report.rubric_version}.
${langContext}Repo: ${report.repo.path}${appInfo}

## Scoring model (deterministic floor, agent ceiling)

The deterministic engine has already scored this repo (the score above is the **floor**). Your job is to:
1. **Verify**: For each failing check below, run the actual command to confirm it truly fails. If it passes behaviorally (e.g., vitest.config.ts exists AND \`npm test\` runs successfully), note it as a false positive.
2. **Discover**: Check the ${agentOnly.length} agent-only criteria listed in the "Additional criteria" section. These require runtime verification, API access, or code analysis — things the deterministic engine can't do.
3. **Augment**: The final score is:
   - **Raised** if you verify a failing check actually works (deterministic false positive)
   - **Lowered** if you find a passing check that doesn't actually work (decorative config)
   - **Extended** if you find agent-only criteria that fail (not in the original score)
4. **Fix**: Remediate verified failures, starting with highest-severity.
5. **Re-run**: After fixes, re-run the deterministic engine to get the new floor score.

## Strategy
Focus on the ${topItems.length} highest-leverage fixes below (sorted by severity, then difficulty). For each one:
1. Read the existing code and config to understand current conventions before writing anything.
2. Create or modify the specific file(s) needed — **install real dependencies** (e.g., \`npm install -D vitest eslint\`), not just config stubs.
3. **Verify the fix works**: run the actual command (e.g., \`npm test\`, \`npm run lint\`, \`tsc --noEmit\`) and confirm it exits 0.
4. **Negative-test where possible**: introduce a deliberate violation (e.g., a type error, an unused variable), confirm the tool catches it, then remove the violation. This proves the fix is real, not decorative.
5. **Commit after each successful fix** with a descriptive message (e.g., "Add strict TypeScript type checking setup").
6. Only touch files directly relevant to the failing check — do not refactor unrelated code.
${remainingCount > 0 ? `\nAfter these ${topItems.length} fixes, ${remainingCount} more failing checks remain. Re-run the readiness engine to see the updated punchlist.` : ''}

## Failing checks (top ${topItems.length}, with full criterion context)

${items}

## Additional criteria (agent-only, not covered by deterministic engine)

The deterministic engine checks 47 of Droid's 84 criteria. The following ${agentOnly.length} criteria require
agent reasoning (runtime verification, API access, code analysis). Evaluate each one and note any failures:

${agentOnlySection}

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
