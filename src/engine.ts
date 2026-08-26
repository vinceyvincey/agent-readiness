// agent-readiness deterministic engine (single source of truth for E1 numeric score).
import { getPillars, type Repo, type CheckResult, DIFFICULTY, type Difficulty } from './checks.ts';
import { discoverApps, type App } from './discover.ts';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { appendHistory } from './history.ts';
import { getRuntimeVerifications, runRuntimeVerifications, applyRuntimeResults } from './runtime-checks.ts';
import { getCriterionByPiId } from './criteria-registry.ts';

export const RUBRIC_VERSION = '0.9.0';

// Level gate map: each entry is the set of pillars that must each pass the 80% gate.
export const LEVEL_GATES: Record<string, string[]> = {
  L1: ['P0', 'P2', 'P3'],                 // functional: runs, linter+unit tests
  L2: ['P0', 'P1', 'P2', 'P3'],           // documented: + agent guidance
  L3: ['P0', 'P1', 'P2', 'P3', 'P4', 'P6'], // standardized: CI + security (hard)
  L4: ['P0', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7'], // optimized: + quality/observability
  L5: ['P0', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9'], // autonomous
};
// Mandatory hard gates: these pillars must not be diluted by the aggregate.
export const MANDATORY = ['P2', 'P6'];
export const GATE_PCT = 0.8;

// Pure level-resolution: given per-pillar pct scores, return the resolved level.
export function resolveLevel(pillars: Record<string, PillarScore>): string {
  // Gates are cumulative supersets, so walk from the highest level down and
  // return the highest whose required pillars all meet the gate (plus mandatory).
  const orders = ['L5', 'L4', 'L3', 'L2', 'L1'];
  for (const lvl of orders) {
    const req = LEVEL_GATES[lvl];
    const meets = req.every((pill) => (pillars[pill]?.pct ?? 0) >= GATE_PCT * 100);
    const mandatoryOk = MANDATORY.every((m) => (pillars[m]?.pct ?? 0) >= GATE_PCT * 100);
    if (meets && mandatoryOk) return lvl;
  }
  return 'L0';
}

export interface PillarScore { passed: number; total: number; pct: number; perApp?: Record<string, { passed: number; total: number }>; }
export interface PunchItem { pillar: string; id: string; severity: string; difficulty: Difficulty; action: string; evidence: string; }
export interface ReadinessReport {
  rubric_version: string;
  config_hash: string;
  repo: { path: string; language: string };
  apps: Record<string, { name: string; type: string; description: string }>;
  pillars: Record<string, PillarScore>;
  weights: Record<string, number>;
  overall: number;
  droidPassRate: number;  // M16: flat pass rate compatible with Droid's scoring model
  level: string;
  judgment: string[];
  punchlist: PunchItem[];
  run: { date: string; model: string; strict: boolean; commitHash: string; branch: string; hasLocalChanges: boolean; hasNonRemoteCommits: boolean };
  findings: CheckResult[];
}

function configHash(root: string): string {
  const cfg = path.join(root, 'agent-readiness.config.json');
  let payload = 'default';
  try { payload = fs.readFileSync(cfg, 'utf8'); } catch { /* default */ }
  return createHash('sha256').update(payload).digest('hex').slice(0, 12);
}

// Git commit/branch/dirty-state provenance for the report (best-effort, empty if not git).
function gitProvenance(root: string): { commitHash: string; branch: string; hasLocalChanges: boolean; hasNonRemoteCommits: boolean } {
  const git = (args: string[]): string => {
    try {
      const res = spawnSync('git', args, { cwd: root, encoding: 'utf8', timeout: 5000 });
      return res.status === 0 ? (res.stdout || '').trim() : '';
    } catch { return ''; }
  };
  const commitHash = git(['rev-parse', 'HEAD']);
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
  const status = git(['status', '--porcelain']);
  const hasLocalChanges = status.length > 0;
  const upstream = git(['rev-parse', '--abbrev-ref', '@{u}']);
  let hasNonRemoteCommits = false;
  if (upstream) {
    const unpushed = git(['log', '@{u}..', '--oneline']);
    hasNonRemoteCommits = unpushed.length > 0;
  }
  return { commitHash, branch, hasLocalChanges, hasNonRemoteCommits };
}

export function detectLanguage(root: string): string {
  for (const f of ['package.json', 'tsconfig.json']) if (fs.existsSync(path.join(root, f))) return 'typescript';
  if (fs.existsSync(path.join(root, 'pyproject.toml')) || fs.existsSync(path.join(root, 'requirements.txt'))) return 'python';
  if (fs.existsSync(path.join(root, 'go.mod'))) return 'go';
  if (fs.existsSync(path.join(root, 'Cargo.toml'))) return 'rust';
  if (fs.existsSync(path.join(root, 'pom.xml')) || fs.existsSync(path.join(root, 'build.gradle'))) return 'java';
  return 'unknown';
}

function scorePillar(checks: CheckResult[]): PillarScore {
  // Exclude skipped checks from scoring (e.g., gh-CLI checks when gh not authenticated).
  const dt = checks.filter((c) => c.id && c.pass !== undefined && !c.skipped);
  const passed = dt.filter((c) => c.pass).length;
  const total = dt.length || 1;
  return { passed, total, pct: Math.round((passed / total) * 1000) / 10 };
}

export function runReadiness(root: string, opts: { weights?: Record<string, number>; model?: string; strict?: boolean; verify?: boolean } = {}): ReadinessReport {
  const apps = discoverApps(root);
  const pillars: Record<string, PillarScore> = {};
  const findings: CheckResult[] = [];

  for (const p of getPillars()) {
    const allChecks: CheckResult[] = [];
    const perApp: Record<string, { passed: number; total: number }> = {};

    if (p.scope === 'app' && apps.length > 1) {
      // App-scoped pillar in a monorepo: run checks per discovered app.
      for (const app of apps) {
        const appRoot = app.path === '.' ? root : path.join(root, app.path);
        const repo: Repo = { root: appRoot };
        const appChecks = p.checks.map((fn) => {
          try { const c = fn(repo); c.app = app.path; return c; }
          catch { return { id: p.id + '.x', pillar: p.id, pass: false, evidence: 'check error', severity: 'low', app: app.path } as CheckResult; }
        });
        const dt = appChecks.filter((c) => c.id && c.pass !== undefined);
        perApp[app.path] = { passed: dt.filter((c) => c.pass).length, total: dt.length || 1 };
        allChecks.push(...appChecks);
      }
    } else {
      // Repo-scoped pillar, or single-app repo: run checks once on root.
      const repo: Repo = { root };
      const repoChecks = p.checks.map((fn) => {
        try { return fn(repo); }
        catch { return { id: p.id + '.x', pillar: p.id, pass: false, evidence: 'check error', severity: 'low' } as CheckResult; }
      });
      allChecks.push(...repoChecks);
    }

    // Stamp difficulty from the check's own field, falling back to the DIFFICULTY map.
    for (const c of allChecks) {
      if (!c.difficulty) c.difficulty = DIFFICULTY[c.id] || 'intermediate';
    }

    pillars[p.id] = scorePillar(allChecks);
    if (Object.keys(perApp).length > 0) pillars[p.id].perApp = perApp;
    findings.push(...allChecks);
  }

  const weights: Record<string, number> = {};
  for (const p of getPillars()) weights[p.id] = opts.weights?.[p.id] ?? 0.1;
  let overall = getPillars().reduce((a, p) => a + (pillars[p.id].pct / 100) * weights[p.id], 0);

  // M16: Runtime verification pass — actually run commands to verify configs work.
  if (opts.verify) {
    const lang = detectLanguage(root);
    const passingIds = new Set(findings.filter(f => f.pass && !f.skipped).map(f => f.id));
    const verifications = getRuntimeVerifications(root, lang, passingIds);
    if (verifications.length > 0) {
      const runtimeResults = runRuntimeVerifications(root, verifications);
      const updatedFindings = applyRuntimeResults(findings, runtimeResults);
      findings.length = 0;
      findings.push(...updatedFindings);
      for (const p of getPillars()) {
        const pChecks = findings.filter(f => f.pillar === p.id);
        pillars[p.id] = scorePillar(pChecks);
      }
      overall = getPillars().reduce((a, p) => a + (pillars[p.id].pct / 100) * weights[p.id], 0);
    }
  }

  // M16: Droid-compatible flat pass rate.
  const nonSkippedMapped = findings.filter(f => !f.skipped && getCriterionByPiId(f.id));
  const droidPassRate = nonSkippedMapped.length > 0
    ? Math.round((nonSkippedMapped.filter(f => f.pass).length / nonSkippedMapped.length) * 1000) / 10
    : 0;

  // Level resolution via N-1 gating across the level's required pillars.
  const level = resolveLevel(pillars);

  const actionById: Record<string, string> = {
    'P0.1': 'Write a real README with substantive content (>200 chars, >=2 content lines). Include a project overview, setup, usage, and verification sections.',
    'P0.2': 'Add a run/usage/quickstart section to README with exact commands (e.g., `npm install`, `npm start`, `npm test`).',
    'P0.3': 'Add a docs/ directory or ARCHITECTURE.md describing the module structure and data flow.',
    'P0.6': 'Add an H1 title to README.',
    'P0.7': 'Update documentation (README, AGENTS.md, or CONTRIBUTING.md) within the last 180 days.',
    'P0.8': 'Add automated doc generation: configure typedoc (TS), sphinx (Py), or mkdocs.',
    'P0.9': 'Add API schema docs: create openapi.json/swagger.yaml or GraphQL schema file.',
    'P1.1': 'Create AGENTS.md with substantive setup + behavior rules (>=2 content lines). Include install, test, lint, and build commands.',
    'P1.2': 'Add enforceable rules (must/always/never) AND verified backtick-quoted commands (matching real scripts in package.json/Makefile) to AGENTS.md.',
    'P1.4': 'Add MCP config (mcp.json) or CLAUDE.md for agent context.',
    'P1.6': 'Add lifecycle hooks (.factory/hooks.json or hooks in settings).',
    'P1.7': 'Add custom droids/subagents (.factory/droids or .pi/fabric/droids).',
    'P1.8': 'Add connector integrations (.factory/connectors.json).',
    'P2.1': 'Add a test directory and at least one real test with assertions. Install the test runner as a devDependency and verify `npm test` exits 0.',
    'P2.2': 'Configure a test runner (jest/vitest/pytest). Install it as a devDependency, create a config file, and add a `test` script to package.json.',
    'P2.3': 'Add a run-test one-liner (`npm test` / `make test`). Verify the command actually runs and exits 0.',
    'P2.4': 'Configure a coverage threshold > 0 (not decorative). Set `--coverage.threshold` in vitest config or `fail_under >= 50` in pyproject.toml.',
    'P2.6': 'Add a fast/smoke test path (test:fast script, vitest testPathIgnorePatterns, etc.).',
    'P2.7': 'Add integration/e2e tests: install cypress or playwright and create config.',
    'P2.8': 'Configure test naming conventions: set testMatch/testRegex in vitest/jest config.',
    'P2.9': 'Configure test isolation: enable parallelization (vitest threads, pytest-xdist) or sharding.',
    'P3.1': 'Commit a lockfile (package-lock.json / poetry.lock / go.sum) for reproducible builds. Run `npm install` or equivalent to generate it.',
    'P3.2': 'Document/add a build step. Add a `build` script to package.json or a build target to Makefile. Verify it produces output.',
    'P4.1': 'Add a CI workflow (.github/workflows/ci.yml) that runs on push and PR. Include checkout, install, test, and lint steps.',
    'P4.2': 'Add a real test invocation in CI (not just echo stubs). The workflow should run `npm test` or equivalent and fail the build on test failure.',
    'P4.6': 'Add issue templates (.github/ISSUE_TEMPLATE/) for bug reports and feature requests.',
    'P4.7': 'Add a PR template (.github/PULL_REQUEST_TEMPLATE.md) with a checklist for reviewers.',
    'P4.8': 'Add an issue labeling system (.github/labels.yml) with priority, type, and area labels.',
    'P4.9': 'Add release automation: CD workflow (.github/workflows/release.yml) or semantic-release/changesets config.',
    'P5.1': 'Configure a linter (eslint/biome/ruff/golangci). Install it as a devDependency, create a config file, add a `lint` script, and verify `npm run lint` exits 0.',
    'P5.3': 'Configure a type checker (tsconfig.json with strict mode / mypy / go vet / cargo check). Verify it runs and exits 0.',
    'P5.6': 'Enable strict typing: set `"strict": true` in tsconfig.json (or `strict = true` in mypy config). Verify the type checker catches violations.',
    'P5.7': 'Add naming consistency rules: configure ESLint @typescript-eslint/naming-convention or document conventions in AGENTS.md.',
    'P5.8': 'Add dead code detection: install knip (TS) or vulture (Py) as devDependency and create config.',
    'P5.9': 'Add duplicate code detection: install jscpd as devDependency and create .jscpd.json config.',
    'P5.10': 'Add cyclomatic complexity analysis: configure ESLint complexity rule or radon/lizard in CI.',
    'P5.11': 'Add unused dependencies detection: install depcheck (TS) or deptry (Py) and add a CI check.',
    'P5.12': 'Add large file detection: configure .gitattributes with LFS or linter max-lines rules.',
    'P6.1': 'Harden .gitignore to cover .env, *.pem, *.key, node_modules/, dist/, and caches (>=3 patterns).',
    'P6.2': 'Remove committed secrets from tracked files. Use `git rm --cached` and rotate any exposed credentials.',
    'P6.4': 'Wire a vulnerability scan (npm audit / pip-audit / gitleaks). Add it to CI or as a pre-commit hook.',
    'P7.5': 'Add distributed tracing: install OpenTelemetry SDK or configure X-Request-ID headers.',
    'P7.6': 'Add metrics collection: install Datadog/Prometheus/StatsD client and instrument key paths.',
    'P7.7': 'Add error tracking: install Sentry/Bugsnag/Rollbar and configure source maps.',
    'P7.8': 'Add product analytics: install Mixpanel/Amplitude/PostHog SDK and instrument key events.',
    'P7.9': 'Add runbooks: create a runbooks/ directory or document incident response procedures.',
    'P8.1': 'Add .env.example listing required env vars with placeholder values.',
    'P8.2': 'Add a one-command setup script (e.g., `npm run setup` or `make setup`) that installs deps and prepares the environment.',
    'P8.6': 'Add local services setup: create docker-compose.yml for local dependencies (Postgres, Redis, etc.).',
    // M14: new check remediation actions
    'P1.9': 'Add AGENTS.md validation: CI job or pre-commit hook that checks AGENTS.md commands work.',
    'P2.10': 'Add flaky test detection: install vitest-retry/pytest-rerunfailures or configure flaky test tracking.',
    'P2.11': 'Add test performance tracking: configure --verbose/--durations flags or integrate test analytics platform.',
    'P3.7': 'Install and authenticate gh CLI: run `gh auth login` to enable gh-based checks.',
    'P3.8': 'Add monorepo tooling: configure npm/pnpm workspaces, Turborepo, Nx, or Lerna.',
    'P3.9': 'Add version drift detection: install syncpack/manypkg or configure Renovate grouping rules.',
    'P3.10': 'Add minimum release age policy: configure Renovate minimumReleaseAge or document dependency delay policy.',
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
    'P5.15': 'Add dead feature flag detection: configure stale flag detection in your feature flag platform.',
    'P5.16': 'Add heavy dependency detection: install bundle analyzer or size-limit tool.',
    'P6.6': 'Enable branch protection: configure GitHub rulesets for main branch (require PRs, reviews).',
    'P6.7': 'Add automated security review: configure CodeQL, Semgrep, or Snyk in CI.',
    'P6.8': 'Add privacy compliance: install consent management SDK or document GDPR/CCPA handling.',
    'P6.9': 'Add DAST scanning: configure OWASP ZAP or Nuclei in CI against staging.',
    'P7.10': 'Add alerting: configure PagerDuty/OpsGenie or custom alert rules.',
    'P7.11': 'Add deployment observability: link to monitoring dashboards in docs or configure deploy notifications.',
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
  const sevRank: Record<string, number> = { high: 0, med: 1, low: 2 };
  const diffRank: Record<string, number> = { basic: 0, intermediate: 1, advanced: 2 };
  const punchlist: PunchItem[] = findings
    .filter((c) => !c.pass && !c.skipped)
    .sort((a, b) => (sevRank[a.severity] ?? 3) - (sevRank[b.severity] ?? 3) || (diffRank[a.difficulty || 'intermediate'] ?? 1) - (diffRank[b.difficulty || 'intermediate'] ?? 1))
    .slice(0, 10)
    .map((c) => ({ pillar: c.pillar, id: c.id, severity: c.severity, difficulty: c.difficulty || 'intermediate', action: actionById[c.id] || 'No mapped remediation', evidence: c.evidence }));

  return {
    rubric_version: RUBRIC_VERSION,
    config_hash: configHash(root),
    repo: { path: root, language: detectLanguage(root) },
    apps: Object.fromEntries(apps.map((a) => [a.path, { name: a.name, type: a.type, description: a.description }])),
    pillars,
    weights,
    overall: Math.round(overall * 1000) / 10,
    droidPassRate,
    level,
    judgment: [], // filled by the skill/extension narrative pass; excluded from score.
    punchlist,
    run: { date: new Date().toISOString(), model: opts.model || 'unknown', strict: !!opts.strict, ...gitProvenance(root) },
    findings,
  };
}

export function renderMarkdown(report: ReadinessReport): string {
  const rows = Object.keys(report.pillars).map((p) => {
    const ps = report.pillars[p];
    const perApp = ps.perApp ? ` (${Object.entries(ps.perApp).map(([app, v]) => `${app}:${v.passed}/${v.total}`).join(', ')})` : '';
    return `| ${p} | ${ps.passed}/${ps.total} | ${ps.pct}%${perApp} |`;
  }).join('\n');
  const punch = report.punchlist.length ? report.punchlist.map((p) => `- [${p.severity}/${p.difficulty}] ${p.pillar} ${p.id}: ${p.action} (${p.evidence})`).join('\n') : '- none';
  const commit = report.run.commitHash ? ` · commit ${report.run.commitHash.slice(0, 8)} (${report.run.branch})` : '';
  const appList = Object.keys(report.apps).length > 1
    ? `\n\n## Applications discovered\n${Object.entries(report.apps).map(([p, a]) => `- \`${p}\` — ${a.name} (${a.type})${a.description ? ': ' + a.description : ''}`).join('\n')}`
    : '';
  return `# Agent Readiness Report\n\n- Level: **${report.level}**\n- Overall: **${report.overall}/100** (weighted, N-1 gated)\n- Droid-compatible pass rate: **${report.droidPassRate}%** (flat, all signals weighted equally)\n- rubric_version: ${report.rubric_version} · config_hash: ${report.config_hash}\n- repo: ${report.repo.path} (${report.repo.language})${commit}\n\n## Pillars\n| Pillar | Passed/Total | Pct (per-app) |\n|---|---|---|\n${rows}\n\n## Top Punchlist (severity → difficulty)\n${punch}${appList}\n\n_Run ${report.run.date} · model ${report.run.model} · strict=${report.run.strict}_\n`;
}

export function writeReport(root: string, report: ReadinessReport, targetDir?: string): string {
  const dir = targetDir || path.join(root, '.agent-readiness');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'report.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(dir, 'report.md'), renderMarkdown(report));
  try { appendHistory(report, root, dir); } catch { /* history is best-effort */ }
  return dir;
}

export { getPillars };
export { agentPromptFor, assessmentPromptFor } from './fix.ts';
export { CRITERIA_REGISTRY, getCriterionByPiId, getAgentOnlyCriteria } from './criteria-registry.ts';
