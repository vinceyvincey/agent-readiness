// agent-readiness deterministic engine (single source of truth for E1 numeric score).
import { getPillars, type Repo, type CheckResult, DIFFICULTY, type Difficulty } from './checks.ts';
import { discoverApps, type App } from './discover.ts';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { appendHistory } from './history.ts';

export const RUBRIC_VERSION = '0.3.0';

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
  const dt = checks.filter((c) => c.id && c.pass !== undefined);
  const passed = dt.filter((c) => c.pass).length;
  const total = dt.length || 1;
  return { passed, total, pct: Math.round((passed / total) * 1000) / 10 };
}

export function runReadiness(root: string, opts: { weights?: Record<string, number>; model?: string; strict?: boolean } = {}): ReadinessReport {
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
  const overall = getPillars().reduce((a, p) => a + (pillars[p.id].pct / 100) * weights[p.id], 0);

  // Level resolution via N-1 gating across the level's required pillars.
  const level = resolveLevel(pillars);

  const actionById: Record<string, string> = {
    'P0.1': 'Write a real README with substantive content (>200 chars, >=2 content lines).',
    'P0.2': 'Add a run/usage/quickstart section to README.',
    'P0.3': 'Add a docs/ directory or ARCHITECTURE.md.',
    'P0.6': 'Add an H1 title to README.',
    'P1.1': 'Create AGENTS.md with substantive setup + behavior rules (>=2 content lines).',
    'P1.2': 'Add enforceable rules (must/always/never) AND verified commands (matching real scripts) to AGENTS.md.',
    'P1.4': 'Add MCP config (mcp.json) or CLAUDE.md for agent context.',
    'P1.6': 'Add lifecycle hooks (.factory/hooks.json or hooks in settings).',
    'P1.7': 'Add custom droids/subagents (.factory/droids or .pi/fabric/droids).',
    'P1.8': 'Add connector integrations (.factory/connectors.json).',
    'P2.1': 'Add a test directory and at least one real test.',
    'P2.2': 'Configure a test runner (jest/vitest/pytest).',
    'P2.3': 'Add a run-test one-liner (npm test / make test).',
    'P2.4': 'Configure a coverage threshold > 0 (not decorative).',
    'P2.6': 'Add a fast/smoke test path (test:fast script, vitest testPathIgnorePatterns, etc.).',
    'P3.1': 'Commit a lockfile for reproducible builds.',
    'P3.2': 'Document/add a build step.',
    'P4.1': 'Add a CI workflow (.github/workflows).',
    'P4.2': 'Add a real test invocation in CI (not just echo stubs).',
    'P5.1': 'Configure a linter (eslint/biome/ruff/golangci).',
    'P5.3': 'Configure a type checker (tsconfig/mypy/pyright/go vet/cargo).',
    'P6.1': 'Harden .gitignore to cover .env, keys, caches (>=3 patterns).',
    'P6.2': 'Remove committed secrets from tracked files.',
    'P6.4': 'Wire a vulnerability scan (npm audit / pip-audit / gitleaks).',
    'P8.1': 'Add .env.example listing required env vars.',
    'P8.2': 'Add a one-command setup script.',
  };
  const sevRank: Record<string, number> = { high: 0, med: 1, low: 2 };
  const diffRank: Record<string, number> = { basic: 0, intermediate: 1, advanced: 2 };
  const punchlist: PunchItem[] = findings
    .filter((c) => !c.pass)
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
  return `# Agent Readiness Report\n\n- Level: **${report.level}**\n- Overall: **${report.overall}/100**\n- rubric_version: ${report.rubric_version} · config_hash: ${report.config_hash}\n- repo: ${report.repo.path} (${report.repo.language})${commit}\n\n## Pillars\n| Pillar | Passed/Total | Pct (per-app) |\n|---|---|---|\n${rows}\n\n## Top Punchlist (severity → difficulty)\n${punch}${appList}\n\n_Run ${report.run.date} · model ${report.run.model} · strict=${report.run.strict}_\n`;
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
export { agentPromptFor } from './fix.ts';
